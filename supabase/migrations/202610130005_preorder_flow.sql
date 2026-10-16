-- Fase 5: modul pre-order (batch, DP, pelunasan, konversi alokasi saat barang datang).
--
-- Keputusan desain:
-- 1. Pre-order punya order sendiri, tidak dicampur dengan pesanan stok reguler. Harga batch,
--    jadwal pembayaran (DP atau lunas), dan waktu kedatangan berbeda dari barang ready-stok,
--    sehingga satu baris pembayaran tidak boleh mewakili dua jadwal penyelesaian yang berbeda.
-- 2. Kuota batch dikunci pada baris batch (`FOR UPDATE`) dan dijaga constraint
--    `reserved_quantity + ordered_quantity <= quota`, jadi permintaan bersamaan tidak bisa
--    melewati kuota tanpa menyentuh `stock_levels`.
-- 3. Satu baris `payments` punya kolom `purpose` sehingga satu order bisa punya transaksi
--    Midtrans terpisah (DP dan pelunasan) yang tetap tertaut ke order yang sama lewat
--    `provider_order_id` berbeda: nomor order untuk DP, nomor order + "-BAL" untuk pelunasan.
-- 4. Barang datang selalu diterima di lokasi STORE, lalu unit yang sudah dijanjikan
--    direservasi ulang dari STORE. Sisa penerimaan otomatis menjadi stok reguler yang bisa
--    dijual, sehingga ledger mencatat "berapa datang,berapa dialokasikan,berapa jadi jualan".
-- 5. Perpindahan status pre-order dicatat di `preorder_item_status_history` lewat trigger,
--    sehingga mesin status bisa ditunjukkan di BAB IV tanpa query manual.

create type public.payment_purpose as enum ('regular', 'preorder_deposit', 'preorder_balance');

alter table public.payments
  add column purpose public.payment_purpose not null default 'regular';

-- Nominal DP dan sisa pelunasan disimpan per baris pesanan supaya angkanya tetap utuh
-- walau harga varian atau pengaturan batch diubah kemudian.
alter table public.order_items
  add column deposit_amount numeric(12, 2) check (deposit_amount is null or deposit_amount >= 0),
  add column balance_amount numeric(12, 2) check (balance_amount is null or balance_amount >= 0);

-- Bukti penerimaan barang dari supplier.
alter table public.preorder_batches
  add column received_quantity integer not null default 0 check (received_quantity >= 0),
  add column received_at timestamptz,
  add column received_by uuid references public.profiles(id) on delete set null,
  add column received_note text;

alter table public.preorder_batches
  add constraint preorder_batches_received_at_check
    check (received_quantity = 0 or received_at is not null);

create table public.preorder_item_status_history (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  old_status public.preorder_status,
  new_status public.preorder_status not null,
  note text,
  changed_at timestamptz not null default now()
);

create index preorder_item_history_item_idx
  on public.preorder_item_status_history (order_item_id, changed_at);

alter table public.preorder_item_status_history enable row level security;

revoke all on table public.preorder_item_status_history from public, anon, authenticated;

create function public.record_preorder_item_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preorder_status is distinct from old.preorder_status then
    insert into public.preorder_item_status_history (order_item_id, old_status, new_status)
    values (new.id, old.preorder_status, new.preorder_status);
  end if;
  return new;
end;
$$;

create trigger order_items_record_preorder_status
  after update of preorder_status on public.order_items
  for each row execute function public.record_preorder_item_status();

-- Menyiapkan transaksi pembayaran untuk order pre-order: DP (atau lunas untuk skema full).
-- Baris pembayaran memakai `purpose` berbeda agar DP dan pelunasan bisa hidup berdampingan
-- pada order yang sama tanpa saling menimpa.
create function public.create_preorder_deposit_payment(p_order_id uuid)
returns table (
  payment_id uuid,
  provider_order_id text,
  amount numeric,
  purpose public.payment_purpose,
  item_details jsonb,
  customer_details jsonb,
  reservation_expires_at timestamptz
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
  deposit_total numeric(12, 2);
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
    raise exception 'preorder reservation has expired';
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

  -- Total DP dihitung dari kolom snapshot order, bukan dari harga batch saat ini.
  select coalesce(sum(oi.deposit_amount), 0)
    into deposit_total
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;

  if deposit_total <= 0 then
    raise exception 'order has no preorder deposit';
  end if;

  insert into public.payments (
    order_id, provider, provider_order_id, amount, status, purpose
  ) values (
    order_record.id, 'midtrans', order_record.order_number, deposit_total, 'pending',
    'preorder_deposit'
  )
  on conflict (provider_order_id) do update
    set amount = excluded.amount
    where public.payments.purpose = 'preorder_deposit'
      and public.payments.status = 'pending'
  returning * into payment_record;

  if not found then
    select * into payment_record
    from public.payments
    where provider_order_id = order_record.order_number
      and purpose = 'preorder_deposit'
    for update;
    if not found then
      raise exception 'deposit payment row could not be prepared';
    end if;
    if payment_record.status = 'settlement' then
      raise exception 'deposit is already paid';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.sku_snapshot,
      'price', oi.deposit_amount,
      'quantity', oi.quantity,
      'name', 'DP ' || oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
    ) order by oi.id), '[]'::jsonb)
    into item_rows
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;

  if order_record.shipping_fee > 0 then
    item_rows := item_rows || jsonb_build_array(jsonb_build_object(
      'id', 'SHIPPING',
      'price', order_record.shipping_fee,
      'quantity', 1,
      'name', 'Ongkos kirim'
    ));
  end if;

  return query
  select
    payment_record.id,
    payment_record.provider_order_id,
    payment_record.amount,
    payment_record.purpose,
    item_rows,
    jsonb_build_object(
      'first_name', coalesce(nullif(btrim(coalesce(customer_name, '')), ''), 'Pelanggan'),
      'email', customer_email,
      'phone', nullif(btrim(coalesce(customer_phone, '')), '')
    ),
    order_record.reservation_expires_at;
end;
$$;

-- Transaksi pelunasan terpisah yang tertaut ke order yang sama.
-- `provider_order_id` memakai suffix "-BAL" supaya Midtrans melihat order id berbeda,
-- sementara `order_id` tetap menunjuk pesanan pre-order yang sama.
create function public.create_preorder_balance_payment(p_order_id uuid)
returns table (
  payment_id uuid,
  provider_order_id text,
  amount numeric,
  purpose public.payment_purpose,
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
  balance_total numeric(12, 2);
  provider_order_id text;
  item_rows jsonb;
begin
  select * into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Pelunasan hanya dibuka setelah barang datang dan DP sudah lunas.
  if order_record.status not in ('paid', 'processing') then
    raise exception 'deposit is not settled yet';
  end if;

  if exists (
    select 1 from public.order_items oi
    where oi.order_id = order_record.id
      and oi.preorder_status <> 'awaiting_balance'
  ) then
    raise exception 'preorder items are not ready for the final payment';
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

  select coalesce(sum(oi.balance_amount), 0)
    into balance_total
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;

  if balance_total <= 0 then
    raise exception 'order has no remaining balance';
  end if;

  provider_order_id := order_record.order_number || '-BAL';

  insert into public.payments (
    order_id, provider, provider_order_id, amount, status, purpose
  ) values (
    order_record.id, 'midtrans', provider_order_id, balance_total, 'pending',
    'preorder_balance'
  )
  on conflict (provider_order_id) do update
    set amount = excluded.amount
    where public.payments.purpose = 'preorder_balance'
      and public.payments.status = 'pending'
  returning * into payment_record;

  if not found then
    select * into payment_record
    from public.payments
      where public.payments.provider_order_id = create_preorder_balance_payment.provider_order_id
      and purpose = 'preorder_balance'
    for update;
    if not found then
      raise exception 'balance payment row could not be prepared';
    end if;
    if payment_record.status = 'settlement' then
      raise exception 'balance is already paid';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.sku_snapshot,
      'price', oi.balance_amount,
      'quantity', oi.quantity,
      'name', 'Pelunasan ' || oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
    ) order by oi.id), '[]'::jsonb)
    into item_rows
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;

  return query
  select
    payment_record.id,
    payment_record.provider_order_id,
    payment_record.amount,
    payment_record.purpose,
    item_rows,
    jsonb_build_object(
      'first_name', coalesce(nullif(btrim(coalesce(customer_name, '')), ''), 'Pelanggan'),
      'email', customer_email,
      'phone', nullif(btrim(coalesce(customer_phone, '')), '')
    );
end;
$$;
