alter table public.orders add column if not exists delivered_at timestamptz;

create or replace function public.set_order_completion_timestamps()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.order_status = 'delivered'
     and (tg_op = 'INSERT' or old.order_status is distinct from 'delivered') then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_order_completion_timestamps on public.orders;
create trigger trg_set_order_completion_timestamps
before insert or update of order_status on public.orders
for each row execute function public.set_order_completion_timestamps();

create or replace function public.admin_profit_report(p_period text default 'day')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
 v_local_date date := (now() at time zone 'Asia/Dhaka')::date;
 v_start_date date;
 v_end_date date;
 v_start timestamptz;
 v_end timestamptz;
 v_result jsonb;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
  raise exception 'Admin access required' using errcode='42501';
 end if;
 if p_period not in ('day','7days','month','year','all') then
  raise exception 'Invalid report period';
 end if;
 v_start_date := case p_period
  when 'day' then v_local_date
  when '7days' then v_local_date - 6
  when 'month' then date_trunc('month',v_local_date)::date
  when 'year' then date_trunc('year',v_local_date)::date
  else '1970-01-01'::date end;
 v_end_date := case when p_period='all' then 'infinity'::date else v_local_date+1 end;
 v_start := v_start_date::timestamp at time zone 'Asia/Dhaka';
 v_end := case when p_period='all' then 'infinity'::timestamptz else v_end_date::timestamp at time zone 'Asia/Dhaka' end;

 with delivered as (
  select o.id,
   greatest(coalesce(o.subtotal,0)-coalesce(o.discount_amount,0),0) net_items_sales,
   coalesce(o.delivery_fee,0) customer_delivery_paid,
   coalesce(o.courier_cost,0) courier_cost
  from public.orders o
  where o.order_status='delivered'
    and coalesce(o.delivered_at,o.created_at)>=v_start
    and coalesce(o.delivered_at,o.created_at)<v_end
 ),
 item_costs as (
  select oi.order_id,
   sum(coalesce(oi.unit_cost_snapshot,pc.purchase_cost,0)*greatest(coalesce(oi.quantity,0),0)) product_cost,
   bool_or(oi.unit_cost_snapshot is null and pc.purchase_cost is null) has_missing_cost
  from public.order_items oi
  join delivered d on d.id=oi.order_id
  left join public.product_costs pc on pc.product_id=oi.product_id
  where not coalesce(oi.is_gift,false)
  group by oi.order_id
 ),
 returns as (
  select r.order_id,
   sum(coalesce(r.refund_amount,0)) refund_amount,
   sum(coalesce(r.loss_amount,0)) damage_loss,
   sum(coalesce(r.quantity,0)) returned_quantity,
   count(*) return_count,
   sum(case when r.item_condition='good'
     then coalesce(oi.unit_cost_snapshot,pc.purchase_cost,0)*coalesce(r.quantity,0)
     else 0 end) good_return_cost_credit
  from public.order_returns r
  join public.order_items oi on oi.id=r.order_item_id
  left join public.product_costs pc on pc.product_id=oi.product_id
  where r.created_at>=v_start and r.created_at<v_end
  group by r.order_id
 ),
 expenses as (
  select coalesce(sum(amount) filter(where expense_type='advertising'),0) advertising,
   coalesce(sum(amount) filter(where expense_type='salary'),0) salary
  from public.business_expenses
  where expense_date>=v_start_date and expense_date<v_end_date
 ),
 free_returns as (
  select count(distinct r.order_id)::integer free_return_orders,
   count(distinct r.order_id)*coalesce((select delivery_fee from public.store_settings where id=1),0) free_delivery_loss
  from public.order_returns r
  join public.orders o on o.id=r.order_id
  where r.created_at>=v_start and r.created_at<v_end
    and coalesce(o.delivery_fee,0)=0
 ),
 stock as (
  select coalesce(sum(p.stock*coalesce(pc.purchase_cost,0)),0) current_stock_purchase_cost,
   count(*) filter(where p.stock>0 and pc.product_id is null)::integer missing_stock_cost_products
  from public.products p left join public.product_costs pc on pc.product_id=p.id
 ),
 period_order_events as (
  select id from delivered
  union
  select order_id from returns
 )
 select jsonb_build_object(
  'period',p_period,
  'total_orders',(select count(*)::integer from period_order_events),
  'pending_orders',0,
  'delivered_orders',(select count(*)::integer from delivered),
  'status_counts',jsonb_build_object(
    'delivered',(select count(*)::integer from delivered),
    'returned',(select count(distinct order_id)::integer from returns)
  ),
  'sales',coalesce((select sum(net_items_sales) from delivered),0),
  'discounts',coalesce((select sum(coalesce(o.discount_amount,0)) from public.orders o join delivered d on d.id=o.id),0),
  'customer_delivery_paid',coalesce((select sum(customer_delivery_paid) from delivered),0),
  'product_cost',coalesce((select sum(product_cost) from item_costs),0),
  'missing_cost_orders',coalesce((select count(*) from item_costs where has_missing_cost),0),
  'advertising',expenses.advertising,'salary',expenses.salary,
  'courier_cost',coalesce((select sum(courier_cost) from delivered),0),
  'refunds',coalesce((select sum(refund_amount) from returns),0),
  'damage_loss',coalesce((select sum(damage_loss) from returns),0),
  'return_count',coalesce((select sum(return_count) from returns),0),
  'returned_quantity',coalesce((select sum(returned_quantity) from returns),0),
  'free_return_orders',fr.free_return_orders,'free_delivery_loss',fr.free_delivery_loss,
  'current_stock_purchase_cost',stock.current_stock_purchase_cost,
  'current_stock_cost_missing_products',stock.missing_stock_cost_products,
  'missing_stock_cost_products',stock.missing_stock_cost_products,
  'profit',coalesce((select sum(net_items_sales) from delivered),0)
   -coalesce((select sum(product_cost) from item_costs),0)
   -expenses.advertising-expenses.salary
   -coalesce((select sum(courier_cost) from delivered),0)
   -coalesce((select sum(refund_amount) from returns),0)
   +coalesce((select sum(good_return_cost_credit) from returns),0)
   -fr.free_delivery_loss
 ) into v_result from expenses cross join free_returns fr cross join stock;
 return v_result;
end;
$function$;
