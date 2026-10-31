do $migration$
declare v_def text;
begin
 v_def := pg_get_functiondef('public.admin_profit_report(text)'::regprocedure);
 if position('v_result := v_result || jsonb_build_object' in v_def)>0 then
   raise notice 'Lifetime counters already installed';
   return;
 end if;
 v_def := replace(v_def, ' return v_result;', $patch$
 v_result := v_result || jsonb_build_object(
  'total_orders',(select count(*)::integer from public.orders),
  'pending_orders',(select count(*)::integer from public.orders where order_status='pending'),
  'status_counts',jsonb_build_object(
   'pending',(select count(*)::integer from public.orders where order_status='pending'),
   'confirmed',(select count(*)::integer from public.orders where order_status='confirmed'),
   'processing',(select count(*)::integer from public.orders where order_status='processing'),
   'shipped',(select count(*)::integer from public.orders where order_status='shipped'),
   'delivered',(select count(*)::integer from public.orders where order_status='delivered'),
   'returned',(select count(*)::integer from public.orders where order_status='returned'),
   'cancelled',(select count(*)::integer from public.orders where order_status='cancelled')
  )
 );
 return v_result;$patch$);
 if position('v_result := v_result || jsonb_build_object' in v_def)=0 then
   raise exception 'Could not safely update report function';
 end if;
 execute v_def;
end
$migration$;
