-- PhotoFlow Finance v1
-- Studio-wide production cost rates + event expenses.

create table if not exists public.production_cost_rates (
  id uuid primary key default gen_random_uuid(),
  print_size text not null,
  framed boolean not null default false,
  print_cost numeric(12,2) not null default 0 check (print_cost >= 0),
  frame_cost numeric(12,2) not null default 0 check (frame_cost >= 0),
  packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0),
  other_unit_cost numeric(12,2) not null default 0 check (other_unit_cost >= 0),
  supplier text,
  notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(print_size, framed)
);

create table if not exists public.studio_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null check (category in ('printing','framing','packaging','transport','labor','supplies','other')),
  supplier text,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(12,2) generated always as (quantity * unit_cost) stored,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists studio_expenses_event_date_idx
  on public.studio_expenses(event_id, expense_date desc);

alter table public.production_cost_rates enable row level security;
alter table public.studio_expenses enable row level security;

grant select, insert, update, delete on public.production_cost_rates to authenticated;
grant select, insert, update, delete on public.studio_expenses to authenticated;
grant all on public.production_cost_rates to service_role;
grant all on public.studio_expenses to service_role;

drop policy if exists "finance rates staff read" on public.production_cost_rates;
create policy "finance rates staff read"
on public.production_cost_rates for select to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists "finance rates staff write" on public.production_cost_rates;
create policy "finance rates staff write"
on public.production_cost_rates for all to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists "finance expenses staff read" on public.studio_expenses;
create policy "finance expenses staff read"
on public.studio_expenses for select to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists "finance expenses staff write" on public.studio_expenses;
create policy "finance expenses staff write"
on public.studio_expenses for all to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));