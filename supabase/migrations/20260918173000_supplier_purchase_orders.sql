-- PhotoFlow supplier purchase orders
-- Draft -> ordered -> received, linked to production requirements.

update public.production_procurement
set frame_color = ''
where frame_color is null;

alter table public.production_procurement
  alter column frame_color set default '',
  alter column frame_color set not null;

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  po_number text not null unique,
  supplier_name text not null,
  supplier_contact text,
  status text not null default 'draft'
    check (status in ('draft','ordered','received','cancelled')),
  expected_date date,
  notes text,
  shipping_cost numeric(10,2) not null default 0 check (shipping_cost >= 0),
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  ordered_at timestamptz,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_orders_event_idx
  on public.supplier_orders(event_id, created_at desc);

create table if not exists public.supplier_order_items (
  id uuid primary key default gen_random_uuid(),
  supplier_order_id uuid not null references public.supplier_orders(id) on delete cascade,
  item_type text not null check (item_type in ('print','frame')),
  print_size text not null,
  frame_color text not null default '',
  quantity integer not null check (quantity > 0),
  unit_cost numeric(10,2) not null default 0 check (unit_cost >= 0),
  line_total numeric(10,2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create index if not exists supplier_order_items_order_idx
  on public.supplier_order_items(supplier_order_id);

alter table public.supplier_orders enable row level security;
alter table public.supplier_order_items enable row level security;

grant select, insert, update, delete on public.supplier_orders to authenticated;
grant select, insert, update, delete on public.supplier_order_items to authenticated;
grant all on public.supplier_orders to service_role;
grant all on public.supplier_order_items to service_role;

drop policy if exists "supplier orders staff read" on public.supplier_orders;
create policy "supplier orders staff read"
on public.supplier_orders for select to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists "supplier orders staff write" on public.supplier_orders;
create policy "supplier orders staff write"
on public.supplier_orders for all to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists "supplier order items staff read" on public.supplier_order_items;
create policy "supplier order items staff read"
on public.supplier_order_items for select to authenticated
using (
  exists (
    select 1
    from public.supplier_orders so
    where so.id = supplier_order_id
      and public.is_staff(auth.uid())
  )
);

drop policy if exists "supplier order items staff write" on public.supplier_order_items;
create policy "supplier order items staff write"
on public.supplier_order_items for all to authenticated
using (
  exists (
    select 1
    from public.supplier_orders so
    where so.id = supplier_order_id
      and public.is_staff(auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.supplier_orders so
    where so.id = supplier_order_id
      and public.is_staff(auth.uid())
  )
);

create or replace function public.create_supplier_order_v1(
  _event_id uuid,
  _supplier_name text,
  _supplier_contact text default null,
  _expected_date date default null,
  _shipping_cost numeric default 0,
  _notes text default null,
  _items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _order_id uuid;
  _po_number text;
  _item jsonb;
  _item_type text;
  _print_size text;
  _frame_color text;
  _quantity int;
  _unit_cost numeric(10,2);
  _subtotal numeric(10,2) := 0;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Authorized staff only.';
  end if;

  if length(trim(coalesce(_supplier_name,''))) < 2 then
    raise exception 'Supplier name is required.';
  end if;

  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) < 1 then
    raise exception 'Add at least one item to this supplier order.';
  end if;

  _po_number := 'PO-' || to_char(current_date,'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));

  insert into public.supplier_orders(
    event_id, po_number, supplier_name, supplier_contact, status,
    expected_date, notes, shipping_cost, subtotal, total, created_by
  ) values (
    _event_id, _po_number, trim(_supplier_name),
    nullif(trim(coalesce(_supplier_contact,'')),''),
    'draft', _expected_date, nullif(trim(coalesce(_notes,'')),''),
    greatest(0, coalesce(_shipping_cost,0)), 0, 0, auth.uid()
  ) returning id into _order_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _item_type := lower(coalesce(_item->>'item_type',''));
    _print_size := trim(coalesce(_item->>'print_size',''));
    _quantity := greatest(1, least(9999, coalesce((_item->>'quantity')::int,1)));
    _unit_cost := greatest(0, coalesce((_item->>'unit_cost')::numeric,0));

    if _item_type not in ('print','frame') then
      raise exception 'Invalid supplier order item type.';
    end if;
    if length(_print_size) < 1 then
      raise exception 'Every supplier order item needs a size.';
    end if;

    _frame_color := case
      when _item_type = 'frame' then
        case when lower(coalesce(_item->>'frame_color','black')) in ('black','white','brown')
          then lower(coalesce(_item->>'frame_color','black'))
          else 'black'
        end
      else ''
    end;

    insert into public.supplier_order_items(
      supplier_order_id, item_type, print_size, frame_color, quantity, unit_cost
    ) values (
      _order_id, _item_type, _print_size, _frame_color, _quantity, _unit_cost
    );

    _subtotal := _subtotal + (_quantity * _unit_cost);
  end loop;

  update public.supplier_orders
  set subtotal = _subtotal,
      total = _subtotal + greatest(0, coalesce(_shipping_cost,0)),
      updated_at = now()
  where id = _order_id;

  return _order_id;
end;
$$;

grant execute on function public.create_supplier_order_v1(uuid,text,text,date,numeric,text,jsonb)
to authenticated;

create or replace function public.set_supplier_order_status_v1(
  _supplier_order_id uuid,
  _status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.supplier_orders%rowtype;
  _item public.supplier_order_items%rowtype;
  _key_color text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Authorized staff only.';
  end if;

  select * into _order
  from public.supplier_orders
  where id = _supplier_order_id
  for update;

  if not found then raise exception 'Supplier order not found.'; end if;

  if _status not in ('ordered','received','cancelled') then
    raise exception 'Invalid supplier order status.';
  end if;

  if _order.status = _status then return; end if;
  if _order.status = 'cancelled' then raise exception 'Cancelled supplier orders cannot be changed.'; end if;

  if _status = 'ordered' then
    if _order.status <> 'draft' then
      raise exception 'Only draft supplier orders can be marked ordered.';
    end if;

    for _item in
      select * from public.supplier_order_items where supplier_order_id = _order.id
    loop
      _key_color := case when _item.item_type = 'frame' then _item.frame_color else '' end;

      insert into public.production_procurement(
        event_id, item_type, print_size, frame_color, ordered_qty, received_qty,
        supplier, ordered_at, updated_at
      ) values (
        _order.event_id, _item.item_type, _item.print_size, _key_color,
        _item.quantity, 0, _order.supplier_name, now(), now()
      )
      on conflict (event_id,item_type,print_size,frame_color)
      do update set
        ordered_qty = public.production_procurement.ordered_qty + excluded.ordered_qty,
        supplier = excluded.supplier,
        ordered_at = now(),
        updated_at = now();
    end loop;

    update public.supplier_orders
    set status='ordered', ordered_at=now(), updated_at=now()
    where id=_order.id;
    return;
  end if;

  if _status = 'received' then
    if _order.status <> 'ordered' then
      raise exception 'Mark this supplier order as ordered first.';
    end if;

    for _item in
      select * from public.supplier_order_items where supplier_order_id = _order.id
    loop
      _key_color := case when _item.item_type = 'frame' then _item.frame_color else '' end;

      update public.production_procurement
      set received_qty = received_qty + _item.quantity,
          received_at = now(),
          updated_at = now()
      where event_id = _order.event_id
        and item_type = _item.item_type
        and print_size = _item.print_size
        and frame_color = _key_color;
    end loop;

    update public.supplier_orders
    set status='received', received_at=now(), updated_at=now()
    where id=_order.id;
    return;
  end if;

  if _status = 'cancelled' then
    if _order.status <> 'draft' then
      raise exception 'Only draft supplier orders can be cancelled safely.';
    end if;

    update public.supplier_orders
    set status='cancelled', updated_at=now()
    where id=_order.id;
  end if;
end;
$$;

grant execute on function public.set_supplier_order_status_v1(uuid,text)
to authenticated;