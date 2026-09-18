-- PhotoFlow gallery performance metadata
-- Originals stay on the photographer's local storage.
-- PhotoFlow stores optimized preview + thumbnail only.

alter table public.photos
  add column if not exists original_path text,
  add column if not exists preview_path text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_url text,
  add column if not exists content_hash text,
  add column if not exists original_size bigint,
  add column if not exists width int,
  add column if not exists height int;

create unique index if not exists photos_event_content_hash_key
on public.photos(
  event_id,
  coalesce(event_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
  photo_type,
  content_hash
)
where content_hash is not null;

update public.photos
set thumbnail_url = url
where thumbnail_url is null;