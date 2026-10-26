-- Kine dekhi: selectable product sizes/colors and persist selections with orders.
alter table public.products add column if not exists size_options text[] not null default '{}';
alter table public.products add column if not exists color_options text[] not null default '{}';
alter table public.order_items add column if not exists selected_size text;
alter table public.order_items add column if not exists selected_color text;

create or replace function public.create_order_secure(
 p_customer_name text, p_phone text, p_address text, p_division_name text, p_payment_method text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_order_id bigint; v_order_number text; v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0;
 v_default_delivery_fee numeric(12,2):=0; v_division_fee numeric(12,2); v_has_free_product boolean:=false;
 v_item jsonb; v_product_id bigint; v_qty integer; v_product public.products%rowtype;
 v_line_total numeric(12,2); v_total numeric(12,2); v_size text; v_color text;
begin
 if length(trim(coalesce(p_customer_name,'')))<2 or length(trim(p_customer_name))>120 then raise exception 'Invalid customer name'; end if;
 if trim(coalesce(p_phone,'')) !~ '^[0-9+() -]{8,20}$' then raise exception 'Invalid phone number'; end if;
 if length(trim(coalesce(p_address,'')))<8 or length(trim(p_address))>500 then raise exception 'Invalid delivery address'; end if;
 if p_division_name not in ('ঢাকা','চট্টগ্রাম','রাজশাহী','খুলনা','বরিশাল','সিলেট','রংপুর','ময়মনসিংহ') then raise exception 'Invalid delivery division'; end if;
 if p_payment_method not in ('cod','bkash','nagad') then raise exception 'Invalid payment method'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Invalid order items'; end if;
 for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id')::bigint loop
  if coalesce(v_item->>'product_id','') !~ '^[0-9]+$' or coalesce(v_item->>'quantity','') !~ '^[0-9]+$' then raise exception 'Invalid product or quantity'; end if;
  v_product_id:=(v_item->>'product_id')::bigint; v_qty:=(v_item->>'quantity')::integer;
  if v_qty<1 or v_qty>20 then raise exception 'Invalid quantity'; end if;
  select * into v_product from public.products where id=v_product_id and is_active=true for update;
  if not found then raise exception 'Product unavailable'; end if;
  v_size:=nullif(trim(coalesce(v_item->>'size','')),''); v_color:=nullif(trim(coalesce(v_item->>'color','')),'');
  if coalesce(cardinality(v_product.size_options),0)>0 and (v_size is null or not (v_size=any(v_product.size_options))) then raise exception 'Invalid or missing size for %',v_product.name; end if;
  if coalesce(cardinality(v_product.color_options),0)>0 and (v_color is null or not (v_color=any(v_product.color_options))) then raise exception 'Invalid or missing color for %',v_product.name; end if;
  if coalesce(cardinality(v_product.size_options),0)=0 and v_size is not null then raise exception 'Size not available for %',v_product.name; end if;
  if coalesce(cardinality(v_product.color_options),0)=0 and v_color is not null then raise exception 'Color not available for %',v_product.name; end if;
  if v_product.stock<v_qty then raise exception 'Insufficient stock for product %',v_product.name; end if;
  v_subtotal:=v_subtotal+v_product.price*v_qty;
  if v_product.delivery_fee=0 then v_has_free_product:=true; end if;
  v_delivery_fee:=greatest(v_delivery_fee,coalesce(v_product.delivery_fee,0));
 end loop;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct concat_ws('|',value->>'product_id',coalesce(value->>'size',''),coalesce(value->>'color',''))) from jsonb_array_elements(p_items)) then raise exception 'Duplicate product variants in order'; end if;
 select delivery_fee into v_default_delivery_fee from public.store_settings where id=1;
 if not found then raise exception 'Delivery fee setting is missing'; end if;
 select delivery_fee into v_division_fee from public.division_delivery_fees where division_name=p_division_name;
 if v_division_fee is not null then v_default_delivery_fee:=v_division_fee; end if;
 if v_has_free_product then v_delivery_fee:=0;
 elsif exists(select 1 from jsonb_array_elements(p_items) x join public.products p on p.id=(x.value->>'product_id')::bigint where p.delivery_fee is null) then
  v_delivery_fee:=greatest(v_delivery_fee,v_default_delivery_fee);
 end if;
 v_total:=v_subtotal+v_delivery_fee;
 v_order_number:='KD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(5),'hex'),1,10));
 insert into public.orders(order_number,customer_name,phone,address,payment_method,payment_status,order_status,subtotal,delivery_fee,total)
 values(v_order_number,trim(p_customer_name),trim(p_phone),trim(p_address),p_payment_method,case when p_payment_method='cod' then 'unpaid' else 'pending' end,'pending',v_subtotal,v_delivery_fee,v_total)
 returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_product_id:=(v_item->>'product_id')::bigint; v_qty:=(v_item->>'quantity')::integer;
  v_size:=nullif(trim(coalesce(v_item->>'size','')),''); v_color:=nullif(trim(coalesce(v_item->>'color','')),'');
  select * into v_product from public.products where id=v_product_id;
  v_line_total:=v_product.price*v_qty;
  insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total,selected_size,selected_color)
  values(v_order_id,v_product.id,v_product.name,v_product.price,v_qty,v_line_total,v_size,v_color);
  update public.products set stock=stock-v_qty,updated_at=now() where id=v_product_id;
 end loop;
 return jsonb_build_object('success',true,'order_number',v_order_number,'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total);
end; $$;

create or replace function public.admin_list_orders()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then raise exception 'Admin access required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'order_number',o.order_number,'customer_name',o.customer_name,'phone',o.phone,'address',o.address,
  'order_status',o.order_status,'payment_method',o.payment_method,'payment_status',o.payment_status,
  'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'created_at',o.created_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('product_name',oi.product_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total,'is_gift',oi.is_gift,'size',oi.selected_size,'color',oi.selected_color) order by oi.id) from public.order_items oi where oi.order_id=o.id),'[]'::jsonb)
 ) order by o.created_at desc),'[]'::jsonb) into v_result from (select * from public.orders order by created_at desc limit 100) o;
 return v_result;
end; $$;
revoke all on function public.create_order_secure(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_order_secure(text,text,text,text,text,jsonb) to service_role;
revoke all on function public.admin_list_orders() from public,anon;
grant execute on function public.admin_list_orders() to authenticated;
