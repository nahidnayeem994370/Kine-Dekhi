-- Kine dekhi: admin-controlled delivery fee setting
create table if not exists public.store_settings (
  id integer primary key check (id = 1),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0 and delivery_fee <= 100000),
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id, delivery_fee)
values (1, 0) on conflict (id) do nothing;
alter table public.store_settings enable row level security;
revoke all on public.store_settings from anon, authenticated;
grant select, update, insert on public.store_settings to authenticated;
drop policy if exists "Admins can read store settings" on public.store_settings;
drop policy if exists "Admins can update store settings" on public.store_settings;
drop policy if exists "Admins can insert store settings" on public.store_settings;
create policy "Admins can read store settings" on public.store_settings
for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Admins can update store settings" on public.store_settings
for update to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Admins can insert store settings" on public.store_settings
for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
