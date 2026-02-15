alter table "public"."configs" enable row level security;

alter table "public"."performances" enable row level security;


  create policy "Enable read access for all users"
  on "public"."configs"
  as permissive
  for select
  to public
using (true);



  create policy "Enable read access for all users"
  on "public"."performances"
  as permissive
  for select
  to public
using (true);



