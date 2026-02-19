
  create policy "Enable read access for all users"
  on "public"."rehearsals"
  as permissive
  for select
  to public
using (true);



