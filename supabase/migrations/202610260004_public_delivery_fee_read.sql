-- Allow storefront visitors to read the delivery fee used for checkout display.
-- This table contains only the public delivery fee setting, not customer or order data.
grant select on public.store_settings to anon, authenticated;
drop policy if exists "Public can read delivery fee" on public.store_settings;
create policy "Public can read delivery fee" on public.store_settings
for select to anon, authenticated using (true);
