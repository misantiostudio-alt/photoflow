-- Reconcile PhotoFlow secure public checkout with event-level galleries.
-- Keeps the existing share_token + resume_token API contract intact.

create or replace function public.claim_solo_portrait_v4(
  _share_token uuid,
  _photo_id uuid,
  _full_name text,
  _organization text,
  _contact_number text,
  _email text default null
)
returns table(
  participant_id uuid,
  participant_code text,
  group_name text,
  resume_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _scope record;
  _photo public.photos%rowtype;
  _prefix text;
  _pid uuid;
  _code text;
  _resume uuid;
  _resolved_group_name text;
begin
  if length(trim(coalesce(_full_name,''))) < 2 then
    raise exception 'Please enter your full name.';
  end if;
  if length(trim(coalesce(_contact_number,''))) < 7 then
    raise exception 'Please enter a valid contact number.';
  end if;

  select * into _scope from public.get_gallery_by_token(_share_token);
  if not found then
    raise exception 'This gallery link is not available.';
  end if;

  select * into _photo
  from public.photos
  where id = _photo_id
    and event_id = _scope.event_id
    and photo_type = 'solo'
    and is_separator = false
    and (_scope.group_id is null or event_group_id = _scope.group_id)
  for update;

  if not found then
    raise exception 'Portrait not found in this gallery.';
  end if;

  if _photo.participant_id is not null then
    raise exception 'This portrait has already been claimed. Please ask the studio for help.';
  end if;

  select id_prefix into _prefix
  from public.events
  where id = _scope.event_id;

  _resolved_group_name := coalesce(
    nullif(trim(coalesce(_scope.group_name,'')),''),
    (select e.name from public.events e where e.id = _scope.event_id)
  );

  _code := upper(coalesce(_prefix,'EVT'))
    || '-'
    || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.participants (
    event_id,
    event_group_id,
    participant_code,
    full_name,
    organization,
    batch,
    contact_number,
    email,
    thumbnail_url,
    shooting_status,
    gallery_status
  ) values (
    _scope.event_id,
    _photo.event_group_id,
    _code,
    trim(_full_name),
    nullif(trim(coalesce(_organization,'')),''),
    _resolved_group_name,
    trim(_contact_number),
    nullif(trim(coalesce(_email,'')),''),
    _photo.url,
    'shot',
    'ready'
  )
  returning id, participants.resume_token into _pid, _resume;

  update public.photos
  set participant_id = _pid
  where id = _photo_id;

  return query
  select _pid, _code, _resolved_group_name, _resume;
end;
$$;

grant execute on function public.claim_solo_portrait_v4(uuid,uuid,text,text,text,text)
to anon, authenticated;

create or replace function public.submit_client_order_v4(
  _resume_token uuid,
  _group_package_id uuid,
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
    kind
  )
  values (
    _order_id,
    coalesce(_group_package.code || ' · ','') || _group_package.name,
    _group_package.print_size,
    _group_package.quantity,
    _group_package.framed,
    _group_package.price,
    _group_photo_id,
    'group_package'
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

    _total := _total + (_addon_package.price * _qty);

    insert into public.order_items(
      order_id,
      label,
      print_size,
      quantity,
      framed,
      unit_price,
      photo_id,
      kind
    )
    values (
      _order_id,
      _addon_package.name,
      _addon_package.print_size,
      _addon_package.quantity * _qty,
      _addon_package.framed,
      _addon_package.price,
      _solo_photo.id,
      'solo_addon'
    );
  end loop;

  update public.orders
  set total = _total
  where id = _order_id;

  return query
  select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v4(uuid,uuid,jsonb)
to anon, authenticated;