-- PhotoFlow 2.1 shared orders
-- Normal flow remains one person. Additional people are optional and stay inside the same event/class gallery.

alter table public.order_items
  add column if not exists participant_id uuid references public.participants(id) on delete set null;

create index if not exists order_items_participant_idx
  on public.order_items(order_id, participant_id);

create table if not exists public.order_members (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict,
  photo_id uuid references public.photos(id) on delete set null,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(order_id, participant_id)
);

create index if not exists order_members_order_idx on public.order_members(order_id, sort_order);
create index if not exists order_members_participant_idx on public.order_members(participant_id);

alter table public.order_members enable row level security;
grant select, insert, update, delete on public.order_members to authenticated;
grant all on public.order_members to service_role;

drop policy if exists "order members staff read" on public.order_members;
create policy "order members staff read"
on public.order_members for select to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists "order members staff write" on public.order_members;
create policy "order members staff write"
on public.order_members for all to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

-- Backfill existing orders as one-person orders.
insert into public.order_members(order_id, participant_id, photo_id, is_primary, sort_order)
select o.id, o.participant_id, o.photo_id, true, 1
from public.orders o
where not exists (
  select 1 from public.order_members om where om.order_id = o.id
)
on conflict (order_id, participant_id) do nothing;

update public.order_items oi
set participant_id = o.participant_id
from public.orders o
where oi.order_id = o.id
  and oi.kind = 'solo_addon'
  and oi.participant_id is null;

create or replace function public.submit_client_order_v4(
  _members jsonb,
  _group_package_id uuid,
  _group_package_qty int default 1
)
returns table(order_id uuid, order_number text, public_token uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  _member jsonb;
  _first_member jsonb;
  _participant public.participants%rowtype;
  _primary public.participants%rowtype;
  _solo_photo public.photos%rowtype;
  _group_package public.packages%rowtype;
  _addon jsonb;
  _addon_package public.packages%rowtype;
  _participant_id uuid;
  _solo_photo_id uuid;
  _group_photo_id uuid;
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric(10,2) := 0;
  _requested_qty int;
  _member_sort int := 0;
  _member_count int;
  _seen uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(_members) <> 'array' then
    raise exception 'Order members are invalid.';
  end if;

  _member_count := jsonb_array_length(_members);
  if _member_count < 1 or _member_count > 6 then
    raise exception 'An order can include 1 to 6 people.';
  end if;

  _group_package_qty := greatest(1, least(10, coalesce(_group_package_qty,1)));
  _first_member := _members->0;

  begin
    _participant_id := (_first_member->>'participant_id')::uuid;
  exception when others then
    raise exception 'Primary person is invalid.';
  end;

  select * into _primary from public.participants where id = _participant_id;
  if not found then raise exception 'Primary person was not found.'; end if;

  select * into _group_package
  from public.packages
  where id = _group_package_id
    and event_id = _primary.event_id
    and product_type = 'group_package'
    and active = true;
  if not found then raise exception 'Class photo package is not available.'; end if;

  if _primary.event_group_id is not null then
    select id into _group_photo_id
    from public.photos
    where event_id = _primary.event_id
      and event_group_id = _primary.event_group_id
      and photo_type = 'group'
    order by sort_order, created_at
    limit 1;
  elsif _primary.batch is not null then
    select id into _group_photo_id
    from public.photos
    where event_id = _primary.event_id
      and photo_type = 'group'
      and lower(trim(coalesce(group_name,''))) = lower(trim(_primary.batch))
    order by sort_order, created_at
    limit 1;
  end if;

  -- Validate every person and photo before creating anything.
  for _member in select * from jsonb_array_elements(_members) loop
    begin
      _participant_id := (_member->>'participant_id')::uuid;
      _solo_photo_id := (_member->>'solo_photo_id')::uuid;
    exception when others then
      raise exception 'One of the selected people is invalid.';
    end;

    if _participant_id = any(_seen) then
      raise exception 'The same person was added more than once.';
    end if;
    _seen := array_append(_seen, _participant_id);

    select * into _participant from public.participants where id = _participant_id;
    if not found then raise exception 'One of the selected people was not found.'; end if;

    if _participant.event_id <> _primary.event_id
       or _participant.event_group_id is distinct from _primary.event_group_id then
      raise exception 'Everyone in a shared order must come from the same gallery.';
    end if;

    select * into _solo_photo
    from public.photos
    where id = _solo_photo_id
      and event_id = _primary.event_id
      and participant_id = _participant.id
      and photo_type = 'solo';
    if not found then raise exception 'One selected solo photo is no longer available.'; end if;

    if exists (
      select 1
      from public.orders o
      left join public.order_members om on om.order_id = o.id
      where o.status <> 'cancelled'
        and (o.participant_id = _participant.id or om.participant_id = _participant.id)
    ) then
      raise exception '% already has an active order for this event.', _participant.full_name;
    end if;
  end loop;

  _order_number := upper((select id_prefix from public.events where id = _primary.event_id))
    || '-ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _public_token := gen_random_uuid();
  _total := _group_package.price * _group_package_qty;

  insert into public.orders(
    event_id, participant_id, order_number, package_id, photo_id, public_token,
    total, paid, payment_status, status, production_status
  ) values (
    _primary.event_id,
    _primary.id,
    _order_number,
    _group_package.id,
    (_first_member->>'solo_photo_id')::uuid,
    _public_token,
    _total,
    0,
    'unpaid',
    'payment_pending',
    'for_print'
  ) returning id into _order_id;

  insert into public.order_items(
    order_id, label, print_size, quantity, framed, unit_price, photo_id, kind, participant_id
  ) values (
    _order_id,
    coalesce(_group_package.code || ' · ','') || _group_package.name,
    _group_package.print_size,
    _group_package.quantity * _group_package_qty,
    _group_package.framed,
    _group_package.price,
    _group_photo_id,
    'group_package',
    null
  );

  for _member in select * from jsonb_array_elements(_members) loop
    _member_sort := _member_sort + 1;
    _participant_id := (_member->>'participant_id')::uuid;
    _solo_photo_id := (_member->>'solo_photo_id')::uuid;

    select * into _participant from public.participants where id = _participant_id;

    insert into public.order_members(
      order_id, participant_id, photo_id, is_primary, sort_order
    ) values (
      _order_id, _participant_id, _solo_photo_id, _member_sort = 1, _member_sort
    );

    for _addon in
      select * from jsonb_array_elements(coalesce(_member->'addons','[]'::jsonb))
    loop
      _requested_qty := greatest(1, least(10, coalesce((_addon->>'quantity')::int,1)));

      select * into _addon_package
      from public.packages
      where id = (_addon->>'package_id')::uuid
        and event_id = _primary.event_id
        and product_type = 'solo_addon'
        and active = true;
      if not found then
        raise exception 'One of the solo add-ons is no longer available.';
      end if;

      _total := _total + (_addon_package.price * _requested_qty);

      insert into public.order_items(
        order_id, label, print_size, quantity, framed, unit_price, photo_id, kind, participant_id
      ) values (
        _order_id,
        _participant.full_name || ' · ' || _addon_package.name,
        _addon_package.print_size,
        _addon_package.quantity * _requested_qty,
        _addon_package.framed,
        _addon_package.price,
        _solo_photo_id,
        'solo_addon',
        _participant.id
      );
    end loop;
  end loop;

  update public.orders set total = _total where id = _order_id;
  return query select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v4(jsonb,uuid,int) to anon, authenticated;