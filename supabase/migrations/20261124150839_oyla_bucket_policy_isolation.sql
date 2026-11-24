-- Restrictive policies constrain older permissive policies only inside the two OYLA buckets.
create policy oyla_storage_owner_boundary on storage.objects
  as restrictive for select to public
  using (
    bucket_id not in ('avatars', 'study-materials')
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy oyla_storage_server_insert on storage.objects
  as restrictive for insert to public
  with check (bucket_id not in ('avatars', 'study-materials'));

create policy oyla_storage_server_update on storage.objects
  as restrictive for update to public
  using (bucket_id not in ('avatars', 'study-materials'))
  with check (bucket_id not in ('avatars', 'study-materials'));

create policy oyla_storage_server_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id not in ('avatars', 'study-materials'));

-- Cloud default privileges may grant execution directly to service_role.
revoke execute on function public.oyla_dashboard() from service_role;
