-- =========================================================
-- PhotoFlow privacy + integrity hardening (forward-only)
-- =========================================================

-- ---------- 1. New columns / tokens ----------
alter table public.photos add column if not exists storage_path text;

update public.photos
set storage_path = regexp_replace(url, '^.*/storage/v1/object/(public|sign)/event-photos/', '')
where storage_path is null and url like '%/event-photos/%';

alter table public.event_groups add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists event_groups_share_token_key on public.event_groups(share_token);

alter table public.events add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists events_share_token_key on public.events(share_token);

alter table public.participants add column if not exists resume_token uuid not null default gen_random_uuid();
create unique index if not exists participants_resume_token_key on public.participants(resume_token);

alter table public.payments add column if not exists client_request_id uuid;
create unique index if not exists payments_client_request_key on public.payments(order_id, client_request_id) where client_request_id is not null;

create unique index if not exists deliveries_order_id_key on public.deliveries(order_id);

-- ---------- 2. Remove broad anonymous reads ----------
drop policy if exists "events public read" on public.events;
drop policy if exists "packages public read" on public.packages;
drop policy if exists "photos public read" on public.photos;
drop policy if exists "event groups public read" on public.event_groups;

revoke all on public.events from anon;
revoke all on public.packages from anon;
revoke all on public.photos from anon;
revoke all on public.event_groups from anon;
revoke all on public.participants from anon;
revoke all on public.orders from anon;
revoke all on public.order_items from anon;
revoke all on public.payments from anon;
revoke all on public.production_checks from anon;
revoke all on public.deliveries from anon;
revoke all on public.audit_logs from anon;

-- Staff tables require an actual staff role, not merely a signed-in account.
drop policy if exists "event groups staff write" on public.event_groups;
create policy "event groups staff write" on public.event_groups
for all to authenticated
using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "events public read" on public.events;
create policy "events staff read" on public.events
for select to authenticated using (public.is_staff(auth.uid()));

create policy "packages staff read" on public.packages
for select to authenticated using (public.is_staff(auth.uid()));

create policy "photos staff read" on public.photos
for select to authenticated using (public.is_staff(auth.uid()));

create policy "event groups staff read" on public.event_groups
for select to authenticated using (public.is_staff(auth.uid()));

drop policy if exists "audit staff read" on public.audit_logs;
drop policy if exists "audit staff insert" on public.audit_logs;
create policy "audit staff read" on public.audit_logs
for select to authenticated using (public.is_staff(auth.uid()));
create policy "audit staff insert" on public.audit_logs
for insert to authenticated with check (public.is_staff(auth.uid()));

-- ---------- 3. Private photo storage ----------
drop policy if exists "event photos public read" on storage.objects;
drop policy if exists "event photos staff insert" on storage.objects;
drop policy if exists "event photos staff update" on storage.objects;
drop policy if exists "event photos staff delete" on storage.objects;

create policy "event photos staff read" on storage.objects
for select to authenticated
using (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

create policy "event photos staff insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

create policy "event photos staff update" on storage.objects
for update to authenticated
using (bucket_id = 'event-photos' and public.is_staff(auth.uid()))
with check (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

create policy "event photos staff delete" on storage.objects
for delete to authenticated
using (bucket_id = 'event-photos' and public.is_staff(auth.uid()));

-- Payment proofs: clients may only upload into the folder of a real order token.
drop policy if exists "payment proofs client insert" on storage.objects;
drop policy if exists "payment proofs staff read" on storage.objects;
drop policy if exists "payment proofs staff all" on storage.objects;

create policy "payment proofs client insert" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'payment-proofs'
  and exists (
    select 1 from public.orders o
    where o.public_token::text = (storage.foldername(name))[1]
      and o.status <> 'cancelled'
  )
);

create policy "payment proofs staff read" on storage.objects
for select to authenticated
using (bucket_id = 'payment-proofs' and public.is_staff(auth.uid()));

-- ---------- 4. Public gallery through share tokens only ----------
create or replace function public.get_gallery_by_token(_share_token uuid)
returns table(
  event_id uuid, event_name text, event_slug text,
  group_id uuid, group_name text,
  payment_instructions text, ordering_deadline date, delivery_date date
)
language sql stable security definer set search_path = public
as $$
  select e.id, e.name, e.slug, g.id, g.name, e.payment_instructions, e.ordering_deadline, e.delivery_date
  from public.event_groups g
  join public.events e on e.id = g.event_id
  where g.share_token = _share_token and g.active = true and e.status <> 'demo'
  union all
  select e.id, e.name, e.slug, null::uuid, null::text, e.payment_instructions, e.ordering_deadline, e.delivery_date
  from public.events e
  where e.share_token = _share_token and e.status <> 'demo'
    and not exists (select 1 from public.event_groups g2 where g2.event_id = e.id and g2.active = true)
  limit 1;
$$;

create or replace function public.get_gallery_packages_by_token(_share_token uuid)
returns table(
  id uuid, name text, code text, product_type text, price numeric,
  print_size text, quantity int, framed boolean, digital_copy boolean,
  description text, sort_order int
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.code, p.product_type, p.price, p.print_size, p.quantity,
         p.framed, p.digital_copy, p.description, p.sort_order
  from public.packages p
  where p.active = true
    and p.event_id = (select g.event_id from public.get_gallery_by_token(_share_token) g)
  order by p.sort_order;
$$;

-- Unclaimed solo previews for that batch only, plus the batch's official group photo. No PII.
create or replace function public.get_gallery_photos_by_token(_share_token uuid)
returns table(id uuid, storage_path text, photo_type text, sort_order int, claimed boolean)
language sql stable security definer set search_path = public
as $$
  with scope as (select * from public.get_gallery_by_token(_share_token))
  select ph.id, coalesce(ph.storage_path, ph.url), ph.photo_type, ph.sort_order,
         ph.participant_id is not null
  from public.photos ph, scope s
  where ph.event_id = s.event_id
    and ph.is_separator = false
    and (s.group_id is null or ph.event_group_id = s.group_id)
    and (ph.photo_type = 'group' or ph.participant_id is null)
  order by ph.photo_type desc, ph.sort_order;
$$;

-- Compatibility path for already-shared ?batch=<group id> links.
create or replace function public.get_share_token_for_group(_event_slug text, _group_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select g.share_token
  from public.event_groups g
  join public.events e on e.id = g.event_id
  where g.id = _group_id and e.slug = _event_slug and g.active = true and e.status <> 'demo';
$$;

create or replace function public.get_share_token_for_event(_event_slug text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select e.share_token from public.events e
  where e.slug = _event_slug and e.status <> 'demo'
    and not exists (select 1 from public.event_groups g where g.event_id = e.id and g.active = true);
$$;

-- ---------- 5. Claim + resume ----------
create or replace function public.claim_solo_portrait_v4(
  _share_token uuid, _photo_id uuid, _full_name text, _organization text,
  _contact_number text, _email text default null
)
returns table(participant_id uuid, participant_code text, group_name text, resume_token uuid)
language plpgsql security definer set search_path = public
as $$
declare
  _scope record;
  _photo public.photos%rowtype;
  _prefix text;
  _pid uuid;
  _code text;
  _resume uuid;
begin
  if length(trim(coalesce(_full_name,''))) < 2 then raise exception 'Please enter your full name.'; end if;
  if length(trim(coalesce(_contact_number,''))) < 7 then raise exception 'Please enter a valid contact number.'; end if;

  select * into _scope from public.get_gallery_by_token(_share_token);
  if not found then raise exception 'This gallery link is not available.'; end if;

  select * into _photo from public.photos
  where id = _photo_id and event_id = _scope.event_id
    and photo_type = 'solo' and is_separator = false
    and (_scope.group_id is null or event_group_id = _scope.group_id)
  for update;
  if not found then raise exception 'Portrait not found in this gallery.'; end if;
  if _photo.participant_id is not null then
    raise exception 'This portrait has already been claimed. Please ask the studio for help.';
  end if;

  select id_prefix into _prefix from public.events where id = _scope.event_id;
  _code := upper(coalesce(_prefix,'EVT')) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.participants (
    event_id, event_group_id, participant_code, full_name, organization, batch,
    contact_number, email, thumbnail_url, shooting_status, gallery_status
  ) values (
    _scope.event_id, _photo.event_group_id, _code, trim(_full_name),
    nullif(trim(coalesce(_organization,'')),''), _scope.group_name,
    trim(_contact_number), nullif(trim(coalesce(_email,'')),''),
    _photo.url, 'shot', 'ready'
  ) returning id, participants.resume_token into _pid, _resume;

  update public.photos set participant_id = _pid where id = _photo_id;
  return query select _pid, _code, _scope.group_name, _resume;
end;
$$;

-- Secure resume: only the unguessable personal token returns a client's own record.
create or replace function public.get_client_session_v1(_resume_token uuid)
returns table(
  participant_id uuid, participant_code text, full_name text, organization text,
  contact_number text, email text, group_name text, share_token uuid,
  photo_id uuid, photo_path text,
  order_id uuid, order_number text, public_token uuid,
  total numeric, paid numeric, payment_status text, production_status text,
  payment_pending boolean, pending_amount numeric
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.participant_code, p.full_name, p.organization, p.contact_number, p.email,
    p.batch,
    coalesce(g.share_token, e.share_token),
    ph.id, coalesce(ph.storage_path, ph.url),
    o.id, o.order_number, o.public_token, o.total, o.paid, o.payment_status, o.production_status,
    exists(select 1 from public.payments x where x.order_id = o.id and x.status = 'pending'),
    coalesce((select sum(x.amount) from public.payments x where x.order_id = o.id and x.status = 'pending'), 0)
  from public.participants p
  join public.events e on e.id = p.event_id
  left join public.event_groups g on g.id = p.event_group_id
  left join public.photos ph on ph.participant_id = p.id and ph.photo_type = 'solo'
  left join public.orders o on o.participant_id = p.id and o.status <> 'cancelled'
  where p.resume_token = _resume_token
  limit 1;
$$;

-- ---------- 6. Ordering through the resume token (idempotent) ----------
create or replace function public.submit_client_order_v4(
  _resume_token uuid, _group_package_id uuid, _solo_addons jsonb default '[]'::jsonb
)
returns table(order_id uuid, order_number text, public_token uuid, total numeric)
language plpgsql security definer set search_path = public
as $$
declare
  _participant public.participants%rowtype;
  _group_package public.packages%rowtype;
  _solo_photo public.photos%rowtype;
  _group_photo_id uuid;
  _existing public.orders%rowtype;
  _order_id uuid;
  _order_number text;
  _public_token uuid;
  _total numeric(10,2) := 0;
  _addon jsonb;
  _addon_package public.packages%rowtype;
  _qty int;
begin
  select * into _participant from public.participants where resume_token = _resume_token for update;
  if not found then raise exception 'Your session link is not valid anymore.'; end if;

  -- Resume/retry safety: an existing active order is returned instead of duplicated.
  select * into _existing from public.orders
  where participant_id = _participant.id and status <> 'cancelled' limit 1;
  if found then
    return query select _existing.id, _existing.order_number, _existing.public_token, _existing.total;
    return;
  end if;

  select * into _solo_photo from public.photos
  where participant_id = _participant.id and photo_type = 'solo' limit 1;
  if not found then raise exception 'Your portrait selection could not be found.'; end if;

  select * into _group_package from public.packages
  where id = _group_package_id and event_id = _participant.event_id
    and product_type = 'group_package' and active = true;
  if not found then raise exception 'Class/group package is not available.'; end if;

  if _participant.event_group_id is not null then
    select id into _group_photo_id from public.photos
    where event_id = _participant.event_id and event_group_id = _participant.event_group_id
      and photo_type = 'group' order by sort_order, created_at limit 1;
  elsif _participant.batch is not null then
    select id into _group_photo_id from public.photos
    where event_id = _participant.event_id and photo_type = 'group'
      and lower(trim(coalesce(group_name,''))) = lower(trim(_participant.batch))
    order by sort_order, created_at limit 1;
  end if;

  _order_number := upper((select id_prefix from public.events where id = _participant.event_id))
    || '-ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _public_token := gen_random_uuid();
  _total := _group_package.price;

  insert into public.orders (
    event_id, participant_id, order_number, package_id, photo_id, public_token,
    total, paid, payment_status, status, production_status
  ) values (
    _participant.event_id, _participant.id, _order_number, _group_package.id,
    _solo_photo.id, _public_token, _total, 0, 'unpaid', 'payment_pending', 'for_print'
  ) returning id into _order_id;

  insert into public.order_items(order_id,label,print_size,quantity,framed,unit_price,photo_id,kind)
  values (_order_id, coalesce(_group_package.code || ' · ','') || _group_package.name,
          _group_package.print_size, _group_package.quantity, _group_package.framed,
          _group_package.price, _group_photo_id, 'group_package');

  for _addon in select * from jsonb_array_elements(coalesce(_solo_addons,'[]'::jsonb)) loop
    _qty := greatest(1, least(10, coalesce((_addon->>'quantity')::int,1)));
    select * into _addon_package from public.packages
    where id = (_addon->>'package_id')::uuid and event_id = _participant.event_id
      and product_type = 'solo_addon' and active = true;
    if not found then raise exception 'One of the solo add-ons is no longer available.'; end if;
    _total := _total + (_addon_package.price * _qty);
    insert into public.order_items(order_id,label,print_size,quantity,framed,unit_price,photo_id,kind)
    values (_order_id, _addon_package.name, _addon_package.print_size,
            _addon_package.quantity * _qty, _addon_package.framed,
            _addon_package.price, _solo_photo.id, 'solo_addon');
  end loop;

  update public.orders set total = _total where id = _order_id;
  return query select _order_id, _order_number, _public_token, _total;
end;
$$;

-- ---------- 7. Payment integrity ----------
create or replace function public.enforce_payment_limits()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _total numeric(10,2);
  _committed numeric(10,2);
begin
  if new.status = 'rejected' then return new; end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select o.total into _total from public.orders o where o.id = new.order_id;
  if _total is null then raise exception 'Order not found for this payment.'; end if;

  select coalesce(sum(p.amount), 0) into _committed
  from public.payments p
  where p.order_id = new.order_id
    and p.status in ('verified','pending')
    and (tg_op = 'INSERT' or p.id <> new.id);

  if _committed + new.amount > _total + 0.01 then
    raise exception 'This payment exceeds the remaining balance of %.', round(greatest(_total - _committed, 0), 2);
  end if;

  if new.proof_url is not null and new.proof_url <> '' then
    if split_part(new.proof_url, '/', 1) <>
       (select o.public_token::text from public.orders o where o.id = new.order_id) then
      raise exception 'The uploaded payment proof does not belong to this order.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_limits on public.payments;
create trigger payments_enforce_limits
before insert or update on public.payments
for each row execute function public.enforce_payment_limits();

create or replace function public.submit_client_payment_v3(
  _public_token uuid, _method text, _amount numeric,
  _reference text default null, _proof_path text default null,
  _client_request_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _order public.orders%rowtype;
  _payment_id uuid;
  _committed numeric(10,2);
begin
  select * into _order from public.orders
  where public_token = _public_token and status <> 'cancelled' for update;
  if not found then raise exception 'Order not found.'; end if;

  if _client_request_id is not null then
    select id into _payment_id from public.payments
    where order_id = _order.id and client_request_id = _client_request_id;
    if _payment_id is not null then return _payment_id; end if;
  end if;

  if _method not in ('gcash','maya','cash','bank','other') then raise exception 'Invalid payment method.'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Invalid payment amount.'; end if;
  if _method in ('gcash','maya','bank') and nullif(trim(coalesce(_reference,'')),'') is null and _proof_path is null then
    raise exception 'Please provide a reference number or payment screenshot.';
  end if;
  if _proof_path is not null and split_part(_proof_path, '/', 1) <> _order.public_token::text then
    raise exception 'The uploaded payment proof does not belong to this order.';
  end if;

  select coalesce(sum(p.amount),0) into _committed from public.payments p
  where p.order_id = _order.id and p.status in ('verified','pending');

  if _committed >= _order.total then
    raise exception 'This order is already fully covered by submitted payments.';
  end if;
  if _committed + _amount > _order.total + 0.01 then
    raise exception 'That amount is more than the remaining balance of %.', round(_order.total - _committed, 2);
  end if;

  insert into public.payments (order_id, amount, method, reference, status, proof_url, notes, client_request_id)
  values (_order.id, _amount, _method, nullif(trim(coalesce(_reference,'')),''), 'pending', _proof_path,
          'Submitted by client from PhotoFlow checkout', _client_request_id)
  returning id into _payment_id;
  return _payment_id;
end;
$$;

-- ---------- 8. Atomic release ----------
create or replace function public.release_order_v1(
  _order_id uuid, _receiver_name text, _notes text default null, _actor text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _order public.orders%rowtype;
  _verified numeric(10,2);
  _final_done boolean;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then
    raise exception 'Authorized staff access is required.';
  end if;
  if length(trim(coalesce(_receiver_name,''))) < 2 then
    raise exception 'Please enter the receiver name.';
  end if;

  select * into _order from public.orders where id = _order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if _order.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  if _order.production_status = 'delivered' then raise exception 'This order was already released.'; end if;
  if _order.production_status <> 'ready' then raise exception 'This order is not marked Ready yet.'; end if;

  select coalesce(sum(p.amount),0) into _verified from public.payments p
  where p.order_id = _order_id and p.status = 'verified';
  if _verified + 0.01 < _order.total then
    raise exception 'There is still a balance of % to settle before release.', round(_order.total - _verified, 2);
  end if;

  select coalesce(bool_or(c.completed), false) into _final_done
  from public.production_checks c where c.order_id = _order_id and c.stage = 'final_check';
  if not _final_done then raise exception 'Final quality check must be completed before release.'; end if;

  update public.orders
  set production_status = 'delivered', status = 'delivered', delivered_at = now(), updated_at = now()
  where id = _order_id;

  insert into public.deliveries (order_id, status, delivered_by, receiver_name, notes, delivered_at)
  values (_order_id, 'delivered', _actor, trim(_receiver_name), nullif(trim(coalesce(_notes,'')),''), now())
  on conflict (order_id) do update
  set status = 'delivered', delivered_by = excluded.delivered_by,
      receiver_name = excluded.receiver_name, notes = excluded.notes,
      delivered_at = excluded.delivered_at;

  insert into public.audit_logs (entity_type, entity_id, action, actor, notes)
  values ('order', _order_id, 'delivered', _actor,
          'Released to ' || trim(_receiver_name) ||
          coalesce(' · ' || nullif(trim(coalesce(_notes,'')),''), ''));

  return _order_id;
end;
$$;

-- ---------- 9. Retire the older, looser client RPCs ----------
revoke execute on function public.claim_solo_portrait_v2(uuid,uuid,text,text,text,text,text) from anon, authenticated, public;
revoke execute on function public.claim_solo_portrait_v3(uuid,uuid,text,text,text,text) from anon, authenticated, public;
revoke execute on function public.submit_client_order_v2(uuid,uuid,uuid,jsonb) from anon, authenticated, public;
revoke execute on function public.submit_client_order_v3(uuid,uuid,uuid,jsonb) from anon, authenticated, public;
revoke execute on function public.submit_client_payment_v2(uuid,text,numeric,text,text) from anon, authenticated, public;

-- ---------- 10. Grants ----------
revoke execute on function public.get_gallery_by_token(uuid) from public;
revoke execute on function public.get_gallery_packages_by_token(uuid) from public;
revoke execute on function public.get_gallery_photos_by_token(uuid) from public;
revoke execute on function public.get_share_token_for_group(text,uuid) from public;
revoke execute on function public.get_share_token_for_event(text) from public;
revoke execute on function public.claim_solo_portrait_v4(uuid,uuid,text,text,text,text) from public;
revoke execute on function public.get_client_session_v1(uuid) from public;
revoke execute on function public.submit_client_order_v4(uuid,uuid,jsonb) from public;
revoke execute on function public.submit_client_payment_v3(uuid,text,numeric,text,text,uuid) from public;
revoke execute on function public.release_order_v1(uuid,text,text,text) from public;

grant execute on function public.get_gallery_by_token(uuid) to anon, authenticated;
grant execute on function public.get_gallery_packages_by_token(uuid) to anon, authenticated;
grant execute on function public.get_gallery_photos_by_token(uuid) to anon, authenticated;
grant execute on function public.get_share_token_for_group(text,uuid) to anon, authenticated;
grant execute on function public.get_share_token_for_event(text) to anon, authenticated;
grant execute on function public.claim_solo_portrait_v4(uuid,uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.get_client_session_v1(uuid) to anon, authenticated;
grant execute on function public.submit_client_order_v4(uuid,uuid,jsonb) to anon, authenticated;
grant execute on function public.submit_client_payment_v3(uuid,text,numeric,text,text,uuid) to anon, authenticated;
grant execute on function public.release_order_v1(uuid,text,text,text) to authenticated;
grant execute on function public.get_public_order_v2(uuid) to anon, authenticated;
