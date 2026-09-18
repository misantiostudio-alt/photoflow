-- PhotoFlow 2.0 product and public-gallery model
-- Primary product: class/group photo package. Optional products: solo portrait add-ons.

alter table public.packages
  add column if not exists code text,
  add column if not exists product_type text not null default 'group_package';

alter table public.packages
  drop constraint if exists packages_product_type_check;
alter table public.packages
  add constraint packages_product_type_check
  check (product_type in ('group_package','solo_addon'));

alter table public.photos
  add column if not exists photo_type text not null default 'solo',
  add column if not exists group_name text;

alter table public.photos
  drop constraint if exists photos_photo_type_check;
alter table public.photos
  add constraint photos_photo_type_check
  check (photo_type in ('solo','group'));

alter table public.orders
  add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists orders_public_token_key on public.orders(public_token);
create index if not exists photos_event_type_idx on public.photos(event_id, photo_type);
create index if not exists photos_event_group_idx on public.photos(event_id, lower(group_name)) where group_name is not null;
create index if not exists packages_event_type_idx on public.packages(event_id, product_type, active);

-- Existing real packages stay usable as group packages. Demo packages remain inside the hidden demo event.
update public.packages set product_type = 'group_package' where product_type is null;

-- Public clients should not enumerate people, orders, payments, QC or deliveries.
drop policy if exists "participants public read" on public.participants;
drop policy if exists "orders public read" on public.orders;
drop policy if exists "orders public create" on public.orders;
drop policy if exists "order items public read" on public.order_items;
drop policy if exists "order items public create" on public.order_items;
drop policy if exists "payments public read" on public.payments;
drop policy if exists "payments public create" on public.payments;
drop policy if exists "production public read" on public.production_checks;
drop policy if exists "deliveries public read" on public.deliveries;

-- Claim an unclaimed solo portrait and create the participant record only after the client identifies themself.
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
    raise exception 'Please enter your class or group.';
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

-- Server-side checkout: database computes totals and creates group + solo order items.
create or replace function public.submit_client_order_v2(
  _participant_id uuid,
  _solo_photo_id uuid,
  _group_package_id uuid,
  _solo_addons jsonb default '[]'::jsonb
)
returns table(order_id uuid, order_number text, public_token uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  _participant public.participants%rowtype;
  _group_package public.packages%rowtype;
  _solo_photo public.photos%rowtype;
  _group_photo_id uuid;
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric(10,2) := 0;
  _addon jsonb;
  _addon_package public.packages%rowtype;
  _requested_qty int;
begin
  select * into _participant from public.participants where id = _participant_id;
  if not found then raise exception 'Participant record not found.'; end if;

  select * into _solo_photo
  from public.photos
  where id = _solo_photo_id
    and event_id = _participant.event_id
    and participant_id = _participant.id
    and photo_type = 'solo';
  if not found then raise exception 'Selected solo portrait is not available.'; end if;

  select * into _group_package
  from public.packages
  where id = _group_package_id
    and event_id = _participant.event_id
    and product_type = 'group_package'
    and active = true;
  if not found then raise exception 'Class/group package is not available.'; end if;

  select id into _group_photo_id
  from public.photos
  where event_id = _participant.event_id
    and photo_type = 'group'
    and group_name is not null
    and lower(trim(group_name)) = lower(trim(coalesce(_participant.batch,'')))
  order by sort_order, created_at
  limit 1;

  if exists (
    select 1 from public.orders
    where participant_id = _participant.id and status <> 'cancelled'
  ) then
    raise exception 'You already have an active order for this event. Please contact the studio if you need to change it.';
  end if;

  _order_number := upper((select id_prefix from public.events where id = _participant.event_id))
    || '-ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _public_token := gen_random_uuid();
  _total := _group_package.price;

  insert into public.orders (
    event_id, participant_id, order_number, package_id, photo_id, public_token,
    total, paid, payment_status, status, production_status
  ) values (
    _participant.event_id, _participant.id, _order_number, _group_package.id, _solo_photo.id, _public_token,
    _total, 0, 'unpaid', 'payment_pending', 'for_print'
  ) returning id into _order_id;

  insert into public.order_items (
    order_id, label, print_size, quantity, framed, unit_price, photo_id, kind
  ) values (
    _order_id,
    coalesce(_group_package.code || ' · ','') || _group_package.name,
    _group_package.print_size,
    _group_package.quantity,
    _group_package.framed,
    _group_package.price,
    _group_photo_id,
    'group_package'
  );

  for _addon in select * from jsonb_array_elements(coalesce(_solo_addons,'[]'::jsonb)) loop
    _requested_qty := greatest(1, least(10, coalesce((_addon->>'quantity')::int,1)));
    select * into _addon_package
    from public.packages
    where id = (_addon->>'package_id')::uuid
      and event_id = _participant.event_id
      and product_type = 'solo_addon'
      and active = true;
    if not found then raise exception 'One of the solo add-ons is no longer available.'; end if;

    _total := _total + (_addon_package.price * _requested_qty);
    insert into public.order_items (
      order_id, label, print_size, quantity, framed, unit_price, photo_id, kind
    ) values (
      _order_id,
      _addon_package.name,
      _addon_package.print_size,
      _addon_package.quantity * _requested_qty,
      _addon_package.framed,
      _addon_package.price,
      _solo_photo.id,
      'solo_addon'
    );
  end loop;

  update public.orders set total = _total where id = _order_id;
  return query select _order_id, _order_number, _public_token, _total;
end;
$$;

grant execute on function public.submit_client_order_v2(uuid,uuid,uuid,jsonb) to anon, authenticated;

-- Private payment proof bucket. Client uploads are allowed only inside a valid order-token folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment proof client upload" on storage.objects;
create policy "payment proof client upload"
on storage.objects for insert to anon
with check (
  bucket_id = 'payment-proofs'
  and exists (
    select 1 from public.orders
    where public_token::text = (storage.foldername(name))[1]
      and status <> 'cancelled'
  )
);

drop policy if exists "payment proof staff read" on storage.objects;
create policy "payment proof staff read"
on storage.objects for select to authenticated
using (bucket_id = 'payment-proofs' and public.is_staff(auth.uid()));

create or replace function public.submit_client_payment_v2(
  _public_token uuid,
  _method text,
  _amount numeric,
  _reference text default null,
  _proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.orders%rowtype;
  _payment_id uuid;
begin
  select * into _order from public.orders where public_token = _public_token and status <> 'cancelled';
  if not found then raise exception 'Order not found.'; end if;
  if _method not in ('gcash','maya','cash','bank','other') then raise exception 'Invalid payment method.'; end if;
  if _amount <= 0 or _amount > _order.total then raise exception 'Invalid payment amount.'; end if;
  if _method in ('gcash','maya','bank') and nullif(trim(coalesce(_reference,'')),'') is null and _proof_path is null then
    raise exception 'Please provide a reference number or payment screenshot.';
  end if;

  insert into public.payments (order_id, amount, method, reference, status, proof_url, notes)
  values (_order.id, _amount, _method, nullif(trim(coalesce(_reference,'')),''), 'pending', _proof_path, 'Submitted by client from PhotoFlow 2.0 checkout')
  returning id into _payment_id;
  return _payment_id;
end;
$$;

grant execute on function public.submit_client_payment_v2(uuid,text,numeric,text,text) to anon, authenticated;

create or replace function public.get_public_order_v2(_public_token uuid)
returns table(
  order_number text,
  client_name text,
  group_name text,
  total numeric,
  paid numeric,
  payment_status text,
  production_status text,
  delivered_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.order_number, p.full_name, p.batch, o.total, o.paid, o.payment_status, o.production_status, o.delivered_at
  from public.orders o
  join public.participants p on p.id = o.participant_id
  where o.public_token = _public_token and o.status <> 'cancelled'
  limit 1;
$$;

grant execute on function public.get_public_order_v2(uuid) to anon, authenticated;
