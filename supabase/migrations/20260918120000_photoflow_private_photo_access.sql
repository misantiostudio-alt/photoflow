-- Complete the previous forward migration: its revoked anon grants were not
-- enough for signed-in non-staff users, and the photo bucket was still public.
update storage.buckets set public = false where id = 'event-photos';

drop policy if exists "participants public read" on public.participants;
drop policy if exists "orders public read" on public.orders;
drop policy if exists "order items public read" on public.order_items;
drop policy if exists "payments public read" on public.payments;
drop policy if exists "production public read" on public.production_checks;
drop policy if exists "deliveries public read" on public.deliveries;

create policy "participants staff read" on public.participants
for select to authenticated using (public.is_staff(auth.uid()));
create policy "orders staff read" on public.orders
for select to authenticated using (public.is_staff(auth.uid()));
create policy "order items staff read" on public.order_items
for select to authenticated using (public.is_staff(auth.uid()));
create policy "payments staff read" on public.payments
for select to authenticated using (public.is_staff(auth.uid()));
create policy "production staff read" on public.production_checks
for select to authenticated using (public.is_staff(auth.uid()));
create policy "deliveries staff read" on public.deliveries
for select to authenticated using (public.is_staff(auth.uid()));

-- A storage policy cannot rely on direct anonymous SELECT of private orders.
create or replace function public.can_upload_payment_proof(_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.public_token::text = split_part(_path, '/', 1)
      and o.status <> 'cancelled'
  );
$$;
revoke all on function public.can_upload_payment_proof(text) from public;
grant execute on function public.can_upload_payment_proof(text) to anon, authenticated;
drop policy if exists "payment proof client upload" on storage.objects;
drop policy if exists "payment proofs client insert" on storage.objects;
create policy "payment proofs client insert" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'payment-proofs' and public.can_upload_payment_proof(name));

-- Keep old open RPCs inaccessible to visitors after the new token flow.
revoke execute on function public.claim_solo_portrait_v2(uuid,uuid,text,text,text,text,text) from anon, authenticated, public;
revoke execute on function public.claim_solo_portrait_v3(uuid,uuid,text,text,text,text) from anon, authenticated, public;
revoke execute on function public.submit_client_order_v2(uuid,uuid,uuid,jsonb) from anon, authenticated, public;
revoke execute on function public.submit_client_order_v3(uuid,uuid,uuid,jsonb) from anon, authenticated, public;
revoke execute on function public.submit_client_payment_v2(uuid,text,numeric,text,text) from anon, authenticated, public;
