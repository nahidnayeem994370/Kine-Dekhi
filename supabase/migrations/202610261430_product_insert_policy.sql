-- Allow authenticated admins to create products from the Kine Dekhi admin panel.
drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
on public.products
for insert
to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');
