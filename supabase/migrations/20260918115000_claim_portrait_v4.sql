-- PhotoFlow client identity claim v4
-- Works with both event-level galleries and optional batch/class galleries.

create or replace function public.claim_solo_portrait_v4(
  _event_id uuid,
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
  thumbnail_url text
)
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
  if length(trim(coalesce(_full_name,''))) < 2 then
    raise exception 'Please enter your full name.';
  end if;

  if length(trim(coalesce(_contact_number,''))) < 7 then
    raise exception 'Please enter a valid contact number.';
  end if;

  select * into _photo
  from public.photos
  where id = _photo_id
    and event_id = _event_id
    and photo_type = 'solo'
    and is_separator = false
  for update;

  if not found then
    raise exception 'This photo is no longer available.';
  end if;

  if _photo.participant_id is not null then
    raise exception 'This photo has already been selected. Please choose another photo or contact the studio.';
  end if;

  select exists(
    select 1
    from public.event_groups
    where event_id = _event_id and active = true
  ) into _has_groups;

  if _has_groups then
    if _photo.event_group_id is null then
      raise exception 'This photo is not assigned to a class yet. Please contact the studio.';
    end if;

    select name into _group_name
    from public.event_groups
    where id = _photo.event_group_id
      and event_id = _event_id
      and active = true;

    if not found then
      raise exception 'This class gallery is not available.';
    end if;
  else
    -- Event-level gallery: no class selection required.
    select name into _group_name
    from public.events
    where id = _event_id and status <> 'demo';
  end if;

  select id_prefix into _prefix
  from public.events
  where id = _event_id and status <> 'demo';

  if not found then
    raise exception 'This event is not available.';
  end if;

  _participant_code :=
    upper(coalesce(nullif(trim(_prefix),''),'EVT'))
    || '-'
    || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.participants(
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
  )
  values(
    _event_id,
    _photo.event_group_id,
    _participant_code,
    trim(_full_name),
    nullif(trim(coalesce(_organization,'')),''),
    _group_name,
    trim(_contact_number),
    nullif(trim(coalesce(_email,'')),''),
    coalesce(_photo.thumbnail_url, _photo.url),
    'shot',
    'ready'
  )
  returning id into _participant_id;

  update public.photos
  set participant_id = _participant_id
  where id = _photo_id;

  return query
  select
    _participant_id,
    _participant_code,
    _group_name,
    coalesce(_photo.thumbnail_url, _photo.url);
end;
$$;

grant execute on function public.claim_solo_portrait_v4(uuid,uuid,text,text,text,text)
to anon, authenticated;