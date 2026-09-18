-- PhotoFlow Auth V2: Super Admin, secure quick PIN, and atomic event writes.

create extension if not exists pgcrypto with schema extensions;

-- Promote the earliest Owner to Super Admin without removing their Owner role.
insert into public.user_roles(user_id, role)
select ur.user_id, 'super_admin'::public.app_role
from public.user_roles ur
where ur.role = 'owner'::public.app_role
order by ur.created_at asc
limit 1
on conflict (user_id, role) do nothing;

-- New installations: the first account receives both Super Admin and Owner.
create or replace function public.assign_first_user_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles(user_id, role)
    values
      (new.id, 'super_admin'::public.app_role),
      (new.id, 'owner'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$fn$;

create or replace function public.ensure_first_owner()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if auth.uid() is null then return false; end if;

  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles(user_id, role)
    values
      (auth.uid(), 'super_admin'::public.app_role),
      (auth.uid(), 'owner'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;

  return exists (select 1 from public.user_roles where user_id = auth.uid());
end;
$fn$;

grant execute on function public.ensure_first_owner() to authenticated;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'super_admin'::public.app_role
  );
$$;

create or replace function public.can_manage_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin(_user_id)
      or public.has_role(_user_id, 'owner'::public.app_role);
$$;

drop policy if exists "owners manage roles" on public.user_roles;
create policy "admins manage roles"
on public.user_roles
for all
to authenticated
using (public.can_manage_staff(auth.uid()))
with check (public.can_manage_staff(auth.uid()));

-- Quick PIN is a secondary device/session lock. It never replaces Supabase authentication.
create table if not exists public.staff_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text,
  pin_enabled boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_security enable row level security;
grant select on public.staff_security to authenticated;
grant all on public.staff_security to service_role;

drop policy if exists "read own staff security" on public.staff_security;
create policy "read own staff security"
on public.staff_security for select to authenticated
using (user_id = auth.uid());

create or replace function public.set_my_pin(_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if _pin !~ '^[0-9]{6}$' then raise exception 'PIN must be exactly 6 digits.'; end if;

  insert into public.staff_security(user_id, pin_hash, pin_enabled, failed_attempts, locked_until, updated_at)
  values (
    auth.uid(),
    extensions.crypt(_pin, extensions.gen_salt('bf', 10)),
    true, 0, null, now()
  )
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      pin_enabled = true,
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();
end;
$$;

create or replace function public.clear_my_pin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.staff_security(user_id, pin_enabled, updated_at)
  values (auth.uid(), false, now())
  on conflict (user_id) do update
  set pin_hash = null,
      pin_enabled = false,
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();
end;
$$;

create or replace function public.get_my_security_settings()
returns table(pin_enabled boolean, locked_until timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.pin_enabled, false), s.locked_until
  from (select auth.uid() as uid) me
  left join public.staff_security s on s.user_id = me.uid;
$$;

create or replace function public.verify_my_pin(_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _row public.staff_security%rowtype;
  _ok boolean := false;
begin
  if auth.uid() is null then return false; end if;

  select * into _row
  from public.staff_security
  where user_id = auth.uid()
  for update;

  if not found or not _row.pin_enabled or _row.pin_hash is null then
    return false;
  end if;

  if _row.locked_until is not null and _row.locked_until > now() then
    raise exception 'Too many attempts. Try again later.';
  end if;

  _ok := extensions.crypt(_pin, _row.pin_hash) = _row.pin_hash;

  if _ok then
    update public.staff_security
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = auth.uid();
    return true;
  end if;

  update public.staff_security
  set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end,
      updated_at = now()
  where user_id = auth.uid();

  return false;
end;
$$;

grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.clear_my_pin() to authenticated;
grant execute on function public.get_my_security_settings() to authenticated;
grant execute on function public.verify_my_pin(text) to authenticated;

-- Stable role query for the UI.
create or replace function public.get_my_staff_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(role::text order by role::text), '{}'::text[])
  from public.user_roles
  where user_id = auth.uid();
$$;
grant execute on function public.get_my_staff_roles() to authenticated;

-- Atomic event write functions. These avoid partial saves and make errors visible.
create or replace function public.create_event_with_groups_v1(
  _name text,
  _slug text,
  _event_type text,
  _event_date date default null,
  _venue text default null,
  _description text default null,
  _id_prefix text default 'EVT',
  _ordering_deadline date default null,
  _delivery_date date default null,
  _payment_instructions text default null,
  _groups text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _event_id uuid;
  _group text;
  _sort int := 0;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then
    raise exception 'Authorized staff access is required.';
  end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'Event name is required.'; end if;
  if length(trim(coalesce(_slug,''))) < 2 then raise exception 'Event slug is required.'; end if;

  insert into public.events(
    name, slug, event_type, event_date, venue, description, status, id_prefix,
    ordering_deadline, delivery_date, payment_instructions
  ) values (
    trim(_name), trim(_slug), coalesce(nullif(trim(_event_type),''),'Event'),
    _event_date, nullif(trim(coalesce(_venue,'')),''),
    nullif(trim(coalesce(_description,'')),''),
    'active', upper(coalesce(nullif(trim(_id_prefix),''),'EVT')),
    _ordering_deadline, _delivery_date,
    nullif(trim(coalesce(_payment_instructions,'')),'')
  )
  returning id into _event_id;

  foreach _group in array coalesce(_groups, '{}'::text[]) loop
    if nullif(trim(_group),'') is not null then
      _sort := _sort + 1;
      insert into public.event_groups(event_id, name, sort_order, active)
      values (_event_id, trim(_group), _sort, true)
      on conflict do nothing;
    end if;
  end loop;

  return _event_id;
end;
$$;

create or replace function public.update_event_with_groups_v1(
  _event_id uuid,
  _name text,
  _event_type text,
  _event_date date default null,
  _venue text default null,
  _description text default null,
  _id_prefix text default 'EVT',
  _ordering_deadline date default null,
  _delivery_date date default null,
  _payment_instructions text default null,
  _groups text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _group text;
  _sort int := 0;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then
    raise exception 'Authorized staff access is required.';
  end if;

  update public.events
  set name = trim(_name),
      event_type = coalesce(nullif(trim(_event_type),''),'Event'),
      event_date = _event_date,
      venue = nullif(trim(coalesce(_venue,'')),''),
      description = nullif(trim(coalesce(_description,'')),''),
      id_prefix = upper(coalesce(nullif(trim(_id_prefix),''),'EVT')),
      ordering_deadline = _ordering_deadline,
      delivery_date = _delivery_date,
      payment_instructions = nullif(trim(coalesce(_payment_instructions,'')),''),
      updated_at = now()
  where id = _event_id;

  if not found then raise exception 'Event not found.'; end if;

  delete from public.event_groups where event_id = _event_id;

  foreach _group in array coalesce(_groups, '{}'::text[]) loop
    if nullif(trim(_group),'') is not null then
      _sort := _sort + 1;
      insert into public.event_groups(event_id, name, sort_order, active)
      values (_event_id, trim(_group), _sort, true)
      on conflict do nothing;
    end if;
  end loop;

  return _event_id;
end;
$$;

grant execute on function public.create_event_with_groups_v1(text,text,text,date,text,text,text,date,date,text,text[]) to authenticated;
grant execute on function public.update_event_with_groups_v1(uuid,text,text,date,text,text,text,date,date,text,text[]) to authenticated;
