insert into public.brands (name, slug)
values ('Demo Brand', 'demo-brand')
on conflict (slug) do nothing;

insert into public.products (brand_id, name, slug, description, is_active)
select id, 'Demo Runner 01', 'demo-runner-01', 'Sample catalog item for local and thesis testing.', true
from public.brands where slug = 'demo-brand'
on conflict (slug) do nothing;

insert into public.product_variants (product_id, sku, size, color, price, low_stock_threshold, is_active)
select id, 'DEMO-RUN-01-BLK-42', '42', 'Black', 899000, 3, true
from public.products where slug = 'demo-runner-01'
on conflict (sku) do nothing;

with inserted_stock as (
  insert into public.stock_levels (variant_id, location_code, on_hand)
  select id, location_code::public.inventory_location, quantity
  from public.product_variants
  cross join (values ('STORE', 5), ('ONLINE', 8)) as stock(location_code, quantity)
  where sku = 'DEMO-RUN-01-BLK-42'
  on conflict (variant_id, location_code) do nothing
  returning variant_id, location_code, on_hand
)
insert into public.stock_movements (
  variant_id, location_code, movement_type, quantity_delta, note
)
select variant_id, location_code, 'adjustment', on_hand, 'Initial demo seed balance'
from inserted_stock;

insert into public.preorder_batches (
  variant_id, name, quota, opens_at, closes_at, estimated_arrival, price,
  payment_plan, deposit_percent, status
)
select
  id, 'Demo preorder batch', 20,
  now() - interval '1 day', now() + interval '30 days',
  current_date + 45, 949000, 'deposit', 30, 'open'
from public.product_variants
where sku = 'DEMO-RUN-01-BLK-42'
  and not exists (
    select 1 from public.preorder_batches
    where name = 'Demo preorder batch' and variant_id = product_variants.id
  );
