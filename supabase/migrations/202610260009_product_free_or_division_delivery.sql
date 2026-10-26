-- Kine dekhi: free products are free individually; chargeable products use the selected division fee.
create or replace function public.create_order_secure(
 p_customer_name text, p_phone text, p_address text, p_division_name text, p_payment_method text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
 v_order_id bigint; v_order_number text; v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0;
 v_default_delivery_fee numeric(12,2):=0; v_division_fee numeric(12,2);
 v_item jsonb; v_product_id bigint; v_qty integer; v_product public.products%rowtype;
 v_line_total numeric(12,2); v_total numeric(12,2);
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
  if v_product.stock<v_qty then raise exception 'Insufficient stock for product %',v_product.name; end if;
  v_subtotal:=v_subtotal+v_product.price*v_qty;
 end loop;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct (value->>'product_id')::bigint) from jsonb_array_elements(p_items)) then raise exception 'Duplicate products in order'; end if;
 select delivery_fee into v_default_delivery_fee from public.store_settings where id=1;
 if not found then raise exception 'Delivery fee setting is missing'; end if;
 select delivery_fee into v_division_fee from public.division_delivery_fees where division_name=p_division_name;
 if v_division_fee is not null then v_default_delivery_fee:=v_division_fee; end if;
 -- If at least one ordered product uses division-based delivery, charge the division fee once.
 -- Only when every ordered product is marked free is the order delivery free.
 if exists(
   select 1 from jsonb_array_elements(p_items) x
   join public.products p on p.id=(x.value->>'product_id')::bigint
   where p.delivery_fee is null
 ) then
   v_delivery_fee:=v_default_delivery_fee;
 else
   v_delivery_fee:=0;
 end if;
 v_total:=v_subtotal+v_delivery_fee;
 v_order_number:='KD-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(5),'hex'),1,10));
 insert into public.orders(order_number,customer_name,phone,address,payment_method,payment_status,order_status,subtotal,delivery_fee,total)
 values(v_order_number,trim(p_customer_name),trim(p_phone),trim(p_address),p_payment_method,case when p_payment_method='cod' then 'unpaid' else 'pending' end,'pending',v_subtotal,v_delivery_fee,v_total)
 returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_product_id:=(v_item->>'product_id')::bigint; v_qty:=(v_item->>'quantity')::integer;
  select * into v_product from public.products where id=v_product_id;
  v_line_total:=v_product.price*v_qty;
  insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total) values(v_order_id,v_product.id,v_product.name,v_product.price,v_qty,v_line_total);
  update public.products set stock=stock-v_qty,updated_at=now() where id=v_product_id;
 end loop;
 return jsonb_build_object('success',true,'order_number',v_order_number,'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total);
end; $$;
revoke all on function public.create_order_secure(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.create_order_secure(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_order_secure(text,text,text,text,text,jsonb) to service_role;
