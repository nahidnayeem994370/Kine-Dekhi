-- Admin-only order status updates for Kine Dekhi.
create or replace function public.admin_update_order_status(
  p_order_id bigint,
  p_order_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Admin access required';
  end if;

  if p_order_status not in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;

  update public.orders
     set order_status = p_order_status
   where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'order_status', p_order_status);
end;
$$;

revoke all on function public.admin_update_order_status(bigint, text) from public, anon;
grant execute on function public.admin_update_order_status(bigint, text) to authenticated;
