-- PhotoFlow camera-card uploads. Client galleries already expose assigned photos,
-- so the bucket is public while writes remain limited to authenticated staff.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-photos',
  'event-photos',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "event photos public read"
on storage.objects for select
using (bucket_id = 'event-photos');

create policy "event photos staff insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'event-photos');

create policy "event photos staff update"
on storage.objects for update to authenticated
using (bucket_id = 'event-photos')
with check (bucket_id = 'event-photos');

create policy "event photos staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'event-photos');
