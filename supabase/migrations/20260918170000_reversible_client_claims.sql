-- Allow a client to safely abandon an unconfirmed portrait reservation.
-- A reservation is only releasable while it has no active order.

create or replace function public.release_client_claim_v1(_resume_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _participant_id uuid;
begin
  select p.id
  into _participant_id
  from public.participants p
  where p.resume_token = _resume_token
  for update;

  -- Already released / expired is safe and idempotent.
  if not found then
    return true;
  end if;

  -- Never undo a claim that is already attached to a real order.
  if exists (
    select 1
    from public.orders o
    where o.participant_id = _participant_id
      and o.status <> 'cancelled'
  ) or exists (
    select 1
    from public.order_members om
    join public.orders o on o.id = om.order_id
    where om.participant_id = _participant_id
      and o.status <> 'cancelled'
  ) then
    return false;
  end if;

  update public.photos
  set participant_id = null
  where participant_id = _participant_id;

  delete from public.participants
  where id = _participant_id;

  return true;
end;
$$;

revoke all on function public.release_client_claim_v1(uuid) from public;
grant execute on function public.release_client_claim_v1(uuid) to anon, authenticated;
