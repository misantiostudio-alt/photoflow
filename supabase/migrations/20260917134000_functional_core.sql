-- PhotoFlow functional core hardening
-- Adds first-owner bootstrap, staff-only writes, event-scoped automation,
-- payment rollups and persistent production checklist support.

-- Mark the original seeded showcase event so the product can distinguish it from real work.
update public.events
set status = 'demo'
where id = '11111111-1111-1111-1111-111111111111'
  and slug = 'sce-2026';

-- ----- Staff authorization -----
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id
  );
$$;

create or replace function public.bootstrap_available()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select not exists (select 1 from auth.users);
$$;

grant execute on function public.bootstrap_available() to anon, authenticated;

create or replace function public.assign_first_user_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'owner')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists photoflow_first_owner on auth.users;
create trigger photoflow_first_owner
after insert on auth.users
for each row execute function public.assign_first_user_owner();

-- Let owners manage future staff roles while everyone can still read their own role.
drop policy if exists "owners manage roles" on public.user_roles;
create policy "owners manage roles"
on public.user_roles
for all
to authenticated
using (public.has_role(auth.uid(), 'owner'))
with check (public.has_role(auth.uid(), 'owner'));

-- Replace broad authenticated-write policies with actual staff checks.
drop policy if exists "events staff write" on public.events;
create policy "events staff write" on public.events for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "packages staff write" on public.packages;
create policy "packages staff write" on public.packages for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "participants staff write" on public.participants;
create policy "participants staff write" on public.participants for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "photos staff write" on public.photos;
create policy "photos staff write" on public.photos for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "orders staff write" on public.orders;
create policy "orders staff write" on public.orders for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "order items staff write" on public.order_items;
create policy "order items staff write" on public.order_items for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "payments staff write" on public.payments;
create policy "payments staff write" on public.payments for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "production staff write" on public.production_checks;
create policy "production staff write" on public.production_checks for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "deliveries staff write" on public.deliveries;
create policy "deliveries staff write" on public.deliveries for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ----- Photo automation -----
create or replace function public.mark_gallery_ready_from_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.participant_id is not null and new.is_separator = false then
    update public.participants
    set gallery_status = 'ready'
    where id = new.participant_id
      and gallery_status <> 'ready';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_mark_gallery_ready on public.photos;
create trigger photos_mark_gallery_ready
after insert or update of participant_id on public.photos
for each row execute function public.mark_gallery_ready_from_photo();

-- ----- Payment rollups -----
create or replace function public.recalculate_order_payment(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_due numeric(10,2);
  verified_paid numeric(10,2);
  latest_method text;
begin
  select total into total_due from public.orders where id = _order_id;
  if total_due is null then return; end if;

  select coalesce(sum(amount), 0)
    into verified_paid
  from public.payments
  where order_id = _order_id and status = 'verified';

  select method
    into latest_method
  from public.payments
  where order_id = _order_id and status = 'verified'
  order by paid_at desc
  limit 1;

  update public.orders
  set paid = verified_paid,
      payment_method = coalesce(latest_method, payment_method),
      payment_status = case
        when verified_paid <= 0 then 'unpaid'
        when verified_paid < total_due then 'partial'
        else 'paid'
      end,
      status = case
        when verified_paid >= total_due and status in ('submitted','payment_pending') then 'confirmed'
        when verified_paid < total_due and status = 'submitted' then 'payment_pending'
        else status
      end
  where id = _order_id;
end;
$$;

create or replace function public.sync_order_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_order_payment(old.order_id);
    return old;
  end if;

  perform public.recalculate_order_payment(new.order_id);
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.recalculate_order_payment(old.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists payments_sync_order on public.payments;
create trigger payments_sync_order
after insert or update or delete on public.payments
for each row execute function public.sync_order_payment_totals();

-- Recalculate all existing orders once so the dashboard reflects verified payment records.
do $$
declare r record;
begin
  for r in select id from public.orders loop
    perform public.recalculate_order_payment(r.id);
  end loop;
end $$;

-- ----- Persistent QC / delivery integrity -----
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'production_checks_order_stage_unique'
  ) then
    alter table public.production_checks
      add constraint production_checks_order_stage_unique unique (order_id, stage);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'deliveries_order_id_unique'
  ) then
    alter table public.deliveries
      add constraint deliveries_order_id_unique unique (order_id);
  end if;
end $$;

-- Tighten photo bucket writes to staff accounts.
drop policy if exists "event photos staff insert" on storage.objects;
create policy "event photos staff insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

drop policy if exists "event photos staff update" on storage.objects;
create policy "event photos staff update"
on storage.objects for update to authenticated
using (bucket_id = 'event-photos' and public.is_staff(auth.uid()))
with check (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

drop policy if exists "event photos staff delete" on storage.objects;
create policy "event photos staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'event-photos' and public.is_staff(auth.uid()));
