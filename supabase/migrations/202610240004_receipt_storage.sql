-- Requires the Supabase Storage service schema. Apply with the full local stack.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,10485760,array['application/pdf']);
create policy receipt_object_insert on storage.objects for insert to authenticated with check(
  bucket_id='receipts' and exists(select 1 from public.receipt_imports r where r.object_path=name and r.uploaded_by=(select auth.uid()) and r.status='uploading' and private.is_member(r.household_id))
);
create policy receipt_object_read on storage.objects for select to authenticated using(
  bucket_id='receipts' and exists(select 1 from public.receipt_imports r where r.object_path=name and private.is_member(r.household_id))
);
-- Clients cannot overwrite or delete source objects. Source deletion is a later server workflow.
