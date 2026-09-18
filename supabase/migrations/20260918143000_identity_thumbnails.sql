-- PhotoFlow identity thumbnails for backend recognition

alter table public.photos
  add column if not exists identity_thumbnail_path text,
  add column if not exists identity_thumbnail_url text;

create index if not exists photos_identity_thumbnail_idx
  on public.photos(event_id, photo_type)
  where identity_thumbnail_url is not null;

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
    coalesce(_photo.identity_thumbnail_url, _photo.thumbnail_url, _photo.url),
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