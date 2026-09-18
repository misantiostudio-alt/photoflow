-- Safe public Order Pass status by unguessable UUID token.
-- Drop first because PostgreSQL cannot change the OUT-parameter row shape with CREATE OR REPLACE.
drop function if exists public.get_public_order_v2(uuid);

create function public.get_public_order_v2(_public_token uuid)
returns table(
  order_number text,
  client_name text,
  group_name text,
  total numeric,
  paid numeric,
  payment_status text,
  production_status text,
  delivered_at timestamptz,
  payment_pending boolean,
  pending_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.order_number,
    p.full_name,
    p.batch,
    o.total,
    o.paid,
    o.payment_status,
    o.production_status,
    o.delivered_at,
    exists(select 1 from public.payments x where x.order_id = o.id and x.status = 'pending'),
    coalesce((select sum(x.amount) from public.payments x where x.order_id = o.id and x.status = 'pending'),0)
  from public.orders o
  join public.participants p on p.id = o.participant_id
  where o.public_token = _public_token and o.status <> 'cancelled'
  limit 1;
$$;

grant execute on function public.get_public_order_v2(uuid) to anon, authenticated;
