alter table "public"."configs" drop column "name";


  create policy "Enable read access for no users"
  on "public"."admin_sessions"
  as permissive
  for select
  to public
using (false);



