-- Kine dekhi product media: up to 12 images and 3 videos per product.
alter table public.products add column if not exists image_urls text[] not null default '{}';
alter table public.products add column if not exists video_urls text[] not null default '{}';
update public.products set image_urls=array[image_url] where coalesce(cardinality(image_urls),0)=0 and image_url is not null and btrim(image_url)<>'';
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-media','product-media',true,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=true,file_size_limit=104857600,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public can view product media" on storage.objects;
create policy "Public can view product media" on storage.objects for select using (bucket_id='product-media');
drop policy if exists "Admins upload product media" on storage.objects;
create policy "Admins upload product media" on storage.objects for insert to authenticated with check (bucket_id='product-media' and (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Admins update product media" on storage.objects;
create policy "Admins update product media" on storage.objects for update to authenticated using (bucket_id='product-media' and (auth.jwt()->'app_metadata'->>'role')='admin') with check (bucket_id='product-media' and (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Admins delete product media" on storage.objects;
create policy "Admins delete product media" on storage.objects for delete to authenticated using (bucket_id='product-media' and (auth.jwt()->'app_metadata'->>'role')='admin');
