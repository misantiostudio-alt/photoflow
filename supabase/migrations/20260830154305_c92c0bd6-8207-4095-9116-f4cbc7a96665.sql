
-- ROLES
create type public.app_role as enum ('owner','photographer','cashier','production','delivery');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  event_type text not null default 'School',
  event_date date,
  venue text,
  description text,
  status text not null default 'active',
  id_prefix text not null default 'EVT',
  ordering_deadline date,
  delivery_date date,
  payment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.events to authenticated;
grant select on public.events to anon;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "events public read" on public.events for select using (true);
create policy "events staff write" on public.events for all to authenticated using (true) with check (true);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

-- PACKAGES
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  print_size text not null default '5R',
  quantity int not null default 1,
  framed boolean not null default false,
  digital_copy boolean not null default false,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.packages to authenticated;
grant select on public.packages to anon;
grant all on public.packages to service_role;
alter table public.packages enable row level security;
create policy "packages public read" on public.packages for select using (true);
create policy "packages staff write" on public.packages for all to authenticated using (true) with check (true);
create trigger packages_touch before update on public.packages for each row execute function public.touch_updated_at();

-- PARTICIPANTS
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_code text not null,
  full_name text not null,
  organization text,
  batch text,
  contact_number text,
  email text,
  notes text,
  thumbnail_url text,
  shooting_status text not null default 'pending',
  gallery_status text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_code)
);
grant select, insert, update, delete on public.participants to authenticated;
grant select on public.participants to anon;
grant all on public.participants to service_role;
alter table public.participants enable row level security;
create policy "participants public read" on public.participants for select using (true);
create policy "participants staff write" on public.participants for all to authenticated using (true) with check (true);
create trigger participants_touch before update on public.participants for each row execute function public.touch_updated_at();

-- PHOTOS
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  url text not null,
  file_name text,
  is_separator boolean not null default false,
  favorite boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.photos to authenticated;
grant select on public.photos to anon;
grant all on public.photos to service_role;
alter table public.photos enable row level security;
create policy "photos public read" on public.photos for select using (true);
create policy "photos staff write" on public.photos for all to authenticated using (true) with check (true);

-- ORDERS
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  order_number text not null unique,
  package_id uuid references public.packages(id),
  photo_id uuid references public.photos(id),
  total numeric(10,2) not null default 0,
  paid numeric(10,2) not null default 0,
  payment_method text,
  payment_status text not null default 'unpaid',
  status text not null default 'submitted',
  production_status text not null default 'for_print',
  notes text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert on public.orders to anon;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders public read" on public.orders for select using (true);
create policy "orders public create" on public.orders for insert to anon with check (true);
create policy "orders staff write" on public.orders for all to authenticated using (true) with check (true);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- ORDER ITEMS
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  label text not null,
  print_size text,
  quantity int not null default 1,
  framed boolean not null default false,
  unit_price numeric(10,2) not null default 0,
  photo_id uuid references public.photos(id),
  kind text not null default 'package',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert on public.order_items to anon;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "order items public read" on public.order_items for select using (true);
create policy "order items public create" on public.order_items for insert to anon with check (true);
create policy "order items staff write" on public.order_items for all to authenticated using (true) with check (true);

-- PAYMENTS
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  method text not null default 'cash',
  reference text,
  status text not null default 'verified',
  proof_url text,
  notes text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert on public.payments to anon;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "payments public read" on public.payments for select using (true);
create policy "payments public create" on public.payments for insert to anon with check (true);
create policy "payments staff write" on public.payments for all to authenticated using (true) with check (true);

-- PRODUCTION CHECKS
create table public.production_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage text not null,
  completed boolean not null default false,
  checked_by text,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.production_checks to authenticated;
grant select on public.production_checks to anon;
grant all on public.production_checks to service_role;
alter table public.production_checks enable row level security;
create policy "production public read" on public.production_checks for select using (true);
create policy "production staff write" on public.production_checks for all to authenticated using (true) with check (true);

-- DELIVERIES
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'pending',
  delivered_by text,
  receiver_name text,
  notes text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.deliveries to authenticated;
grant select on public.deliveries to anon;
grant all on public.deliveries to service_role;
alter table public.deliveries enable row level security;
create policy "deliveries public read" on public.deliveries for select using (true);
create policy "deliveries staff write" on public.deliveries for all to authenticated using (true) with check (true);

-- AUDIT LOGS
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor text,
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "audit staff read" on public.audit_logs for select to authenticated using (true);
create policy "audit staff insert" on public.audit_logs for insert to authenticated with check (true);

-- ===== SEED =====
insert into public.events (id, name, slug, event_type, event_date, venue, description, id_prefix, ordering_deadline, delivery_date, payment_instructions)
values ('11111111-1111-1111-1111-111111111111','School for Congregation Elders 2026','sce-2026','School','2026-03-14','Grand Assembly Hall, Cebu','Two-day portrait session for attending elders. Nameplate + QR tagging workflow.','SCE','2026-03-20','2026-04-05','GCash / Maya: 0917 555 0134 (Misantio Studio). Send screenshot after payment.');

insert into public.packages (event_id, name, price, print_size, quantity, framed, digital_copy, description, sort_order) values
('11111111-1111-1111-1111-111111111111','Classic 4R', 350, '4R', 2, false, false, 'Two 4R prints of your chosen portrait.', 1),
('11111111-1111-1111-1111-111111111111','Signature 5R', 550, '5R', 2, false, true, 'Two 5R prints plus a high-resolution digital file.', 2),
('11111111-1111-1111-1111-111111111111','Framed 5R Portrait', 950, '5R', 1, true, true, 'One 5R print in a premium wooden frame, plus digital file.', 3),
('11111111-1111-1111-1111-111111111111','Heritage 8R Framed', 1650, '8R', 1, true, true, 'Statement 8R framed portrait with archival mounting and digital file.', 4);

do $$
declare
  ev uuid := '11111111-1111-1111-1111-111111111111';
  names text[] := array['Alonzo Rivera','Bernard Salcedo','Cristina Delgado','Dominic Arceo','Elena Villamor','Fernando Bautista','Grace Montenegro','Hector Palileo','Imelda Cabrera','Joaquin Estrella','Katrina Bulaong','Leonardo Ferrer','Marisol Aguinaldo','Nestor Dimaculangan','Olivia Sandoval','Paulo Mercado','Querubin Tolentino','Rosalinda Ibarra','Samuel Fajardo','Teresita Ocampo'];
  orgs text[] := array['Northgate Congregation','Southhill Congregation','Riverside Congregation','Lakeview Congregation','Eastwood Congregation'];
  pkgs uuid[];
  pid uuid;
  oid uuid;
  photo uuid;
  i int;
  code text;
  pkg uuid;
  pkg_price numeric;
  paid numeric;
  paystat text;
  prod text;
  ostat text;
begin
  select array_agg(id order by sort_order) into pkgs from public.packages where event_id = ev;

  for i in 1..20 loop
    code := 'SCE-' || lpad(i::text, 3, '0');
    insert into public.participants (event_id, participant_code, full_name, organization, batch, contact_number, thumbnail_url, shooting_status, gallery_status)
    values (ev, code, names[i], orgs[1 + (i % 5)], 'Batch ' || (1 + ((i-1)/7)), '09' || lpad((170000000 + i*137)::text, 9, '0'),
      'https://picsum.photos/seed/' || code || '-1/400/500',
      case when i <= 17 then 'shot' when i = 18 then 'skipped' else 'pending' end,
      case when i <= 16 then 'ready' when i <= 17 then 'processing' else 'none' end)
    returning id into pid;

    if i <= 17 then
      insert into public.photos (event_id, participant_id, url, file_name, sort_order, is_separator)
      select ev, pid, 'https://picsum.photos/seed/' || code || '-' || g || '/900/1200', code || '_' || lpad(g::text,4,'0') || '.jpg', g, g = 1
      from generate_series(1,5) g;
    end if;

    if i <= 14 then
      pkg := pkgs[1 + (i % 4)];
      select p.price into pkg_price from public.packages p where p.id = pkg;
      select id into photo from public.photos where participant_id = pid order by sort_order offset 1 limit 1;

      paystat := case when i % 5 = 0 then 'partial' when i % 7 = 0 then 'unpaid' else 'paid' end;
      paid := case paystat when 'paid' then pkg_price when 'partial' then round(pkg_price/2) else 0 end;
      prod := case
        when i <= 4 then 'delivered'
        when i <= 6 then 'ready'
        when i <= 8 then 'framed'
        when i <= 10 then 'print_qc'
        when i <= 12 then 'printed'
        else 'for_print' end;
      ostat := case prod when 'delivered' then 'delivered' when 'ready' then 'ready_for_delivery' else 'confirmed' end;

      insert into public.orders (event_id, participant_id, order_number, package_id, photo_id, total, paid, payment_method, payment_status, status, production_status, delivered_at)
      values (ev, pid, 'SCE-ORD-' || lpad(i::text,4,'0'), pkg, photo, pkg_price, paid,
        case when i % 3 = 0 then 'gcash' when i % 3 = 1 then 'maya' else 'cash' end,
        paystat, ostat, prod,
        case when prod = 'delivered' then now() - (i || ' days')::interval else null end)
      returning id into oid;

      insert into public.order_items (order_id, label, print_size, quantity, framed, unit_price, photo_id, kind)
      select oid, p.name, p.print_size, p.quantity, p.framed, p.price, photo, 'package' from public.packages p where p.id = pkg;

      if i % 4 = 0 then
        insert into public.order_items (order_id, label, print_size, quantity, framed, unit_price, photo_id, kind)
        values (oid, 'Extra 4R print', '4R', 2, false, 90, photo, 'addon');
      end if;

      if paid > 0 then
        insert into public.payments (order_id, amount, method, reference, status, paid_at)
        values (oid, paid, case when i % 3 = 0 then 'gcash' when i % 3 = 1 then 'maya' else 'cash' end,
          case when i % 3 = 2 then null else 'REF' || lpad((100000 + i*77)::text, 6, '0') end,
          case when i % 6 = 0 then 'pending' else 'verified' end, now() - (i || ' hours')::interval);
      end if;

      insert into public.production_checks (order_id, stage, completed, checked_by, completed_at)
      select oid, s, true, 'M. Santos', now() - (i || ' hours')::interval
      from unnest(case
        when prod = 'delivered' then array['for_print','printed','print_qc','framed','frame_qc','final_check','ready']
        when prod = 'ready' then array['for_print','printed','print_qc','framed','frame_qc','final_check']
        when prod = 'framed' then array['for_print','printed','print_qc','framed']
        when prod = 'print_qc' then array['for_print','printed','print_qc']
        when prod = 'printed' then array['for_print','printed']
        else array['for_print'] end) s;

      insert into public.deliveries (order_id, status, delivered_by, receiver_name, delivered_at)
      values (oid, case when prod = 'delivered' then 'delivered' when prod = 'ready' then 'pending' else 'pending' end,
        case when prod = 'delivered' then 'R. Misantio' else null end,
        case when prod = 'delivered' then names[i] else null end,
        case when prod = 'delivered' then now() - (i || ' days')::interval else null end);
    end if;
  end loop;
end $$;

