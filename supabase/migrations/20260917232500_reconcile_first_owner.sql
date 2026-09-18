-- Reconcile installations where the first auth user existed before the owner bootstrap trigger.
-- Safe/idempotent: only assigns Owner when there are no role rows and exactly one auth user.
do $$
declare
  _user_id uuid;
  _user_count int;
begin
  select count(*) into _user_count from auth.users;\n  select id into _user_id from auth.users order by created_at asc limit 1;

  if _user_count = 1 and not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role)
    values (_user_id, 'owner')
    on conflict (user_id, role) do nothing;
  end if;
end $$;

-- Bootstrap availability should reflect whether an Owner/staff role exists,
-- not merely whether an auth row exists.
create or replace function public.bootstrap_available()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select not exists (select 1 from public.user_roles);
$$;

grant execute on function public.bootstrap_available() to anon, authenticated;

-- Authenticated self-heal for an old install where exactly one auth user exists
-- but no PhotoFlow staff role was created. Only that sole user can receive Owner.
create or replace function public.ensure_first_owner()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _only_user uuid;
  _user_count int;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.user_roles) then
    return exists(select 1 from public.user_roles where user_id = auth.uid());
  end if;

  select count(*), min(id) into _user_count, _only_user from auth.users;
  if _user_count = 1 and _only_user = auth.uid() then
    insert into public.user_roles(user_id, role)
    values (auth.uid(), 'owner')
    on conflict (user_id, role) do nothing;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.ensure_first_owner() to authenticated;
