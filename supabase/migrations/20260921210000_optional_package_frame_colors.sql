-- Optional per-package frame color chooser.
-- One configured color is auto-applied and the client chooser is hidden.

alter table public.packages
  add column if not exists frame_colors text[] not null
  default array['black','white','brown']::text[];

update public.packages
set frame_colors = array['black']::text[]
where cardinality(frame_colors) = 0;

alter table public.packages
  drop constraint if exists packages_frame_colors_check;

alter table public.packages
  add constraint packages_frame_colors_check
  check (
    cardinality(frame_colors) between 1 and 3
    and frame_colors <@ array['black','white','brown']::text[]
  );

-- The public gallery package RPC must expose the configured colors.
drop function if exists public.get_gallery_packages_by_token(uuid);

create function public.get_gallery_packages_by_token(_share_token uuid)
returns table(
  id uuid, name text, code text, product_type text, price numeric,
  print_size text, quantity int, framed boolean, digital_copy boolean,
  description text, sort_order int, frame_colors text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.name, p.code, p.product_type, p.price, p.print_size, p.quantity,
    p.framed, p.digital_copy, p.description, p.sort_order,
    coalesce(p.frame_colors, array['black']::text[])
  from public.packages p
  where p.active = true
    and p.event_id = (select g.event_id from public.get_gallery_by_token(_share_token) g)
  order by p.sort_order;
$$;

revoke all on function public.get_gallery_packages_by_token(uuid) from public;
grant execute on function public.get_gallery_packages_by_token(uuid) to anon, authenticated;

-- Keep checkout authoritative: a submitted color must be allowed by its package.
create or replace function public.submit_client_order_v6(
  _resume_token uuid,
  _group_package_id uuid,
  _group_frame_color text default 'black',
  _solo_addons jsonb default '[]'::jsonb
)
returns table(
  order_id uuid,
  order_number text,
  public_token uuid,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _participant public.participants%rowtype;
  _group_package public.packages%rowtype;
  _solo_photo public.photos%rowtype;
  _group_photo_id uuid;
  _existing public.orders%rowtype;
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric(10,2) := 0;
  _addon jsonb;
  _addon_package public.packages%rowtype;
  _qty int;
  _addon_frame_color text;
  _resolved_group_frame_color text;
begin
  select * into _participant
  from public.participants
  where resume_token = _resume_token
  for update;

  if not found then
    raise exception 'Your saved order session is not valid anymore.';
  end if;

  select * into _existing
  from public.orders
  where participant_id = _participant.id
    and status <> 'cancelled'
  limit 1;

  if found then
    return query
    select _existing.id, _existing.order_number, _existing.public_token, _existing.total;
    return;
  end if;

  select * into _solo_photo
  from public.photos
  where participant_id = _participant.id
    and photo_type = 'solo'
  limit 1;

  if not found then
    raise exception 'Your portrait selection could not be found.';
  end if;

  select * into _group_package
  from public.packages
  where id = _group_package_id
    and event_id = _participant.event_id
    and product_type = 'group_package'
    and active = true;

  if not found then
    raise exception 'Class/group package is not available.';
  end if;

  _resolved_group_frame_color :=
    case
      when _group_package.framed then
        case
          when lower(coalesce(_group_frame_color,'')) = any(coalesce(_group_package.frame_colors, array['black']::text[]))
            then lower(_group_frame_color)
          else coalesce(_group_package.frame_colors[1], 'black')
        end
      else null
    end;

  if _participant.event_group_id is not null then
    select id into _group_photo_id
    from public.photos
    where event_id = _participant.event_id
      and event_group_id = _participant.event_group_id
      and photo_type = 'group'
    order by sort_order, created_at
    limit 1;
  end if;

  if _group_photo_id is null and _participant.batch is not null then
    select id into _group_photo_id
    from public.photos
    where event_id = _participant.event_id
      and photo_type = 'group'
      and lower(trim(coalesce(group_name,''))) = lower(trim(_participant.batch))
    order by sort_order, created_at
    limit 1;
  end if;

  if _group_photo_id is null then
    select id into _group_photo_id
    from public.photos
    where event_id = _participant.event_id
      and event_group_id is null
      and photo_type = 'group'
    order by sort_order, created_at
    limit 1;
  end if;

  if _group_photo_id is null then
    raise exception 'The official class photo is not available yet.';
  end if;

  _order_number := upper((select id_prefix from public.events where id = _participant.event_id))
    || '-ORD-'
    || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  _public_token := gen_random_uuid();
  _total := _group_package.price;

  insert into public.orders (
    event_id,
    participant_id,
    order_number,
    package_id,
    photo_id,
    public_token,
    total,
    paid,
    payment_status,
    status,
    production_status
  ) values (
    _participant.event_id,
    _participant.id,
    _order_number,
    _group_package.id,
    _solo_photo.id,
    _public_token,
    _total,
    0,
    'unpaid',
    'payment_pending',
    'for_print'
  )
  returning id into _order_id;

  insert into public.order_items(
    order_id,
    label,
    print_size,
    quantity,
    framed,
    unit_price,
    photo_id,
    kind,
    frame_color
  )
  values (
    _order_id,
    coalesce(_group_package.code || ' · ','') || _group_package.name,
    _group_package.print_size,
    _group_package.quantity,
    _group_package.framed,
    _group_package.price,
    _group_photo_id,
    'group_package',
    _resolved_group_frame_color
  );

  for _addon in
    select * from jsonb_array_elements(coalesce(_solo_addons,'[]'::jsonb))
  loop
    _qty := greatest(1, least(10, coalesce((_addon->>'quantity')::int,1)));

    select * into _addon_package
    from public.packages
    where id = (_addon->>'package_id')::uuid
      and event_id = _participant.event_id
      and product_type = 'solo_addon'
      and active = true;

    if not found then
      raise exception 'One of the solo add-ons is no longer available.';
    end if;

    _addon_frame_color :=
      case
        when _addon_package.framed then
          case
            when lower(coalesce(_addon->>'frame_color','')) = any(coalesce(_addon_package.frame_colors, array['black']::text[]))
              then lower(_addon->>'frame_color')
            else coalesce(_addon_package.frame_colors[1], 'black')
          end
        else null
      end;

    _total := _total + (_addon_package.price * _qty);

    insert into public.order_items(
      order_id,
      label,
      print_size,
      quantity,
      framed,
      unit_price,
      photo_id,
      kind,
      frame_color
    )
    values (
      _order_id,
      _addon_package.name,
      _addon_package.print_size,
      _addon_package.quantity * _qty,
      _addon_package.framed,
      _addon_package.price,
      _solo_photo.id,
      'solo_addon',
      _addon_frame_color
    );
  end loop;

  update public.orders
  set total = _total
  where id = _order_id;

  return query
  select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v6(uuid,uuid,text,jsonb)
to anon, authenticated;

revoke all on function public.submit_client_order_v6(uuid,uuid,text,jsonb) from public;
grant execute on function public.submit_client_order_v6(uuid,uuid,text,jsonb) to anon, authenticated;
