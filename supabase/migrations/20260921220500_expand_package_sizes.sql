-- Expand default package lineup with Solo 8R print-only and Class 12x16 framed.
-- Idempotent so it is safe if the live database was already updated manually.

-- Make room for Solo 8R Print.
update public.packages
set code = 'S4', sort_order = 7
where product_type = 'solo_addon'
  and code = 'S3'
  and lower(name) = lower('Solo 8R + Frame');

update public.packages
set code = 'S5', sort_order = 8
where product_type = 'solo_addon'
  and code = 'S4'
  and lower(name) = lower('Solo 12×16 + Frame');

-- Add Solo 8R Print for events that already have S2.
insert into public.packages (
  event_id, code, product_type, name, price, print_size, quantity,
  framed, frame_colors, digital_copy, description, sort_order, active
)
select
  p.event_id,
  'S3',
  'solo_addon',
  'Solo 8R Print',
  150,
  '8R',
  1,
  false,
  array['black']::text[],
  false,
  'Optional 8R solo portrait print',
  6,
  true
from public.packages p
where p.product_type='solo_addon'
  and p.code='S2'
  and not exists (
    select 1
    from public.packages x
    where x.event_id=p.event_id
      and x.product_type='solo_addon'
      and (x.code='S3' or lower(x.name)=lower('Solo 8R Print'))
  );

-- Add Class 12x16 Framed for events that already have P3.
insert into public.packages (
  event_id, code, product_type, name, price, print_size, quantity,
  framed, frame_colors, digital_copy, description, sort_order, active
)
select
  p.event_id,
  'P4',
  'group_package',
  'Class Photo · 12×16 Framed',
  950,
  '12×16',
  1,
  true,
  coalesce(p.frame_colors, array['black']::text[]),
  false,
  'Large official class/group photo with frame + white mat',
  4,
  true
from public.packages p
where p.product_type='group_package'
  and p.code='P3'
  and not exists (
    select 1
    from public.packages x
    where x.event_id=p.event_id
      and x.product_type='group_package'
      and (x.code='P4' or lower(x.name)=lower('Class Photo · 12×16 Framed'))
  );
