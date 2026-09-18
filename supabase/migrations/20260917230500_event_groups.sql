-- PhotoFlow 2.0 event group/class presets

create table if not exists public.event_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists event_groups_event_name_key
  on public.event_groups(event_id, lower(trim(name)));
create index if not exists event_groups_event_sort_idx
  on public.event_groups(event_id, sort_order, name);

grant select on public.event_groups to anon, authenticated;
grant insert, update, delete on public.event_groups to authenticated;
grant all on public.event_groups to service_role;

alter table public.event_groups enable row level security;

drop policy if exists "event groups public read" on public.event_groups;
create policy "event groups public read"
  on public.event_groups for select using (true);

drop policy if exists "event groups staff write" on public.event_groups;
create policy "event groups staff write"
  on public.event_groups for all to authenticated using (true) with check (true);

-- Preserve useful group/class names already present in real data.
insert into public.event_groups(event_id, name, sort_order)
select distinct p.event_id, trim(p.batch), 100
from public.participants p
where nullif(trim(coalesce(p.batch, '')), '') is not null
  and not exists (
    select 1 from public.event_groups g
    where g.event_id = p.event_id and lower(trim(g.name)) = lower(trim(p.batch))
  );

insert into public.event_groups(event_id, name, sort_order)
select distinct ph.event_id, trim(ph.group_name), 100
from public.photos ph
where ph.photo_type = 'group'
  and nullif(trim(coalesce(ph.group_name, '')), '') is not null
  and not exists (
    select 1 from public.event_groups g
    where g.event_id = ph.event_id and lower(trim(g.name)) = lower(trim(ph.group_name))
  );

-- Validate the selected class/batch during public self-identification whenever
-- the event has configured groups. Events without presets still accept free text.
create or replace function public.claim_solo_portrait_v2(
  _event_id uuid,
  _photo_id uuid,
  _full_name text,
  _organization text,
  _contact_number text,
  _group_name text,
  _email text default null
)
returns table(participant_id uuid, participant_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _photo public.photos%rowtype;
  _prefix text;
  _participant_id uuid;
  _participant_code text;
begin
  if length(trim(coalesce(_full_name,''))) < 2 then
    raise exception 'Please enter your full name.';
  end if;
  if length(trim(coalesce(_contact_number,''))) < 7 then
    raise exception 'Please enter a valid contact number.';
  end if;
  if length(trim(coalesce(_group_name,''))) < 1 then
    raise exception 'Please choose your class or batch.';
  end if;

  if exists (
    select 1 from public.event_groups g
    where g.event_id = _event_id and g.active = true
  ) and not exists (
    select 1 from public.event_groups g
    where g.event_id = _event_id
      and g.active = true
      and lower(trim(g.name)) = lower(trim(_group_name))
  ) then
    raise exception 'Please choose a valid class or batch.';
  end if;

  select * into _photo
  from public.photos
  where id = _photo_id
    and event_id = _event_id
    and photo_type = 'solo'
    and is_separator = false
  for update;

  if not found then raise exception 'Portrait not found.'; end if;
  if _photo.participant_id is not null then raise exception 'This portrait has already been claimed. Please ask the studio for help.'; end if;

  select id_prefix into _prefix
  from public.events
  where id = _event_id and status <> 'demo';
  if not found then raise exception 'Event is not available.'; end if;

  _participant_code := upper(coalesce(_prefix,'EVT')) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.participants (
    event_id, participant_code, full_name, organization, batch, contact_number, email,
    thumbnail_url, shooting_status, gallery_status
  ) values (
    _event_id,
    _participant_code,
    trim(_full_name),
    nullif(trim(coalesce(_organization,'')),''),
    trim(_group_name),
    trim(_contact_number),
    nullif(trim(coalesce(_email,'')),''),
    _photo.url,
    'shot',
    'ready'
  ) returning id into _participant_id;

  update public.photos set participant_id = _participant_id where id = _photo_id;

  return query select _participant_id, _participant_code;
end;
$$;

grant execute on function public.claim_solo_portrait_v2(uuid,uuid,text,text,text,text,text) to anon, authenticated;
