-- PhotoFlow Production V2
-- Supplier PO receipts become actual Finance expenses, idempotently.

alter table public.studio_expenses
  add column if not exists supplier_order_id uuid references public.supplier_orders(id) on delete set null,
  add column if not exists supplier_order_item_id uuid references public.supplier_order_items(id) on delete set null;

create unique index if not exists studio_expenses_supplier_item_uidx
  on public.studio_expenses(supplier_order_item_id)
  where supplier_order_item_id is not null;

create unique index if not exists studio_expenses_supplier_shipping_uidx
  on public.studio_expenses(supplier_order_id)
  where supplier_order_id is not null
    and supplier_order_item_id is null
    and category = 'transport';

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
  _description text;
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

      _description :=
        _order.po_number || ' · ' || _item.print_size || ' ' ||
        case
          when _item.item_type = 'frame' then initcap(coalesce(nullif(_item.frame_color,''),'black')) || ' frame'
          else 'print'
        end;

      insert into public.studio_expenses(
        event_id, expense_date, category, supplier, description,
        quantity, unit_cost, notes, supplier_order_id, supplier_order_item_id
      ) values (
        _order.event_id,
        current_date,
        case when _item.item_type = 'frame' then 'framing' else 'printing' end,
        _order.supplier_name,
        _description,
        _item.quantity,
        _item.unit_cost,
        'Automatically recorded from received supplier purchase order.',
        _order.id,
        _item.id
      )
      on conflict (supplier_order_item_id) do nothing;
    end loop;

    if _order.shipping_cost > 0 and not exists (
      select 1
      from public.studio_expenses
      where supplier_order_id = _order.id
        and supplier_order_item_id is null
        and category = 'transport'
    ) then
      insert into public.studio_expenses(
        event_id, expense_date, category, supplier, description,
        quantity, unit_cost, notes, supplier_order_id, supplier_order_item_id
      ) values (
        _order.event_id,
        current_date,
        'transport',
        _order.supplier_name,
        _order.po_number || ' · Supplier delivery / shipping',
        1,
        _order.shipping_cost,
        'Automatically recorded from received supplier purchase order.',
        _order.id,
        null
      );
    end if;

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