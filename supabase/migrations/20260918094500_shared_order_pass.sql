-- PhotoFlow 2.1 public shared-order status

create or replace function public.get_public_order_v4(_public_token uuid)
returns table(
  order_number text,
  client_name text,
  member_names text[],
  member_count int,
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
    coalesce(
      (
        select array_agg(mp.full_name order by om.sort_order)
        from public.order_members om
        join public.participants mp on mp.id = om.participant_id
        where om.order_id = o.id
      ),
      array[p.full_name]
    ),
    coalesce(
      (select count(*)::int from public.order_members om where om.order_id = o.id),
      1
    ),
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

grant execute on function public.get_public_order_v4(uuid) to anon, authenticated;