-- Storage RLS 策略 — 允许 authenticated 用户对 ReminiSea bucket 的完全访问
-- 在 Supabase SQL Editor 中执行

-- 允许查看对象
create policy "auth_select_objects" on storage.objects
  for select using (auth.role() = 'authenticated' and bucket_id = 'ReminiSea');

-- 允许上传对象
create policy "auth_insert_objects" on storage.objects
  for insert with check (auth.role() = 'authenticated' and bucket_id = 'ReminiSea');

-- 允许更新对象
create policy "auth_update_objects" on storage.objects
  for update using (auth.role() = 'authenticated' and bucket_id = 'ReminiSea');

-- 允许删除对象
create policy "auth_delete_objects" on storage.objects
  for delete using (auth.role() = 'authenticated' and bucket_id = 'ReminiSea');
