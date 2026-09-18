-- PhotoFlow gallery albums + bulk management

create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_group_id uuid references public.event_groups(id) on delete set null,
  name text not null,
  photo_type text not null default 'solo',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photos
  add column if not exists album_id uuid references public.photo_albums(id) on delete set null;

create index if not exists photo_albums_event_idx
  on public.photo_albums(event_id, created_at desc);

create index if not exists photos_album_idx
  on public.photos(album_id, sort_order);

alter table public.photo_albums enable row level security;

grant select, insert, update, delete on public.photo_albums to authenticated;
grant all on public.photo_albums to service_role;

drop policy if exists "photo albums staff read" on public.photo_albums;
create policy "photo albums staff read"
on public.photo_albums for select to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists "photo albums staff write" on public.photo_albums;
create policy "photo albums staff write"
on public.photo_albums for all to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));