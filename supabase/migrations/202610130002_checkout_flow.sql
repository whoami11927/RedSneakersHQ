alter table public.orders
  add column pickup_store_location_id uuid references public.store_locations(id) on delete restrict;

alter table public.orders
  add constraint orders_pickup_location_check check (
    (fulfillment_method = 'pickup' and pickup_store_location_id is not null)
    or (fulfillment_method = 'shipping' and pickup_store_location_id is null)
  );

create table public.checkout_rate_limits (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.checkout_rate_limits enable row level security;
revoke all on table public.checkout_rate_limits from public, anon, authenticated;

create function public.get_shipping_quote(
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  store_location_id uuid,
  store_name text,
  store_address text,
  zone_name text,
  distance_km numeric,
  shipping_fee numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with store_distances as (
    select
      s.id,
      s.name,
      s.address,
      z.name as zone_name,
      z.min_distance_km,
      z.max_distance_km,
      z.base_fee,
      z.fee_per_km,
      6371.0 * 2 * asin(sqrt(least(
        1.0::double precision,
        greatest(
          0.0::double precision,
          power(sin(radians(s.latitude - p_latitude) / 2), 2)
            + cos(radians(p_latitude)) * cos(radians(s.latitude))
            * power(sin(radians(s.longitude - p_longitude) / 2), 2)
        )
      ))) as distance_km
    from public.store_locations s
    join public.shipping_zones z
      on z.store_location_id = s.id
    where s.is_active and z.is_active
  )
  select
    d.id,
    d.name,
    d.address,
    d.zone_name,
    round(d.distance_km::numeric, 2),
    round((d.base_fee + d.fee_per_km * d.distance_km)::numeric, 0)
  from store_distances d
  where p_latitude between -90 and 90
    and p_longitude between -180 and 180
    and d.distance_km >= d.min_distance_km
    and (d.max_distance_km is null or d.distance_km < d.max_distance_km)
  order by d.distance_km
  limit 1;
$$;

create function public.consume_checkout_rate_limit(p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
begin
  insert into public.checkout_rate_limits (customer_id, window_started_at, request_count)
  values (p_customer_id, now(), 1)
  on conflict (customer_id) do update
  set
    window_started_at = case
      when public.checkout_rate_limits.window_started_at <= now() - interval '1 minute' then now()
      else public.checkout_rate_limits.window_started_at
    end,
    request_count = case
      when public.checkout_rate_limits.window_started_at <= now() - interval '1 minute' then 1
      else public.checkout_rate_limits.request_count + 1
    end
  returning public.checkout_rate_limits.request_count into request_count;

  return request_count <= 5;
end;
$$;

create function public.create_checkout_order(
  p_customer_id uuid,
  p_fulfillment_method public.fulfillment_method,
  p_pickup_store_location_id uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_expires_at timestamptz
)
returns table (
  order_id uuid,
  order_number text,
  subtotal numeric,
  shipping_fee numeric,
  total numeric,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  product_variant record;
  created_order_id uuid;
  created_order_number text;
  shipping_address_id uuid;
  shipping_snapshot jsonb;
  selected_store_id uuid;
  selected_store_name text;
  selected_zone_name text;
  selected_distance_km numeric;
  calculated_subtotal numeric(12, 2) := 0;
  calculated_shipping_fee numeric(12, 2) := 0;
  order_expiry timestamptz;
begin
  if p_customer_id is null
    or p_fulfillment_method is null
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 30 then
    raise exception 'invalid checkout request';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception 'reservation expiry must be within fifteen minutes';
  end if;
  order_expiry := p_expires_at;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    where line.variant_id is null or line.quantity is null or line.quantity < 1 or line.quantity > 10000
  ) or (
    select count(*) from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
  ) <> (
    select count(distinct line.variant_id)
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
  ) then
    raise exception 'invalid or duplicate cart items';
  end if;

  if p_fulfillment_method = 'shipping' then
    if p_pickup_store_location_id is not null
      or jsonb_typeof(p_shipping_address) is distinct from 'object' then
      raise exception 'delivery address is required';
    end if;

    select
      quote.store_location_id,
      quote.store_name,
      quote.zone_name,
      quote.distance_km,
      quote.shipping_fee
    into
      selected_store_id,
      selected_store_name,
      selected_zone_name,
      selected_distance_km,
      calculated_shipping_fee
    from public.get_shipping_quote(
      (p_shipping_address ->> 'latitude')::double precision,
      (p_shipping_address ->> 'longitude')::double precision
    ) as quote;

    if not found then
      raise exception 'no active shipping zone covers this address';
    end if;
  else
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
  end if;

  created_order_number := 'RSH-' || to_char(now(), 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  if p_fulfillment_method = 'shipping' then
    insert into public.shipping_addresses (
      user_id,
      recipient_name,
      phone,
      address_line,
      city,
      province,
      postal_code,
      latitude,
      longitude
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
  end if;

  insert into public.orders (
    order_number,
    customer_id,
    fulfillment_method,
    pickup_store_location_id,
    shipping_address_id,
    shipping_address_snapshot,
    subtotal,
    shipping_fee,
    total,
    reservation_expires_at
  ) values (
    created_order_number,
    p_customer_id,
    p_fulfillment_method,
    p_pickup_store_location_id,
    shipping_address_id,
    shipping_snapshot,
    0,
    calculated_shipping_fee,
    calculated_shipping_fee,
    order_expiry
  )
  returning id into created_order_id;

  for item in
    select line.variant_id, line.quantity
    from jsonb_to_recordset(p_items) as line(variant_id uuid, quantity integer)
    order by line.variant_id
  loop
    select
      v.price,
      v.sku,
      v.size,
      v.color,
      p.name
    into product_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = item.variant_id and v.is_active and p.is_active
    for share of v, p;

    if not found then
      raise exception 'product variant is unavailable';
    end if;

    calculated_subtotal := calculated_subtotal + product_variant.price * item.quantity;
    insert into public.order_items (
      order_id,
      variant_id,
      product_name_snapshot,
      variant_label_snapshot,
      sku_snapshot,
      quantity,
      unit_price
    ) values (
      created_order_id,
      item.variant_id,
      product_variant.name,
      product_variant.size || ' / ' || product_variant.color,
      product_variant.sku,
      item.quantity,
      product_variant.price
    );
  end loop;

  update public.orders
  set subtotal = calculated_subtotal,
      total = calculated_subtotal + calculated_shipping_fee
  where id = created_order_id;

  perform public.reserve_stock(created_order_id, order_expiry);

  return query
  select
    o.id,
    o.order_number,
    o.subtotal,
    o.shipping_fee,
    o.total,
    o.reservation_expires_at
  from public.orders o
  where o.id = created_order_id;
end;
$$;

revoke all on function public.get_shipping_quote(double precision, double precision) from public, anon, authenticated;
revoke all on function public.consume_checkout_rate_limit(uuid) from public, anon, authenticated;
revoke all on function public.create_checkout_order(uuid, public.fulfillment_method, uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.get_shipping_quote(double precision, double precision) to service_role;
grant execute on function public.consume_checkout_rate_limit(uuid) to service_role;
grant execute on function public.create_checkout_order(uuid, public.fulfillment_method, uuid, jsonb, jsonb, timestamptz) to service_role;
