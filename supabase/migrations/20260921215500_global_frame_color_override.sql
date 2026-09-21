-- Event-level global frame color override.
-- When enabled, all framed packages expose one effective frame color to clients.
-- Package-level frame_colors remain untouched so disabling restores them instantly.

alter table public.events
  add column if not exists single_frame_color_enabled boolean not null default false,
  add column if not exists single_frame_color text not null default 'black';

alter table public.events
  drop constraint if exists events_single_frame_color_check;

alter table public.events
  add constraint events_single_frame_color_check
  check (single_frame_color in ('black','white','brown'));

create or replace function public.get_gallery_packages_by_token(_share_token uuid)
returns table(
  id uuid, name text, code text, product_type text, price numeric,
  print_size text, quantity int, framed boolean, digital_copy boolean,
  description text, sort_order int, frame_colors text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.name, p.code, p.product_type, p.price, p.print_size, p.quantity,
    p.framed, p.digital_copy, p.description, p.sort_order,
    case
      when e.single_frame_color_enabled and p.framed
        then array[e.single_frame_color]::text[]
      else coalesce(p.frame_colors, array['black']::text[])
    end as frame_colors
  from public.packages p
  join public.events e on e.id = p.event_id
  where p.active = true
    and p.event_id = (select g.event_id from public.get_gallery_by_token(_share_token) g)
  order by p.sort_order;
$$;

revoke all on function public.get_gallery_packages_by_token(uuid) from public;
grant execute on function public.get_gallery_packages_by_token(uuid) to anon, authenticated;
