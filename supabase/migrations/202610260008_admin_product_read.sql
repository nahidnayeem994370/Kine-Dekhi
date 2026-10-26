-- Allow authenticated admins to view all products in the admin panel.
-- Public storefront access remains limited by existing product policies.
drop policy if exists "Admins can view all products" on public.products;
create policy "Admins can view all products"
on public.products
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
