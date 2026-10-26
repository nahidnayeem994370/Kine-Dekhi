-- Kine Dekhi: admin order benefits (free delivery and extra gift product)
alter table public.order_items add column if not exists is_gift boolean not null default false;

create or replace function public.admin_list_orders()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'Admin access required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'order_number',o.order_number,'customer_name',o.customer_name,
    'phone',o.phone,'address',o.address,'order_status',o.order_status,
    'payment_method',o.payment_method,'payment_status',o.payment_status,
    'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,
    'created_at',o.created_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'product_name',oi.product_name,'quantity',oi.quantity,'unit_price',oi.unit_price,
      'line_total',oi.line_total,'is_gift',oi.is_gift
    ) order by oi.id) from public.order_items oi where oi.order_id=o.id),'[]'::jsonb)
  ) order by o.created_at desc),'[]'::jsonb)
  into v_result from (select * from public.orders order by created_at desc limit 100) o;
  return v_result;
end;
$$;

create or replace function public.admin_apply_order_benefit(
  p_order_id bigint,
  p_benefit text,
  p_gift_product_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order public.orders%rowtype; v_product public.products%rowtype;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'Admin access required';
  end if;
  if p_benefit not in ('free_delivery','gift_product') then raise exception 'Invalid benefit'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_benefit='free_delivery' then
    update public.orders set delivery_fee=0,total=subtotal where id=p_order_id;
    return jsonb_build_object('success',true,'message','Free delivery applied');
  end if;

  if p_gift_product_id is null then raise exception 'Choose a gift product'; end if;
  select * into v_product from public.products where id=p_gift_product_id and is_active=true for update;
  if not found then raise exception 'Gift product unavailable'; end if;
  if v_product.stock < 1 then raise exception 'Gift product out of stock'; end if;
  if exists(select 1 from public.order_items where order_id=p_order_id and product_id=p_gift_product_id and is_gift=true) then
    raise exception 'This gift product is already added to this order';
  end if;
  insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total,is_gift)
  values(p_order_id,v_product.id,v_product.name,0,1,0,true);
  update public.products set stock=stock-1,updated_at=now() where id=v_product.id;
  return jsonb_build_object('success',true,'message','Gift product added');
end;
$$;

revoke all on function public.admin_list_orders() from public, anon;
revoke all on function public.admin_apply_order_benefit(bigint,text,bigint) from public, anon;
grant execute on function public.admin_list_orders() to authenticated;
grant execute on function public.admin_apply_order_benefit(bigint,text,bigint) to authenticated;
