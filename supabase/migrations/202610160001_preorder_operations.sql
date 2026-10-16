create index payments_order_purpose_created_idx
  on public.payments (order_id, purpose, created_at desc);

create policy "preorder_item_history_owner_or_staff_read"
  on public.preorder_item_status_history for select to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );

grant select on public.preorder_item_status_history to authenticated;

create function public.create_preorder_order(
  p_customer_id uuid,
  p_batch_id uuid,
  p_quantity integer,
  p_fulfillment_method public.fulfillment_method,
  p_pickup_store_location_id uuid,
  p_shipping_address jsonb,
  p_expires_at timestamptz
)
returns table (
  order_id uuid,
  order_number text,
  subtotal numeric,
  shipping_fee numeric,
  total numeric,
  initial_payment_amount numeric,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_record public.preorder_batches%rowtype;
  variant_record public.product_variants%rowtype;
  created_order_id uuid := gen_random_uuid();
  created_order_number text;
  created_order_item_id uuid;
  shipping_address_id uuid;
  shipping_snapshot jsonb;
  selected_store_id uuid;
  selected_store_name text;
  selected_zone_name text;
  selected_distance_km numeric;
  calculated_subtotal numeric(12, 2);
  calculated_shipping_fee numeric(12, 2) := 0;
  calculated_initial_payment numeric(12, 2);
  unit_deposit numeric(12, 2);
  unit_balance numeric(12, 2);
  product_name text;
begin
  if p_customer_id is null or p_batch_id is null
    or p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    raise exception 'invalid preorder request';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception 'preorder reservation expiry must be within fifteen minutes';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_customer_id and p.role = 'customer'
  ) then
    raise exception 'customer profile is unavailable';
  end if;

  select * into batch_record
  from public.preorder_batches
  where id = p_batch_id
  for update;
  if not found
    or batch_record.status <> 'open'
    or now() < batch_record.opens_at
    or now() >= batch_record.closes_at
    or batch_record.quota - batch_record.reserved_quantity - batch_record.ordered_quantity < p_quantity then
    raise exception 'preorder batch is not open or has insufficient quota';
  end if;
  if batch_record.price * p_quantity > 9999999999.99 then
    raise exception 'preorder total exceeds the supported order amount';
  end if;

  select * into variant_record
  from public.product_variants
  where id = batch_record.variant_id and is_active
  for share;
  if not found then
    raise exception 'preorder variant is unavailable';
  end if;

  select p.name into product_name
  from public.products p
  where p.id = variant_record.product_id and p.is_active
  for share;
  if not found then
    raise exception 'preorder product is unavailable';
  end if;

  if p_fulfillment_method = 'shipping' then
    if p_pickup_store_location_id is not null
      or jsonb_typeof(p_shipping_address) is distinct from 'object'
      or nullif(btrim(p_shipping_address ->> 'recipient_name'), '') is null
      or nullif(btrim(p_shipping_address ->> 'phone'), '') is null
      or nullif(btrim(p_shipping_address ->> 'address_line'), '') is null
      or nullif(btrim(p_shipping_address ->> 'city'), '') is null
      or nullif(btrim(p_shipping_address ->> 'province'), '') is null
      or nullif(btrim(p_shipping_address ->> 'postal_code'), '') is null
      or nullif(p_shipping_address ->> 'latitude', '') is null
      or nullif(p_shipping_address ->> 'longitude', '') is null then
      raise exception 'delivery address is required';
    end if;

    if (p_shipping_address ->> 'latitude')::double precision not between -90 and 90
      or (p_shipping_address ->> 'longitude')::double precision not between -180 and 180 then
      raise exception 'delivery coordinates are invalid';
    end if;

    select q.store_location_id, q.store_name, q.zone_name, q.distance_km, q.shipping_fee
    into selected_store_id, selected_store_name, selected_zone_name,
      selected_distance_km, calculated_shipping_fee
    from public.get_shipping_quote(
      (p_shipping_address ->> 'latitude')::double precision,
      (p_shipping_address ->> 'longitude')::double precision
    ) q;
    if not found then
      raise exception 'no active shipping zone covers this address';
    end if;

    insert into public.shipping_addresses (
      user_id, recipient_name, phone, address_line, city, province, postal_code,
      latitude, longitude
    ) values (
      p_customer_id,
      btrim(p_shipping_address ->> 'recipient_name'),
      btrim(p_shipping_address ->> 'phone'),
      btrim(p_shipping_address ->> 'address_line'),
      btrim(p_shipping_address ->> 'city'),
      btrim(p_shipping_address ->> 'province'),
      btrim(p_shipping_address ->> 'postal_code'),
      (p_shipping_address ->> 'latitude')::double precision,
      (p_shipping_address ->> 'longitude')::double precision
    )
    returning id into shipping_address_id;

    shipping_snapshot := jsonb_build_object(
      'recipient_name', btrim(p_shipping_address ->> 'recipient_name'),
      'phone', btrim(p_shipping_address ->> 'phone'),
      'address_line', btrim(p_shipping_address ->> 'address_line'),
      'city', btrim(p_shipping_address ->> 'city'),
      'province', btrim(p_shipping_address ->> 'province'),
      'postal_code', btrim(p_shipping_address ->> 'postal_code'),
      'latitude', (p_shipping_address ->> 'latitude')::double precision,
      'longitude', (p_shipping_address ->> 'longitude')::double precision,
      'shipping_store_location_id', selected_store_id,
      'shipping_store_name', selected_store_name,
      'shipping_zone_name', selected_zone_name,
      'distance_km', selected_distance_km
    );
  elsif p_fulfillment_method = 'pickup' then
    if p_shipping_address is not null or p_pickup_store_location_id is null then
      raise exception 'select an active pickup store';
    end if;
    select s.id into selected_store_id
    from public.store_locations s
    where s.id = p_pickup_store_location_id and s.is_active
    for share;
    if not found then
      raise exception 'pickup store is not active';
    end if;
  else
    raise exception 'invalid fulfillment method';
  end if;

  calculated_subtotal := batch_record.price * p_quantity;
  if calculated_subtotal + calculated_shipping_fee > 9999999999.99 then
    raise exception 'preorder total exceeds the supported order amount';
  end if;
  if batch_record.payment_plan = 'full' then
    unit_deposit := batch_record.price;
    unit_balance := 0;
  else
    if batch_record.price < 2 then
      raise exception 'deposit preorder price must be at least two';
    end if;
    unit_deposit := greatest(
      1,
      least(
        batch_record.price - 1,
        round(batch_record.price * batch_record.deposit_percent / 100, 0)
      )
    );
    unit_balance := batch_record.price - unit_deposit;
  end if;
  calculated_initial_payment := unit_deposit * p_quantity + calculated_shipping_fee;
  created_order_number := 'RSH-PO-' || to_char(now(), 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (
    id, order_number, customer_id, fulfillment_method, pickup_store_location_id,
    shipping_address_id, shipping_address_snapshot, subtotal, shipping_fee, total,
    reservation_expires_at
  ) values (
    created_order_id, created_order_number, p_customer_id, p_fulfillment_method,
    case when p_fulfillment_method = 'pickup' then selected_store_id else null end,
    shipping_address_id, shipping_snapshot, calculated_subtotal,
    calculated_shipping_fee, calculated_subtotal + calculated_shipping_fee, p_expires_at
  );

  insert into public.order_items (
    order_id, variant_id, preorder_batch_id, preorder_status,
    product_name_snapshot, variant_label_snapshot, sku_snapshot, quantity,
    unit_price, deposit_amount, balance_amount
  ) values (
    created_order_id, variant_record.id, batch_record.id, 'awaiting_deposit',
    product_name, 'Ukuran ' || variant_record.size || ' / ' || variant_record.color,
    variant_record.sku, p_quantity, batch_record.price,
    unit_deposit * p_quantity, unit_balance * p_quantity
  ) returning id into created_order_item_id;

  perform public.reserve_preorder_quota(
    created_order_id, created_order_item_id, batch_record.id, p_quantity, p_expires_at
  );

  return query
  select created_order_id, created_order_number, calculated_subtotal,
    calculated_shipping_fee, calculated_subtotal + calculated_shipping_fee,
    calculated_initial_payment, p_expires_at;
end;
$$;

create function public.create_preorder_batch(
  p_actor_id uuid,
  p_variant_id uuid,
  p_name text,
  p_quota integer,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_estimated_arrival date,
  p_price numeric,
  p_payment_plan public.preorder_payment_plan,
  p_deposit_percent numeric,
  p_initial_status public.preorder_batch_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_batch_id uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;
  if p_name is null or length(btrim(p_name)) not between 3 and 120
    or p_quota is null or p_quota not between 1 and 100000
    or p_price is null or p_price <= 0
    or p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at
    or p_estimated_arrival is null or p_estimated_arrival < current_date
    or p_initial_status is null or p_initial_status not in ('draft', 'open') then
    raise exception 'invalid preorder batch settings';
  end if;
  if p_payment_plan = 'deposit' then
    if p_price < 2 or p_deposit_percent is null
      or p_deposit_percent <= 0 or p_deposit_percent >= 100 then
      raise exception 'invalid preorder deposit settings';
    end if;
  elsif p_deposit_percent is not null then
    raise exception 'full payment plan cannot set a deposit percentage';
  end if;

  perform 1
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id and v.is_active and p.is_active
  for share of v, p;
  if not found then
    raise exception 'preorder variant is unavailable';
  end if;

  insert into public.preorder_batches (
    variant_id, name, quota, opens_at, closes_at, estimated_arrival, price,
    payment_plan, deposit_percent, status
  ) values (
    p_variant_id, btrim(p_name), p_quota, p_opens_at, p_closes_at,
    p_estimated_arrival, p_price, p_payment_plan, p_deposit_percent, p_initial_status
  )
  returning id into created_batch_id;
  return created_batch_id;
end;
$$;

create function public.set_preorder_batch_status(
  p_actor_id uuid,
  p_batch_id uuid,
  p_status public.preorder_batch_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_record public.preorder_batches%rowtype;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;

  select * into batch_record
  from public.preorder_batches where id = p_batch_id for update;
  if not found then raise exception 'preorder batch not found'; end if;
  if p_status is null or batch_record.status in ('received', 'cancelled')
    or p_status not in ('draft', 'open', 'closed', 'cancelled') then
    raise exception 'preorder batch status cannot be changed';
  end if;
  if p_status = 'cancelled'
    and (batch_record.reserved_quantity > 0 or batch_record.ordered_quantity > 0) then
    raise exception 'preorder batch has reserved or paid orders';
  end if;
  if p_status = 'open' and batch_record.closes_at <= now() then
    raise exception 'preorder batch closing time has passed';
  end if;

  update public.preorder_batches
  set status = p_status
  where id = p_batch_id;
end;
$$;

create function public.receive_preorder_batch(
  p_actor_id uuid,
  p_batch_id uuid,
  p_received_quantity integer,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_record public.preorder_batches%rowtype;
  processed_orders integer;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;
  if p_received_quantity is null or p_received_quantity < 1
    or p_received_quantity > 100000 or length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid preorder receipt';
  end if;

  select * into batch_record
  from public.preorder_batches where id = p_batch_id for update;
  if not found then raise exception 'preorder batch not found'; end if;
  if batch_record.status in ('received', 'cancelled') then
    raise exception 'preorder batch has already been finalized';
  end if;
  if batch_record.reserved_quantity > 0 then
    raise exception 'preorder batch has unpaid reservations';
  end if;
  if p_received_quantity < batch_record.ordered_quantity then
    raise exception 'received quantity is below paid preorder quantity';
  end if;

  insert into public.stock_levels (variant_id, location_code, on_hand, reserved_qty)
  values (
    batch_record.variant_id, 'STORE', p_received_quantity, batch_record.ordered_quantity
  )
  on conflict (variant_id, location_code) do update
  set on_hand = public.stock_levels.on_hand + excluded.on_hand,
      reserved_qty = public.stock_levels.reserved_qty + excluded.reserved_qty,
      updated_at = now();

  insert into public.stock_movements (
    variant_id, location_code, movement_type, quantity_delta, reserved_delta,
    reference_id, note, created_by
  ) values (
    batch_record.variant_id, 'STORE', 'preorder_received', p_received_quantity,
    batch_record.ordered_quantity, batch_record.id,
    nullif(btrim(coalesce(p_note, '')), ''), p_actor_id
  );

  update public.preorder_batches
  set status = 'received',
      received_quantity = p_received_quantity,
      received_at = now(),
      received_by = p_actor_id,
      received_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = batch_record.id;

  update public.order_items oi
  set preorder_status = case
    when b.payment_plan = 'deposit' then 'awaiting_balance'::public.preorder_status
    when b.payment_plan = 'full' then 'ready'::public.preorder_status
    else oi.preorder_status
  end
  from public.preorder_batches b
  where oi.preorder_batch_id = batch_record.id
    and b.id = oi.preorder_batch_id
    and oi.preorder_status = 'awaiting_arrival';

  update public.orders o
  set status = case
    when o.fulfillment_method = 'pickup' then 'ready_for_pickup'::public.order_status
    else 'processing'::public.order_status
  end
  where o.status in ('paid', 'processing')
    and o.id in (
      select distinct oi.order_id
      from public.order_items oi
      where oi.preorder_batch_id = batch_record.id
        and oi.preorder_status = 'ready'
    );

  select count(distinct oi.order_id)::integer into processed_orders
  from public.order_items oi
  where oi.preorder_batch_id = batch_record.id
    and oi.preorder_status in ('awaiting_balance', 'ready');
  return coalesce(processed_orders, 0);
end;
$$;

create or replace function public.create_preorder_deposit_payment(p_order_id uuid)
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
  payment_total numeric(12, 2);
  item_rows jsonb;
begin
  select * into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if order_record.status <> 'pending_payment' then
    raise exception 'order is not awaiting payment';
  end if;
  if order_record.reservation_expires_at is null
    or order_record.reservation_expires_at <= now() then
    raise exception 'preorder reservation has expired';
  end if;
  if not exists (
    select 1 from public.order_items oi
    where oi.order_id = order_record.id and oi.preorder_batch_id is not null
  ) then
    raise exception 'order has no preorder items';
  end if;

  select p.email, p.full_name into customer_email, customer_name
  from public.profiles p where p.id = order_record.customer_id;
  if order_record.fulfillment_method = 'shipping' then
    customer_name := coalesce(
      order_record.shipping_address_snapshot ->> 'recipient_name', customer_name
    );
    customer_phone := order_record.shipping_address_snapshot ->> 'phone';
  end if;

  select coalesce(sum(oi.deposit_amount), 0) + order_record.shipping_fee
  into payment_total
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;
  if payment_total <= 0 then raise exception 'order has no initial payment'; end if;

  insert into public.payments (
    order_id, provider, provider_order_id, amount, status, purpose
  ) values (
    order_record.id, 'midtrans', order_record.order_number, payment_total,
    'pending', 'preorder_deposit'
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
    if not found then raise exception 'initial payment could not be prepared'; end if;
    if payment_record.status = 'settlement' then
      raise exception 'initial payment is already paid';
    end if;
    raise exception 'initial payment is no longer available';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.sku_snapshot,
    'price', oi.deposit_amount / oi.quantity,
    'quantity', oi.quantity,
    'name', case
      when b.payment_plan = 'full' then oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
      else 'DP ' || oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
    end
  ) order by oi.id), '[]'::jsonb)
  into item_rows
  from public.order_items oi
  join public.preorder_batches b on b.id = oi.preorder_batch_id
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;

  if order_record.shipping_fee > 0 then
    item_rows := item_rows || jsonb_build_array(jsonb_build_object(
      'id', 'SHIPPING', 'price', order_record.shipping_fee, 'quantity', 1,
      'name', 'Ongkos kirim'
    ));
  end if;

  return query
  select payment_record.id, payment_record.provider_order_id, payment_record.amount,
    payment_record.purpose, item_rows,
    jsonb_build_object(
      'first_name', coalesce(nullif(btrim(coalesce(customer_name, '')), ''), 'Pelanggan'),
      'email', customer_email,
      'phone', nullif(btrim(coalesce(customer_phone, '')), '')
    ),
    order_record.reservation_expires_at;
end;
$$;

create or replace function public.create_preorder_balance_payment(p_order_id uuid)
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
  chosen_provider_order_id text;
  item_rows jsonb;
begin
  select * into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if order_record.status not in ('paid', 'processing') then
    raise exception 'deposit is not settled yet';
  end if;
  if exists (
    select 1 from public.order_items oi
    where oi.order_id = order_record.id
      and oi.preorder_batch_id is not null
      and oi.preorder_status <> 'awaiting_balance'
  ) or not exists (
    select 1 from public.order_items oi
    where oi.order_id = order_record.id
      and oi.preorder_batch_id is not null
      and oi.preorder_status = 'awaiting_balance'
  ) then
    raise exception 'preorder items are not ready for the final payment';
  end if;

  select coalesce(sum(oi.balance_amount), 0)
  into balance_total
  from public.order_items oi
  where oi.order_id = order_record.id and oi.preorder_batch_id is not null;
  if balance_total <= 0 then raise exception 'order has no remaining balance'; end if;

  select * into payment_record
  from public.payments p
  where p.order_id = order_record.id
    and p.purpose = 'preorder_balance'
    and p.status = 'pending'
  order by p.created_at desc
  limit 1
  for update;

  if not found then
    if exists (
      select 1 from public.payments p
      where p.order_id = order_record.id
        and p.purpose = 'preorder_balance'
        and p.status = 'settlement'
    ) then
      raise exception 'balance is already paid';
    end if;

    if exists (
      select 1 from public.payments p
      where p.order_id = order_record.id and p.purpose = 'preorder_balance'
    ) then
      chosen_provider_order_id := order_record.order_number || '-BAL-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    else
      chosen_provider_order_id := order_record.order_number || '-BAL';
    end if;

    insert into public.payments (
      order_id, provider, provider_order_id, amount, status, purpose
    ) values (
      order_record.id, 'midtrans', chosen_provider_order_id, balance_total,
      'pending', 'preorder_balance'
    )
    returning * into payment_record;
  elsif payment_record.amount <> balance_total then
    update public.payments
    set amount = balance_total
    where id = payment_record.id
    returning * into payment_record;
  end if;

  select p.email, p.full_name into customer_email, customer_name
  from public.profiles p where p.id = order_record.customer_id;
  if order_record.fulfillment_method = 'shipping' then
    customer_name := coalesce(
      order_record.shipping_address_snapshot ->> 'recipient_name', customer_name
    );
    customer_phone := order_record.shipping_address_snapshot ->> 'phone';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.sku_snapshot,
    'price', oi.balance_amount / oi.quantity,
    'quantity', oi.quantity,
    'name', 'Pelunasan ' || oi.product_name_snapshot || ' · ' || oi.variant_label_snapshot
  ) order by oi.id), '[]'::jsonb)
  into item_rows
  from public.order_items oi
  where oi.order_id = order_record.id
    and oi.preorder_batch_id is not null
    and oi.balance_amount > 0;

  return query
  select payment_record.id, payment_record.provider_order_id, payment_record.amount,
    payment_record.purpose, item_rows,
    jsonb_build_object(
      'first_name', coalesce(nullif(btrim(coalesce(customer_name, '')), ''), 'Pelanggan'),
      'email', customer_email,
      'phone', nullif(btrim(coalesce(customer_phone, '')), '')
    );
end;
$$;

create function public.update_preorder_item_after_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'settlement' or old.status = 'settlement'
    or new.purpose not in ('preorder_deposit', 'preorder_balance') then
    return new;
  end if;

  if new.purpose = 'preorder_balance' then
    update public.order_items oi
    set preorder_status = 'ready'
    where oi.order_id = new.order_id
      and oi.preorder_batch_id is not null
      and oi.preorder_status = 'awaiting_balance';
    update public.orders o
    set status = case
      when o.fulfillment_method = 'pickup' then 'ready_for_pickup'::public.order_status
      else 'processing'::public.order_status
    end
    where o.id = new.order_id
      and o.status in ('paid', 'processing')
      and exists (
        select 1 from public.order_items oi
        where oi.order_id = o.id
          and oi.preorder_batch_id is not null
          and oi.preorder_status = 'ready'
      );
  else
    update public.order_items oi
    set preorder_status = case
      when b.payment_plan = 'full' then 'awaiting_arrival'::public.preorder_status
      else 'deposit_paid'::public.preorder_status
    end
    from public.preorder_batches b
    where oi.order_id = new.order_id
      and oi.preorder_batch_id = b.id
      and oi.preorder_status = 'awaiting_deposit';
    update public.order_items oi
    set preorder_status = 'awaiting_arrival'
    from public.preorder_batches b
    where oi.order_id = new.order_id
      and oi.preorder_batch_id = b.id
      and b.payment_plan = 'deposit'
      and oi.preorder_status = 'deposit_paid';
  end if;

  return new;
end;
$$;

create trigger payments_update_preorder_item_status
  after update of status on public.payments
  for each row execute function public.update_preorder_item_after_payment();

create function public.cancel_preorder_items_with_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.order_items oi
    set preorder_status = 'cancelled'
    where oi.order_id = new.id
      and oi.preorder_batch_id is not null
      and oi.preorder_status not in ('completed', 'cancelled');
  elsif new.status = 'completed' and old.status is distinct from new.status then
    update public.order_items oi
    set preorder_status = 'completed'
    where oi.order_id = new.id
      and oi.preorder_batch_id is not null
      and oi.preorder_status <> 'cancelled';
  end if;
  return new;
end;
$$;

create trigger orders_cancel_preorder_items
  after update of status on public.orders
  for each row execute function public.cancel_preorder_items_with_order();

revoke all on function public.create_preorder_order(
  uuid, uuid, integer, public.fulfillment_method, uuid, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_preorder_batch(
  uuid, uuid, text, integer, timestamptz, timestamptz, date, numeric,
  public.preorder_payment_plan, numeric, public.preorder_batch_status
) from public, anon, authenticated;
revoke all on function public.set_preorder_batch_status(
  uuid, uuid, public.preorder_batch_status
) from public, anon, authenticated;
revoke all on function public.receive_preorder_batch(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.create_preorder_deposit_payment(uuid)
  from public, anon, authenticated;
revoke all on function public.create_preorder_balance_payment(uuid)
  from public, anon, authenticated;

grant execute on function public.create_preorder_order(
  uuid, uuid, integer, public.fulfillment_method, uuid, jsonb, timestamptz
) to service_role;
grant execute on function public.create_preorder_batch(
  uuid, uuid, text, integer, timestamptz, timestamptz, date, numeric,
  public.preorder_payment_plan, numeric, public.preorder_batch_status
) to service_role;
grant execute on function public.set_preorder_batch_status(
  uuid, uuid, public.preorder_batch_status
) to service_role;
grant execute on function public.receive_preorder_batch(uuid, uuid, integer, text)
  to service_role;
grant execute on function public.create_preorder_deposit_payment(uuid)
  to service_role;
grant execute on function public.create_preorder_balance_payment(uuid)
  to service_role;

comment on function public.create_preorder_order(
  uuid, uuid, integer, public.fulfillment_method, uuid, jsonb, timestamptz
) is 'Creates a preorder and reserves batch quota atomically; prices and shipping are read from server-side data.';
comment on function public.receive_preorder_batch(uuid, uuid, integer, text)
  is 'Posts received preorder units to the STORE ledger, reserves paid allocations, and advances preorder item states.';
