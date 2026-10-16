-- Fase 4: pembayaran Midtrans (Snap token + webhook notification) dan siklus status pesanan.
--
-- Keputusan desain:
-- 1. Verifikasi signature_key (SHA512) dan rate limiting webhook dilakukan di server Next.js,
--    bukan di database, karena server key tidak boleh pernah masuk ke Postgres.
-- 2. Idempotensi webhook dijaga oleh tabel ledger `payment_notifications` dengan
--    `deduplication_key` unik. Notifikasi ganda yang masuk bersamaan: satu transaksi Postgres
--    menang, transaksi lain menunggu lalu melihat conflict sehingga tidak memproses dua kali.
-- 3. Semua efek samping (status pembayaran, status pesanan, stok) terjadi di dalam satu
--    fungsi transaksional, sehingga kegagalan di tengah tidak meninggalkan status setengah jadi.
-- 4. `gross_amount` dari notifikasi dicocokkan dengan `payments.amount` yang dihitung server,
--    sehingga payload yang ditotal ulang tidak dapat mengubah nilai pembayaran.

-- Rate limiting dasar per sumber webhook. IP webhook di-hash di server Next.js, sehingga
-- tidak ada data pribadi mentah yang tersimpan di database.
create table public.payment_webhook_rate_limits (
  source_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.payment_webhook_rate_limits enable row level security;
revoke all on table public.payment_webhook_rate_limits from public, anon, authenticated;

create index payment_notifications_received_idx
  on public.payment_notifications (received_at desc);

-- Peta status Midtrans ke status pembayaran internal TIDAK dibuat di SQL.
-- Peta dibuat di TypeScript (`src/lib/midtrans/status-map.ts`) supaya bisa diuji unit test,
-- dan RPC `apply_payment_notification` menerima hasil pemetaan itu sebagai enum
-- `public.payment_status`. Status mentah Midtrans tetap tersimpan utuh di
-- `payment_notifications.payload` sebagai bukti audit.

-- Mengembalikan stok untuk pesanan yang direfund. Aman dipanggil berulang karena hanya satu
-- baris movement `return` per order item yang diizinkan.
create function public.restore_stock_for_refund(p_order_id uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  restored_count integer := 0;
begin
  perform 1 from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  for reservation in
    select r.id, r.variant_id, r.location_code, r.quantity, r.order_item_id
    from public.stock_reservations r
    where r.order_id = p_order_id and r.status = 'consumed'
    order by r.variant_id, r.location_code
    for update
  loop
    if exists (
      select 1
      from public.stock_movements m
      where m.order_id = p_order_id
        and m.reference_id = reservation.order_item_id
        and m.movement_type = 'return'
    ) then
      continue;
    end if;

    update public.stock_levels
      set on_hand = on_hand + reservation.quantity, updated_at = now()
      where variant_id = reservation.variant_id
        and location_code = reservation.location_code;
    if not found then
      raise exception 'stock level not found for refund of variant %', reservation.variant_id;
    end if;

    insert into public.stock_movements (
      variant_id, location_code, movement_type, quantity_delta, order_id, reference_id, note
    ) values (
      reservation.variant_id, reservation.location_code, 'return',
      reservation.quantity, p_order_id, reservation.order_item_id, p_note
    );
    restored_count := restored_count + 1;
  end loop;

  return restored_count;
end;
$$;

-- Menyiapkan satu baris pembayaran untuk order yang menunggu pembayaran.
-- Nomor pesanan dipakai sebagai `provider_order_id` agar Midtrans dan database memakai
-- satu identitas order. Baris pembayaran pending yang sudah ada dipakai ulang, sehingga
-- pelanggan dapat membuka Snap lebih dari sekali tanpa membuat transaksi ganda.
create function public.create_order_payment(p_order_id uuid)
returns table (
  payment_id uuid,
  provider_order_id text,
  amount numeric,
  reservation_expires_at timestamptz,
  item_details jsonb,
  customer_details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  payment_record public.payments%rowtype;
  customer_email text;
  customer_name text;
  customer_phone text;
  item_rows jsonb;
begin
  select * into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;

  if order_record.status <> 'pending_payment' then
    raise exception 'order is not awaiting payment';
  end if;

  if order_record.reservation_expires_at is null
    or order_record.reservation_expires_at <= now() then
    raise exception 'stock reservation has expired';
  end if;

  select p.email, p.full_name
    into customer_email, customer_name
  from public.profiles p
  where p.id = order_record.customer_id;

  if order_record.fulfillment_method = 'shipping' then
    customer_name := coalesce(
      order_record.shipping_address_snapshot ->> 'recipient_name', customer_name
    );
    customer_phone := order_record.shipping_address_snapshot ->> 'phone';
  end if;

  -- Baris item Snap dibangun dari snapshot order; totalnya sama dengan `orders.total`
  -- karena ongkir ditambahkan sebagai item tersendiri.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.sku_snapshot,
      'price', oi.unit_price,
      'quantity', oi.quantity,
      'name', oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
    ) order by oi.id), '[]'::jsonb)
    into item_rows
  from public.order_items oi
  where oi.order_id = order_record.id;

  if order_record.shipping_fee > 0 then
    item_rows := item_rows || jsonb_build_array(jsonb_build_object(
      'id', 'SHIPPING',
      'price', order_record.shipping_fee,
      'quantity', 1,
      'name', 'Ongkos kirim'
    ));
  end if;

  insert into public.payments (order_id, provider, provider_order_id, amount, status)
  values (order_record.id, 'midtrans', order_record.order_number, order_record.total, 'pending')
  on conflict (provider_order_id) do update
    set amount = excluded.amount
    where public.payments.status = 'pending'
  returning * into payment_record;

  if not found then
    select * into payment_record
    from public.payments
    where provider_order_id = order_record.order_number
    for update;
    if not found then
      raise exception 'payment row could not be prepared';
    end if;
    if payment_record.status = 'settlement' then
      raise exception 'order is already paid';
    end if;
  end if;

  return query
  select
    payment_record.id,
    payment_record.provider_order_id,
    payment_record.amount,
    order_record.reservation_expires_at,
    item_rows,
    jsonb_build_object(
      'first_name', coalesce(nullif(btrim(coalesce(customer_name, '')), ''), 'Pelanggan'),
      'email', customer_email,
      'phone', nullif(btrim(coalesce(customer_phone, '')), '')
    );
end;
$$;


-- Satu-satunya jalan masuk untuk notifikasi pembayaran (webhook maupun pengecekan status).
-- Mengembalikan `outcome` sehingga Next.js bisa menjawab 200 tanpa melakukan efek dua kali.
create function public.apply_payment_notification(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_transaction_status text,
  p_fraud_status text,
  p_payment_type text,
  p_payment_status public.payment_status,
  p_gross_amount numeric,
  p_paid_at timestamptz,
  p_deduplication_key text,
  p_payload jsonb
)
returns table (
  outcome text,
  order_status public.order_status,
  payment_status public.payment_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  order_record public.orders%rowtype;
  mapped_status public.payment_status := p_payment_status;
  notification_id uuid;
  result_outcome text := 'applied';
  conflicting_payment uuid;
  transaction_id text := nullif(btrim(coalesce(p_provider_transaction_id, '')), '');
begin
  if p_deduplication_key is null or btrim(p_deduplication_key) = '' then
    raise exception 'notification needs a deduplication key';
  end if;

  select * into payment_record
  from public.payments
  where provider_order_id = p_provider_order_id
  for update;

  if not found then
    -- Order belum pernah membuka Snap. Notifikasi tetap dicatat agar tidak diulang,
    -- tetapi tidak ada efek apa pun karena tidak ada pembayaran yang bisa dicocokkan.
    insert into public.payment_notifications (payment_id, deduplication_key, payload)
    values (null, p_deduplication_key, p_payload)
    on conflict (deduplication_key) do nothing;
    return query
    select 'unknown_payment'::text, null::public.order_status, null::public.payment_status;
    return;
  end if;

  -- Kunci idempotensi. Notifikasi identik kedua gagal insert di sini dan keluar lebih awal.
  insert into public.payment_notifications (payment_id, deduplication_key, payload)
  values (payment_record.id, p_deduplication_key, p_payload)
  on conflict (deduplication_key) do nothing
  returning id into notification_id;

  if notification_id is null then
    return query
    select
      'duplicate'::text,
      (select o.status from public.orders o where o.id = payment_record.order_id),
      payment_record.status;
    return;
  end if;

  select * into order_record
  from public.orders
  where id = payment_record.order_id
  for update;
  if not found then
    return query
    select 'order_missing'::text, null::public.order_status, payment_record.status;
    return;
  end if;

  -- Status Midtrans sudah dipetakan ke enum `public.payment_status` di server Next.js
  -- (`src/lib/midtrans/status-map.ts`) sehingga pemetaan bisa diuji unit test.
  if mapped_status is null then
    raise exception 'notification needs a mapped payment status';
  end if;

  if round(coalesce(p_gross_amount, -1), 2) <> round(payment_record.amount, 2) then
    return query
    select 'amount_mismatch'::text, order_record.status, payment_record.status;
    return;
  end if;

  -- Nilai transaksi Midtrans bisa sudah dipakai baris pembayaran lain; bila terjadi konflik,
  -- status tetap diperbarui tetapi id transaksi tidak ditimpa.
  select id into conflicting_payment
  from public.payments
  where provider_transaction_id = transaction_id
    and id <> payment_record.id;

  update public.payments
  set status = mapped_status,
      provider_transaction_id = case
        when conflicting_payment is null then transaction_id
        else public.payments.provider_transaction_id
      end,
      payment_type = coalesce(
        nullif(btrim(coalesce(p_payment_type, '')), ''), public.payments.payment_type
      ),
      paid_at = case
        when mapped_status = 'settlement' then coalesce(p_paid_at, now())
        else public.payments.paid_at
      end
  where id = payment_record.id;

  if mapped_status = 'settlement' then
    if order_record.status = 'pending_payment' then
      update public.orders
      set status = 'paid'
      where id = order_record.id and status = 'pending_payment';
      -- Mengubah reservasi menjadi penjualan: on_hand dan reserved_qty turun bersama.
      perform public.confirm_stock_reservation(order_record.id);
      perform public.confirm_preorder_reservation(order_record.id);
    elsif order_record.status in ('paid', 'processing') then
      -- Jalur pemulihan: pembayaran sudah tercatat tetapi stok belum dikonfirmasi.
      perform public.confirm_stock_reservation(order_record.id);
      perform public.confirm_preorder_reservation(order_record.id);
      result_outcome := 'recovered';
    else
      result_outcome := 'ignored_order_status';
    end if;
  elsif mapped_status in ('expire', 'cancel', 'deny') then
    if order_record.status = 'pending_payment' then
      perform public.release_stock_reservation(
        order_record.id,
        'Midtrans ' || upper(coalesce(p_transaction_status, 'UNKNOWN'))
      );
      perform public.release_preorder_reservation(order_record.id);
      update public.orders
      set status = 'cancelled'
      where id = order_record.id and status = 'pending_payment';
    else
      result_outcome := 'ignored_order_status';
    end if;
  elsif mapped_status in ('refund', 'partial_refund') then
    if order_record.status in ('paid', 'processing', 'shipped', 'ready_for_pickup', 'completed') then
      perform public.restore_stock_for_refund(
        order_record.id,
        'Midtrans ' || upper(coalesce(p_transaction_status, 'REFUND'))
      );
      update public.orders
      set status = 'refunded'
      where id = order_record.id
        and status in ('paid', 'processing', 'shipped', 'ready_for_pickup', 'completed');
    else
      result_outcome := 'ignored_order_status';
    end if;
  else
    -- pending atau challenge: pembayaran belum selesai, status pesanan dibiarkan.
    result_outcome := 'applied_without_order_change';
  end if;

  return query
  select
    result_outcome,
    (select o.status from public.orders o where o.id = order_record.id),
    (select py.status from public.payments py where py.id = payment_record.id);
end;
$$;

-- Rate limiting dasar per sumber. IP webhook di-hash di server Next.js agar tidak ada
-- data pribadi mentah yang tersimpan di database.
create function public.consume_webhook_rate_limit(p_source_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
begin
  if p_source_key is null or btrim(p_source_key) = '' then
    return false;
  end if;

  insert into public.payment_webhook_rate_limits (source_key, window_started_at, request_count)
  values (p_source_key, now(), 1)
  on conflict (source_key) do update
  set
    window_started_at = case
      when public.payment_webhook_rate_limits.window_started_at <= now() - interval '1 minute' then now()
      else public.payment_webhook_rate_limits.window_started_at
    end,
    request_count = case
      when public.payment_webhook_rate_limits.window_started_at <= now() - interval '1 minute' then 1
      else public.payment_webhook_rate_limits.request_count + 1
    end
  returning public.payment_webhook_rate_limits.request_count into request_count;

  return request_count <= 240;
end;
$$;

revoke all on function public.create_order_payment(uuid) from public, anon, authenticated;
revoke all on function public.apply_payment_notification(text, text, text, text, text, public.payment_status, numeric, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.restore_stock_for_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_webhook_rate_limit(text) from public, anon, authenticated;

grant execute on function public.create_order_payment(uuid) to service_role;
grant execute on function public.apply_payment_notification(text, text, text, text, text, public.payment_status, numeric, timestamptz, text, jsonb) to service_role;
grant execute on function public.restore_stock_for_refund(uuid, text) to service_role;
grant execute on function public.consume_webhook_rate_limit(text) to service_role;
