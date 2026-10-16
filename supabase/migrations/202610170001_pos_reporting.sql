alter table public.orders
  alter column customer_id drop not null,
  add column created_by uuid references public.profiles(id) on delete set null;

create index orders_created_by_created_at_idx
  on public.orders (created_by, created_at desc)
  where created_by is not null;

create index payments_settled_paid_at_provider_idx
  on public.payments (paid_at desc, provider)
  where status = 'settlement';

create index preorder_batches_open_period_idx
  on public.preorder_batches (opens_at, closes_at)
  where status = 'open';

create table public.pos_sale_requests (
  request_id uuid primary key,
  created_by uuid not null references public.profiles(id) on delete restrict,
  request_hash text not null,
  order_id uuid unique references public.orders(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.pos_sale_requests enable row level security;
revoke all on public.pos_sale_requests from public, anon, authenticated;
grant all on public.pos_sale_requests to service_role;

create function public.record_offline_sale(
  p_actor_id uuid,
  p_request_id uuid,
  p_store_location_id uuid,
  p_payment_method text,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_number text,
  total numeric,
  item_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.pos_sale_requests%rowtype;
  variant_record public.product_variants%rowtype;
  stock_record public.stock_levels%rowtype;
  sale_item record;
  created_order_id uuid := gen_random_uuid();
  created_order_number text;
  created_order_item_id uuid;
  product_name text;
  calculated_total numeric(12, 2) := 0;
  request_fingerprint text;
  processed_count integer := 0;
begin
  if p_actor_id is null or p_request_id is null or p_store_location_id is null
    or p_payment_method is null
    or p_payment_method not in ('cash', 'card', 'bank_transfer', 'qris')
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid point of sale request';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.role in ('admin', 'cashier')
  ) then
    raise exception 'staff access required';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    where line.variant_id is null or line.quantity is null
      or line.quantity not between 1 and 10000
  ) or exists (
    select line.variant_id
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    group by line.variant_id
    having count(*) > 1
  ) then
    raise exception 'invalid or duplicate point of sale item';
  end if;

  request_fingerprint := md5(jsonb_build_object(
    'store_id', p_store_location_id,
    'payment_method', p_payment_method,
    'items', p_items
  )::text);
  insert into public.pos_sale_requests (request_id, created_by, request_hash)
  values (p_request_id, p_actor_id, request_fingerprint)
  on conflict (request_id) do nothing;

  select * into request_record
  from public.pos_sale_requests
  where request_id = p_request_id
  for update;
  if request_record.created_by <> p_actor_id
    or request_record.request_hash <> request_fingerprint then
    raise exception 'point of sale request key was already used';
  end if;
  if request_record.order_id is not null then
    return query
    select o.id, o.order_number, o.total,
      (select count(*)::integer from public.order_items oi where oi.order_id = o.id)
    from public.orders o
    where o.id = request_record.order_id;
    return;
  end if;

  perform 1
  from public.store_locations s
  where s.id = p_store_location_id and s.is_active
  for share;
  if not found then raise exception 'point of sale store is unavailable'; end if;

  for sale_item in
    select line.variant_id, line.quantity
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    order by line.variant_id
  loop
    select v.* into variant_record
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = sale_item.variant_id and v.is_active and p.is_active
    for share of v, p;
    if not found then raise exception 'point of sale product is unavailable'; end if;

    select * into stock_record
    from public.stock_levels
    where variant_id = sale_item.variant_id and location_code = 'STORE'
    for update;
    if not found or stock_record.available_qty < sale_item.quantity then
      raise exception 'insufficient store stock for variant %', sale_item.variant_id;
    end if;
    calculated_total := calculated_total + variant_record.price * sale_item.quantity;
  end loop;
  if calculated_total <= 0 or calculated_total > 9999999999.99 then
    raise exception 'point of sale total is outside the supported amount';
  end if;

  created_order_number := 'RSH-POS-' || to_char(now(), 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.orders (
    id, order_number, customer_id, created_by, status, fulfillment_method,
    pickup_store_location_id, subtotal, shipping_fee, total
  ) values (
    created_order_id, created_order_number, null, p_actor_id, 'completed',
    'pickup', p_store_location_id, calculated_total, 0, calculated_total
  );

  for sale_item in
    select line.variant_id, line.quantity
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    order by line.variant_id
  loop
    select v.* into variant_record
    from public.product_variants v
    where v.id = sale_item.variant_id;
    select p.name into product_name
    from public.products p
    where p.id = variant_record.product_id;

    insert into public.order_items (
      order_id, variant_id, product_name_snapshot, variant_label_snapshot,
      sku_snapshot, quantity, unit_price
    ) values (
      created_order_id, variant_record.id, product_name,
      'Ukuran ' || variant_record.size || ' / ' || variant_record.color,
      variant_record.sku, sale_item.quantity, variant_record.price
    ) returning id into created_order_item_id;

    update public.stock_levels
    set on_hand = on_hand - sale_item.quantity, updated_at = now()
    where variant_id = sale_item.variant_id
      and location_code = 'STORE'
      and available_qty >= sale_item.quantity;
    if not found then raise exception 'store stock changed during sale'; end if;

    insert into public.stock_movements (
      variant_id, location_code, movement_type, quantity_delta,
      order_id, reference_id, note, created_by
    ) values (
      sale_item.variant_id, 'STORE', 'sale_offline', -sale_item.quantity,
      created_order_id, created_order_item_id, 'Penjualan POS', p_actor_id
    );
    processed_count := processed_count + 1;
  end loop;

  insert into public.payments (
    order_id, provider, provider_order_id, amount, status, purpose,
    payment_type, paid_at
  ) values (
    created_order_id, 'offline', created_order_number, calculated_total,
    'settlement', 'regular', p_payment_method, now()
  );

  update public.pos_sale_requests
  set order_id = created_order_id
  where request_id = p_request_id;

  return query
  select created_order_id, created_order_number, calculated_total, processed_count;
end;
$$;

create function public.update_order_fulfillment(
  p_actor_id uuid,
  p_order_id uuid,
  p_next_status public.order_status,
  p_tracking_number text default null
)
returns table (order_number text, status public.order_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  actor_role public.app_role;
  cleaned_tracking text;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id = p_actor_id and p.role in ('admin', 'cashier');
  if not found then raise exception 'staff access required'; end if;

  select * into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.preorder_batch_id is not null
      and oi.preorder_status <> 'ready'
  ) then
    raise exception 'preorder items are not ready for fulfillment';
  end if;

  cleaned_tracking := nullif(btrim(coalesce(p_tracking_number, '')), '');
  if p_next_status = 'processing' then
    if order_record.status <> 'paid' or order_record.fulfillment_method <> 'shipping' then
      raise exception 'order cannot move to processing';
    end if;
  elsif p_next_status = 'ready_for_pickup' then
    if order_record.status not in ('paid', 'processing')
      or order_record.fulfillment_method <> 'pickup' then
      raise exception 'order cannot be prepared for pickup';
    end if;
  elsif p_next_status = 'shipped' then
    if order_record.status <> 'processing'
      or order_record.fulfillment_method <> 'shipping'
      or cleaned_tracking is null or length(cleaned_tracking) > 100 then
      raise exception 'shipping order requires a valid tracking number';
    end if;
  elsif p_next_status = 'completed' then
    if order_record.status <> 'ready_for_pickup'
      or order_record.fulfillment_method <> 'pickup' then
      raise exception 'only a ready pickup order can be completed here';
    end if;
  else
    raise exception 'unsupported order status transition';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  update public.orders
  set status = p_next_status,
      tracking_number = case when p_next_status = 'shipped' then cleaned_tracking else tracking_number end
  where id = p_order_id;

  return query
  select order_record.order_number, p_next_status;
end;
$$;

create function public.get_admin_sales_summary(p_days integer)
returns table (
  provider text,
  payment_count bigint,
  total_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_days is null or p_days not between 1 and 365 or not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select p.provider, count(*)::bigint, coalesce(sum(p.amount), 0)
  from public.payments p
  where p.status = 'settlement'
    and p.paid_at >= now() - make_interval(days => p_days)
    and p.paid_at <= now()
  group by p.provider
  order by p.provider;
end;
$$;

create function public.get_admin_active_preorder_batches()
returns table (
  id uuid,
  variant_id uuid,
  name text,
  quota integer,
  reserved_quantity integer,
  ordered_quantity integer,
  closes_at timestamptz,
  estimated_arrival date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select b.id, b.variant_id, b.name, b.quota, b.reserved_quantity,
    b.ordered_quantity, b.closes_at, b.estimated_arrival
  from public.preorder_batches b
  where b.status = 'open'
    and b.opens_at <= now()
    and b.closes_at > now()
    and b.quota > b.reserved_quantity + b.ordered_quantity
  order by b.closes_at
  limit 100;
end;
$$;

revoke all on function public.record_offline_sale(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_offline_sale(uuid, uuid, uuid, text, jsonb)
  to service_role;
revoke all on function public.update_order_fulfillment(uuid, uuid, public.order_status, text)
  from public, anon, authenticated;
grant execute on function public.update_order_fulfillment(uuid, uuid, public.order_status, text)
  to service_role;
revoke all on function public.get_admin_sales_summary(integer)
  from public, anon;
grant execute on function public.get_admin_sales_summary(integer)
  to authenticated;
revoke all on function public.get_admin_active_preorder_batches()
  from public, anon;
grant execute on function public.get_admin_active_preorder_batches()
  to authenticated;
