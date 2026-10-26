-- Kine Dekhi product discounts and public bestseller counts
alter table public.products add column if not exists original_price numeric(12,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='products_original_price_valid') then
    alter table public.products add constraint products_original_price_valid
      check (original_price is null or original_price > price) not valid;
  end if;
end $$;
alter table public.products validate constraint products_original_price_valid;

create or replace function public.public_product_sales()
returns table(product_id bigint, sales_count bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
 select oi.product_id, coalesce(sum(oi.quantity),0)::bigint
 from public.order_items oi
 join public.orders o on o.id = oi.order_id
 where lower(coalesce(o.order_status,'')) in ('confirmed','processing','shipped','delivered','completed')
 group by oi.product_id;
$$;
revoke all on function public.public_product_sales() from public;
grant execute on function public.public_product_sales() to anon, authenticated;
