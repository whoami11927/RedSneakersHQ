create type public.app_role as enum ('customer', 'cashier', 'admin');
create type public.inventory_location as enum ('STORE', 'ONLINE');
create type public.stock_movement_type as enum (
  'sale_online',
  'sale_offline',
  'reservation',
  'release',
  'return',
  'adjustment',
  'preorder_received'
);
create type public.reservation_status as enum ('active', 'released', 'consumed');
create type public.order_status as enum (
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'ready_for_pickup',
  'completed',
  'cancelled',
  'refunded'
);
create type public.fulfillment_method as enum ('shipping', 'pickup');
create type public.payment_status as enum (
  'pending',
  'settlement',
  'expire',
  'cancel',
  'deny',
  'refund',
  'partial_refund'
);
create type public.preorder_payment_plan as enum ('full', 'deposit');
create type public.preorder_batch_status as enum ('draft', 'open', 'closed', 'received', 'cancelled');
create type public.preorder_reservation_status as enum ('active', 'released', 'confirmed');
create type public.preorder_status as enum (
  'awaiting_deposit',
  'deposit_paid',
  'awaiting_arrival',
  'awaiting_balance',
  'ready',
  'completed',
  'cancelled'
);

create extension if not exists btree_gist with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  size text not null,
  color text not null,
  price numeric(12, 2) not null check (price >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, color)
);

create table public.stock_levels (
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  location_code public.inventory_location not null,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved_qty integer not null default 0 check (reserved_qty >= 0 and reserved_qty <= on_hand),
  available_qty integer generated always as (on_hand - reserved_qty) stored,
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_code)
);

create table public.shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  city text not null,
  province text not null,
  postal_code text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  store_location_id uuid not null references public.store_locations(id) on delete cascade,
  name text not null unique,
  min_distance_km numeric(8, 2) not null default 0 check (min_distance_km >= 0),
  max_distance_km numeric(8, 2),
  base_fee numeric(12, 2) not null default 0 check (base_fee >= 0),
  fee_per_km numeric(12, 2) not null default 0 check (fee_per_km >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_distance_km is null or max_distance_km > min_distance_km),
  exclude using gist (
    store_location_id with =,
    numrange(min_distance_km, max_distance_km, '[)') with &&
  )
);

create table public.preorder_batches (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  name text not null,
  quota integer not null check (quota > 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  ordered_quantity integer not null default 0 check (ordered_quantity >= 0),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  estimated_arrival date not null,
  price numeric(12, 2) not null check (price >= 0),
  payment_plan public.preorder_payment_plan not null,
  deposit_percent numeric(5, 2),
  status public.preorder_batch_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at),
  check (reserved_quantity + ordered_quantity <= quota),
  check (
    (payment_plan = 'full' and deposit_percent is null)
    or (
      payment_plan = 'deposit'
      and deposit_percent is not null
      and deposit_percent > 0
      and deposit_percent < 100
    )
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  fulfillment_method public.fulfillment_method not null,
  shipping_address_id uuid references public.shipping_addresses(id) on delete set null,
  shipping_address_snapshot jsonb,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  total numeric(12, 2) not null check (total >= 0),
  tracking_number text,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal + shipping_fee),
  check (
    (fulfillment_method = 'shipping' and shipping_address_snapshot is not null)
    or fulfillment_method = 'pickup'
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  preorder_batch_id uuid references public.preorder_batches(id) on delete restrict,
  preorder_status public.preorder_status,
  product_name_snapshot text not null,
  variant_label_snapshot text not null,
  sku_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (quantity * unit_price) stored,
  check (
    (preorder_batch_id is null and preorder_status is null)
    or (preorder_batch_id is not null and preorder_status is not null)
  )
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  location_code public.inventory_location not null,
  movement_type public.stock_movement_type not null,
  quantity_delta integer not null default 0,
  reserved_delta integer not null default 0,
  order_id uuid references public.orders(id) on delete set null,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (quantity_delta <> 0 or reserved_delta <> 0)
);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  location_code public.inventory_location not null,
  quantity integer not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_item_id, location_code)
);

create table public.preorder_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  batch_id uuid not null references public.preorder_batches(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.preorder_reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'midtrans' check (provider in ('midtrans', 'offline')),
  provider_order_id text not null unique,
  provider_transaction_id text unique,
  amount numeric(12, 2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  payment_type text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_notifications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  deduplication_key text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  changed_at timestamptz not null default now()
);

create index products_brand_id_idx on public.products (brand_id);
create index products_active_name_idx on public.products (is_active, name);
create index products_search_idx on public.products using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
);
create index product_variants_product_active_idx on public.product_variants (product_id, is_active);
create index stock_levels_location_available_idx on public.stock_levels (location_code, available_qty);
create index stock_movements_variant_created_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_id_idx on public.stock_movements (order_id);
create index stock_reservations_expiry_idx on public.stock_reservations (expires_at) where status = 'active';
create index preorder_batches_open_window_idx on public.preorder_batches (status, opens_at, closes_at);
create index preorder_batches_variant_id_idx on public.preorder_batches (variant_id);
create index preorder_reservations_expiry_idx on public.preorder_reservations (expires_at) where status = 'active';
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
create index payments_order_id_idx on public.payments (order_id);
create index order_status_history_order_changed_idx on public.order_status_history (order_id, changed_at);
create index shipping_addresses_user_id_idx on public.shipping_addresses (user_id);
create index shipping_zones_store_location_id_idx on public.shipping_zones (store_location_id);

create function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = required_role, false)
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('admin', 'cashier'), false)
$$;

create function public.write_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, new_status)
    values (new.id, new.status);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger orders_status_history
  after insert or update of status on public.orders
  for each row execute function public.write_order_status_history();

create function public.prevent_stock_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_movements is an append-only ledger';
end;
$$;

create trigger stock_movements_are_immutable
  before update or delete on public.stock_movements
  for each row execute function public.prevent_stock_movement_mutation();

create function public.reserve_stock(p_order_id uuid, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  target_location public.inventory_location;
  locked_level public.stock_levels%rowtype;
begin
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'reservation expiry must be in the future';
  end if;

  select case when fulfillment_method = 'pickup' then 'STORE'::public.inventory_location
              else 'ONLINE'::public.inventory_location end
    into target_location
    from public.orders
    where id = p_order_id and status = 'pending_payment'
    for update;

  if not found then
    raise exception 'pending order not found';
  end if;

  if exists (select 1 from public.stock_reservations where order_id = p_order_id) then
    raise exception 'stock reservation already exists for this order';
  end if;

  for item in
    select oi.id, oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.preorder_batch_id is null
    order by oi.variant_id, oi.id
  loop
    select * into locked_level
    from public.stock_levels
    where variant_id = item.variant_id and location_code = target_location
    for update;

    if not found or locked_level.available_qty < item.quantity then
      raise exception 'insufficient stock for variant %', item.variant_id;
    end if;

    update public.stock_levels
      set reserved_qty = reserved_qty + item.quantity, updated_at = now()
      where variant_id = item.variant_id and location_code = target_location;

    insert into public.stock_reservations (
      order_id, order_item_id, variant_id, location_code, quantity, expires_at
    ) values (
      p_order_id, item.id, item.variant_id, target_location, item.quantity, p_expires_at
    );

    insert into public.stock_movements (
      variant_id, location_code, movement_type, reserved_delta, order_id, reference_id
    ) values (
      item.variant_id, target_location, 'reservation', item.quantity, p_order_id, item.id
    );
  end loop;
end;
$$;

create function public.adjust_stock(
  p_variant_id uuid,
  p_location_code public.inventory_location,
  p_delta integer,
  p_note text,
  p_created_by uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_on_hand integer;
begin
  if p_delta = 0 or nullif(btrim(p_note), '') is null then
    raise exception 'stock adjustment needs a non-zero delta and a reason';
  end if;

  insert into public.stock_levels (variant_id, location_code)
  values (p_variant_id, p_location_code)
  on conflict (variant_id, location_code) do nothing;

  perform 1 from public.stock_levels
  where variant_id = p_variant_id and location_code = p_location_code
  for update;
  if not found then raise exception 'stock level not found'; end if;

  update public.stock_levels
    set on_hand = on_hand + p_delta, updated_at = now()
    where variant_id = p_variant_id
      and location_code = p_location_code
      and on_hand + p_delta >= reserved_qty
    returning on_hand into new_on_hand;
  if not found then raise exception 'adjustment would make stock negative or below reservations'; end if;

  insert into public.stock_movements (
    variant_id, location_code, movement_type, quantity_delta, note, created_by
  ) values (
    p_variant_id, p_location_code, 'adjustment', p_delta, btrim(p_note), p_created_by
  );
  return new_on_hand;
end;
$$;

create function public.release_stock_reservation(p_order_id uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  released_count integer := 0;
begin
  perform 1 from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  for reservation in
    select id, variant_id, location_code, quantity, order_item_id
    from public.stock_reservations
    where order_id = p_order_id and status = 'active'
    order by variant_id, location_code
    for update
  loop
    update public.stock_levels
      set reserved_qty = reserved_qty - reservation.quantity, updated_at = now()
      where variant_id = reservation.variant_id
        and location_code = reservation.location_code
        and reserved_qty >= reservation.quantity;
    if not found then
      raise exception 'stock reservation ledger mismatch';
    end if;

    update public.stock_reservations
      set status = 'released', released_at = now()
      where id = reservation.id;

    insert into public.stock_movements (
      variant_id, location_code, movement_type, reserved_delta, order_id, reference_id, note
    ) values (
      reservation.variant_id, reservation.location_code, 'release',
      -reservation.quantity, p_order_id, reservation.order_item_id, p_note
    );
    released_count := released_count + 1;
  end loop;
  return released_count;
end;
$$;

create function public.confirm_stock_reservation(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  active_count integer;
  confirmed_count integer;
  released_count integer;
  processed_count integer := 0;
begin
  perform 1 from public.orders where id = p_order_id and status in ('paid', 'processing') for update;
  if not found then
    raise exception 'paid order not found';
  end if;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status = 'consumed'),
         count(*) filter (where status = 'released')
    into active_count, confirmed_count, released_count
    from public.stock_reservations where order_id = p_order_id;

  if active_count = 0 then
    if confirmed_count > 0 and released_count = 0 then return 0; end if;
    if confirmed_count = 0 and released_count = 0 then return 0; end if;
    raise exception 'order reservation is no longer active';
  end if;

  for reservation in
    select id, variant_id, location_code, quantity, order_item_id
    from public.stock_reservations
    where order_id = p_order_id and status = 'active'
    order by variant_id, location_code
    for update
  loop
    update public.stock_levels
      set on_hand = on_hand - reservation.quantity,
          reserved_qty = reserved_qty - reservation.quantity,
          updated_at = now()
      where variant_id = reservation.variant_id
        and location_code = reservation.location_code
        and on_hand >= reservation.quantity
        and reserved_qty >= reservation.quantity;
    if not found then
      raise exception 'stock reservation ledger mismatch';
    end if;

    update public.stock_reservations set status = 'consumed' where id = reservation.id;
    insert into public.stock_movements (
      variant_id, location_code, movement_type, quantity_delta, reserved_delta,
      order_id, reference_id
    ) values (
      reservation.variant_id, reservation.location_code, 'sale_online',
      -reservation.quantity, -reservation.quantity, p_order_id, reservation.order_item_id
    );
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;

create function public.reserve_preorder_quota(
  p_order_id uuid,
  p_order_item_id uuid,
  p_batch_id uuid,
  p_quantity integer,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch public.preorder_batches%rowtype;
begin
  if p_quantity <= 0 or p_expires_at <= now() then
    raise exception 'invalid preorder reservation';
  end if;

  perform 1 from public.orders
  where id = p_order_id and status = 'pending_payment'
  for update;
  if not found then raise exception 'pending order not found'; end if;

  select * into batch from public.preorder_batches where id = p_batch_id for update;
  if not found
    or batch.status <> 'open'
    or now() < batch.opens_at
    or now() >= batch.closes_at
    or batch.quota - batch.reserved_quantity - batch.ordered_quantity < p_quantity then
    raise exception 'preorder batch is not open or has insufficient quota';
  end if;

  if not exists (
    select 1 from public.order_items
    where id = p_order_item_id and order_id = p_order_id
      and preorder_batch_id = p_batch_id and quantity = p_quantity
  ) then
    raise exception 'order item does not match preorder reservation';
  end if;

  update public.preorder_batches
    set reserved_quantity = reserved_quantity + p_quantity, updated_at = now()
    where id = p_batch_id;
  insert into public.preorder_reservations (
    order_id, order_item_id, batch_id, quantity, expires_at
  ) values (p_order_id, p_order_item_id, p_batch_id, p_quantity, p_expires_at);
end;
$$;

create function public.release_preorder_reservation(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  released_count integer := 0;
begin
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  for reservation in
    select id, batch_id, quantity
    from public.preorder_reservations
    where order_id = p_order_id and status = 'active'
    order by batch_id
    for update
  loop
    update public.preorder_batches
      set reserved_quantity = reserved_quantity - reservation.quantity, updated_at = now()
      where id = reservation.batch_id
        and reserved_quantity >= reservation.quantity;
    if not found then raise exception 'preorder reservation ledger mismatch'; end if;
    update public.preorder_reservations set status = 'released' where id = reservation.id;
    released_count := released_count + 1;
  end loop;
  return released_count;
end;
$$;

create function public.confirm_preorder_reservation(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  confirmed_count integer := 0;
  active_count integer;
  released_count integer;
begin
  perform 1 from public.orders where id = p_order_id and status in ('paid', 'processing') for update;
  if not found then raise exception 'paid order not found'; end if;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status = 'released')
    into active_count, released_count
    from public.preorder_reservations where order_id = p_order_id;
  if active_count = 0 and released_count > 0 then
    raise exception 'preorder reservation is no longer active';
  end if;

  for reservation in
    select id, batch_id, quantity
    from public.preorder_reservations
    where order_id = p_order_id and status = 'active'
    order by batch_id
    for update
  loop
    update public.preorder_batches
      set reserved_quantity = reserved_quantity - reservation.quantity,
          ordered_quantity = ordered_quantity + reservation.quantity,
          updated_at = now()
      where id = reservation.batch_id
        and reserved_quantity >= reservation.quantity;
    if not found then raise exception 'preorder reservation ledger mismatch'; end if;
    update public.preorder_reservations set status = 'confirmed' where id = reservation.id;
    confirmed_count := confirmed_count + 1;
  end loop;
  return confirmed_count;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger shipping_addresses_set_updated_at before update on public.shipping_addresses
  for each row execute function public.set_updated_at();
create trigger store_locations_set_updated_at before update on public.store_locations
  for each row execute function public.set_updated_at();
create trigger shipping_zones_set_updated_at before update on public.shipping_zones
  for each row execute function public.set_updated_at();
create trigger preorder_batches_set_updated_at before update on public.preorder_batches
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_levels enable row level security;
alter table public.shipping_addresses enable row level security;
alter table public.store_locations enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.preorder_batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.preorder_reservations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_notifications enable row level security;
alter table public.order_status_history enable row level security;

create policy "profiles_read_own_or_admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_role('admin'));
create policy "profiles_admin_manage" on public.profiles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "brands_public_read" on public.brands for select to anon, authenticated using (true);
create policy "brands_admin_manage" on public.brands for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "products_public_read_active" on public.products for select to anon, authenticated
  using (is_active or public.has_role('admin'));
create policy "products_admin_manage" on public.products for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "variants_public_read_active" on public.product_variants for select to anon, authenticated
  using (is_active or public.has_role('admin'));
create policy "variants_admin_manage" on public.product_variants for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "stock_levels_public_read_listed" on public.stock_levels for select to anon, authenticated
  using (
    exists (
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = variant_id and v.is_active and p.is_active
    )
    or public.is_staff()
  );
create policy "addresses_owner_manage" on public.shipping_addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "store_locations_public_read_active" on public.store_locations for select to anon, authenticated
  using (is_active or public.has_role('admin'));
create policy "store_locations_admin_manage" on public.store_locations for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "shipping_zones_public_read_active" on public.shipping_zones for select to anon, authenticated
  using (is_active or public.has_role('admin'));
create policy "shipping_zones_admin_manage" on public.shipping_zones for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "preorder_batches_public_read_open" on public.preorder_batches for select to anon, authenticated
  using (status = 'open' or public.has_role('admin'));
create policy "preorder_batches_admin_manage" on public.preorder_batches for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "orders_owner_or_staff_read" on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_staff());
create policy "order_items_owner_or_staff_read" on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );
create policy "stock_movements_staff_read" on public.stock_movements for select to authenticated
  using (public.is_staff());
create policy "stock_reservations_owner_or_staff_read" on public.stock_reservations for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );
create policy "preorder_reservations_owner_or_staff_read" on public.preorder_reservations for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );
create policy "payments_owner_or_staff_read" on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );
create policy "payment_notifications_staff_read" on public.payment_notifications for select to authenticated
  using (public.is_staff());
create policy "order_history_owner_or_staff_read" on public.order_status_history for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.customer_id = (select auth.uid()) or public.is_staff())
    )
  );

revoke all on function public.reserve_stock(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.adjust_stock(uuid, public.inventory_location, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.release_stock_reservation(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_stock_reservation(uuid) from public, anon, authenticated;
revoke all on function public.reserve_preorder_quota(uuid, uuid, uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.release_preorder_reservation(uuid) from public, anon, authenticated;
revoke all on function public.confirm_preorder_reservation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_stock(uuid, timestamptz) to service_role;
grant execute on function public.adjust_stock(uuid, public.inventory_location, integer, text, uuid) to service_role;
grant execute on function public.release_stock_reservation(uuid, text) to service_role;
grant execute on function public.confirm_stock_reservation(uuid) to service_role;
grant execute on function public.reserve_preorder_quota(uuid, uuid, uuid, integer, timestamptz) to service_role;
grant execute on function public.release_preorder_reservation(uuid) to service_role;
grant execute on function public.confirm_preorder_reservation(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "product_images_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "product_images_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role('admin'));
create policy "product_images_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role('admin'))
  with check (bucket_id = 'product-images' and public.has_role('admin'));
create policy "product_images_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role('admin'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'stock_levels'
     ) then
    alter publication supabase_realtime add table public.stock_levels;
  end if;
end;
$$;
