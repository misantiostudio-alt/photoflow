-- PhotoFlow frame color choices
-- Saves the customer's selected frame finish on each framed order item.

alter table public.order_items
  add column if not exists frame_color text;

update public.order_items
set frame_color = 'black'
where framed = true
  and frame_color is null;

alter table public.order_items
  drop constraint if exists order_items_frame_color_check;

alter table public.order_items
  add constraint order_items_frame_color_check
  check (
    frame_color is null
    or frame_color in ('black','white','brown')
  );

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
        case when lower(coalesce(_group_frame_color,'')) in ('black','white','brown')
          then lower(_group_frame_color)
          else 'black'
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
          case when lower(coalesce(_addon->>'frame_color','')) in ('black','white','brown')
            then lower(_addon->>'frame_color')
            else 'black'
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