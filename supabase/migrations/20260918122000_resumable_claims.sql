-- PhotoFlow resumable portrait reservations
-- Selecting a portrait reserves it temporarily. Confirming an order makes the claim permanent.

alter table public.participants
  add column if not exists claim_expires_at timestamptz;

create index if not exists participants_claim_expires_idx
  on public.participants(event_id, claim_expires_at)
  where claim_expires_at is not null;

create or replace function public.release_expired_photo_claims_v1(_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _released integer := 0;
begin
  with stale as (
    select p.id
    from public.participants p
    where p.event_id = _event_id
      and (
        p.claim_expires_at < now()
        or (p.claim_expires_at is null and p.created_at < now() - interval '2 hours')
      )
      and not exists (
        select 1 from public.orders o
        where o.participant_id = p.id
      )
      and not exists (
        select 1 from public.order_members om
        where om.participant_id = p.id
      )
  ),
  cleared as (
    update public.photos ph
    set participant_id = null
    where ph.participant_id in (select id from stale)
    returning ph.id
  ),
  deleted as (
    delete from public.participants p
    where p.id in (select id from stale)
    returning p.id
  )
  select count(*)::int into _released from cleared;

  return _released;
end;
$$;

grant execute on function public.release_expired_photo_claims_v1(uuid)
to anon, authenticated;

create or replace function public.claim_solo_portrait_v5(
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
  thumbnail_url text,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _photo public.photos%rowtype;
  _existing public.participants%rowtype;
  _prefix text;
  _participant_id uuid;
  _participant_code text;
  _group_name text;
  _has_groups boolean;
  _expires_at timestamptz := now() + interval '2 hours';
  _same_person boolean := false;
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
    select * into _existing
    from public.participants
    where id = _photo.participant_id;

    if found then
      if exists (
        select 1 from public.orders o
        left join public.order_members om on om.order_id = o.id
        where o.status <> 'cancelled'
          and (o.participant_id = _existing.id or om.participant_id = _existing.id)
      ) then
        raise exception 'This photo is already part of an active order.';
      end if;

      _same_person :=
        lower(trim(_existing.full_name)) = lower(trim(_full_name))
        and regexp_replace(coalesce(_existing.contact_number,''), '[^0-9]+', '', 'g')
            = regexp_replace(coalesce(_contact_number,''), '[^0-9]+', '', 'g');

      if _same_person then
        update public.participants
        set
          organization = nullif(trim(coalesce(_organization,'')),''),
          email = nullif(trim(coalesce(_email,'')),''),
          claim_expires_at = _expires_at
        where id = _existing.id;

        return query
        select
          _existing.id,
          _existing.participant_code,
          _existing.batch,
          _existing.thumbnail_url,
          _expires_at;
        return;
      end if;

      if (
        (_existing.claim_expires_at is not null and _existing.claim_expires_at < now())
        or (_existing.claim_expires_at is null and _existing.created_at < now() - interval '2 hours')
      ) then
        update public.photos set participant_id = null where id = _photo.id;
        delete from public.participants where id = _existing.id;
        _photo.participant_id := null;
      else
        raise exception 'This photo is temporarily reserved. Please choose another photo or try again later.';
      end if;
    else
      update public.photos set participant_id = null where id = _photo.id;
      _photo.participant_id := null;
    end if;
  end if;

  select exists(
    select 1 from public.event_groups
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
    gallery_status,
    claim_expires_at
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
    'ready',
    _expires_at
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
    coalesce(_photo.thumbnail_url, _photo.url),
    _expires_at;
end;
$$;

grant execute on function public.claim_solo_portrait_v5(uuid,uuid,text,text,text,text)
to anon, authenticated;

create or replace function public.submit_client_order_v5(
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
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric;
begin
  select s.order_id, s.order_number, s.public_token, s.total
  into _order_id, _order_number, _public_token, _total
  from public.submit_client_order_v4(_members, _group_package_id, _group_package_qty) s;

  update public.participants p
  set claim_expires_at = null
  where p.id in (
    select om.participant_id
    from public.order_members om
    where om.order_id = _order_id
  );

  return query select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v5(jsonb,uuid,int)
to anon, authenticated;