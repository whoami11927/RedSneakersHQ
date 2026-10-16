create extension if not exists pg_cron with schema pg_catalog;

create function public.release_expired_checkout_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_order record;
  released_orders integer := 0;
begin
  for expired_order in
    select o.id
    from public.orders o
    where o.status = 'pending_payment'
      and o.reservation_expires_at <= statement_timestamp()
    order by o.reservation_expires_at, o.id
    for update skip locked
    limit 100
  loop
    perform public.release_stock_reservation(
      expired_order.id,
      'Checkout reservation expired'
    );
    perform public.release_preorder_reservation(expired_order.id);

    update public.orders
    set status = 'cancelled'
    where id = expired_order.id
      and status = 'pending_payment';
    if found then
      released_orders := released_orders + 1;
    end if;
  end loop;

  return released_orders;
end;
$$;

revoke all on function public.release_expired_checkout_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_checkout_reservations() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'release-expired-checkout-reservations';

select cron.schedule(
  'release-expired-checkout-reservations',
  '* * * * *',
  'select public.release_expired_checkout_reservations();'
);
