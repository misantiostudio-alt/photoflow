-- PhotoFlow 2.0 batch-scoped galleries
-- Every photo remains scoped by event_id; event_group_id adds strict class/batch separation inside an event.

alter table public.photos
  add column if not exists event_group_id uuid references public.event_groups(id) on delete set null;

alter table public.participants
  add column if not exists event_group_id uuid references public.event_groups(id) on delete set null;

create index if not exists photos_event_group_idx on public.photos(event_id, event_group_id, photo_type);
create index if not exists participants_event_group_idx on public.participants(event_id, event_group_id);

-- Backfill existing labeled photos/participants when their text label matches a configured event group.
update public.photos ph
set event_group_id = g.id
from public.event_groups g
where ph.event_group_id is null
  and ph.event_id = g.event_id
  and ph.group_name is not null
  and lower(trim(ph.group_name)) = lower(trim(g.name));

update public.participants p
set event_group_id = g.id
from public.event_groups g
where p.event_group_id is null
  and p.event_id = g.event_id
  and p.batch is not null
  and lower(trim(p.batch)) = lower(trim(g.name));

-- Client identifies themself from a photo. Batch/class is derived from the photo's gallery,
-- so the client never needs to know or type their batch.
create or replace function public.claim_solo_portrait_v3(
  _event_id uuid,
  _photo_id uuid,
  _full_name text,
  _organization text,
  _contact_number text,
  _email text default null
)
returns table(participant_id uuid, participant_code text, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _photo public.photos%rowtype;
  _prefix text;
  _participant_id uuid;
  _participant_code text;
  _group_name text;
  _has_groups boolean;
begin
  if length(trim(coalesce(_full_name,''))) < 2 then raise exception 'Please enter your full name.'; end if;
  if length(trim(coalesce(_contact_number,''))) < 7 then raise exception 'Please enter a valid contact number.'; end if;

  select * into _photo
  from public.photos
  where id = _photo_id
    and event_id = _event_id
    and photo_type = 'solo'
    and is_separator = false
  for update;

  if not found then raise exception 'Portrait not found.'; end if;
  if _photo.participant_id is not null then raise exception 'This portrait has already been claimed. Please ask the studio for help.'; end if;

  select exists(select 1 from public.event_groups where event_id = _event_id and active = true) into _has_groups;
  if _has_groups and _photo.event_group_id is null then
    raise exception 'This portrait is not assigned to a class/batch gallery yet. Please ask the studio for help.';
  end if;

  if _photo.event_group_id is not null then
    select name into _group_name from public.event_groups
    where id = _photo.event_group_id and event_id = _event_id and active = true;
    if not found then raise exception 'This class/batch gallery is not available.'; end if;
  else
    _group_name := nullif(trim(coalesce(_photo.group_name,'')),'');
  end if;

  select id_prefix into _prefix from public.events where id = _event_id and status <> 'demo';
  if not found then raise exception 'Event is not available.'; end if;

  _participant_code := upper(coalesce(_prefix,'EVT')) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.participants (
    event_id, event_group_id, participant_code, full_name, organization, batch,
    contact_number, email, thumbnail_url, shooting_status, gallery_status
  ) values (
    _event_id, _photo.event_group_id, _participant_code, trim(_full_name),
    nullif(trim(coalesce(_organization,'')),''), _group_name,
    trim(_contact_number), nullif(trim(coalesce(_email,'')),''),
    _photo.url, 'shot', 'ready'
  ) returning id into _participant_id;

  update public.photos set participant_id = _participant_id where id = _photo_id;
  return query select _participant_id, _participant_code, _group_name;
end;
$$;

grant execute on function public.claim_solo_portrait_v3(uuid,uuid,text,text,text,text) to anon, authenticated;

-- Checkout matches the official group photo using the participant's event_group_id,
-- preventing same-named batches from other events or classes from being mixed.
create or replace function public.submit_client_order_v3(
  _participant_id uuid,
  _solo_photo_id uuid,
  _group_package_id uuid,
  _solo_addons jsonb default '[]'::jsonb
)
returns table(order_id uuid, order_number text, public_token uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  _participant public.participants%rowtype;
  _group_package public.packages%rowtype;
  _solo_photo public.photos%rowtype;
  _group_photo_id uuid;
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric(10,2) := 0;
  _addon jsonb;
  _addon_package public.packages%rowtype;
  _requested_qty int;
begin
  select * into _participant from public.participants where id = _participant_id;
  if not found then raise exception 'Participant record not found.'; end if;

  select * into _solo_photo from public.photos
  where id = _solo_photo_id
    and event_id = _participant.event_id
    and participant_id = _participant.id
    and photo_type = 'solo';
  if not found then raise exception 'Selected solo portrait is not available.'; end if;

  if _participant.event_group_id is distinct from _solo_photo.event_group_id then
    raise exception 'The selected portrait does not belong to this class/batch.';
  end if;

  select * into _group_package from public.packages
  where id = _group_package_id
    and event_id = _participant.event_id
    and product_type = 'group_package'
    and active = true;
  if not found then raise exception 'Class/group package is not available.'; end if;

  if _participant.event_group_id is not null then
    select id into _group_photo_id from public.photos
    where event_id = _participant.event_id
      and event_group_id = _participant.event_group_id
      and photo_type = 'group'
    order by sort_order, created_at limit 1;
  elsif _participant.batch is not null then
    select id into _group_photo_id from public.photos
    where event_id = _participant.event_id
      and photo_type = 'group'
      and lower(trim(coalesce(group_name,''))) = lower(trim(_participant.batch))
    order by sort_order, created_at limit 1;
  end if;

  if exists (select 1 from public.orders where participant_id = _participant.id and status <> 'cancelled') then
    raise exception 'You already have an active order for this event. Please contact the studio if you need to change it.';
  end if;

  _order_number := upper((select id_prefix from public.events where id = _participant.event_id))
    || '-ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _public_token := gen_random_uuid();
  _total := _group_package.price;

  insert into public.orders (
    event_id, participant_id, order_number, package_id, photo_id, public_token,
    total, paid, payment_status, status, production_status
  ) values (
    _participant.event_id, _participant.id, _order_number, _group_package.id,
    _solo_photo.id, _public_token, _total, 0, 'unpaid', 'payment_pending', 'for_print'
  ) returning id into _order_id;

  insert into public.order_items(order_id,label,print_size,quantity,framed,unit_price,photo_id,kind)
  values (
    _order_id, coalesce(_group_package.code || ' · ','') || _group_package.name,
    _group_package.print_size, _group_package.quantity, _group_package.framed,
    _group_package.price, _group_photo_id, 'group_package'
  );

  for _addon in select * from jsonb_array_elements(coalesce(_solo_addons,'[]'::jsonb)) loop
    _requested_qty := greatest(1, least(10, coalesce((_addon->>'quantity')::int,1)));
    select * into _addon_package from public.packages
    where id = (_addon->>'package_id')::uuid
      and event_id = _participant.event_id
      and product_type = 'solo_addon'
      and active = true;
    if not found then raise exception 'One of the solo add-ons is no longer available.'; end if;

    _total := _total + (_addon_package.price * _requested_qty);
    insert into public.order_items(order_id,label,print_size,quantity,framed,unit_price,photo_id,kind)
    values (
      _order_id, _addon_package.name, _addon_package.print_size,
      _addon_package.quantity * _requested_qty, _addon_package.framed,
      _addon_package.price, _solo_photo.id, 'solo_addon'
    );
  end loop;

  update public.orders set total = _total where id = _order_id;
  return query select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v3(uuid,uuid,uuid,jsonb) to anon, authenticated;
