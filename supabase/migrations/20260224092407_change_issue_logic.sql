drop policy "Enable users to view their own class tickets" on "public"."class_tickets";

drop policy "Enable users to view their own data only" on "public"."tickets";


  create policy "Enable read access for all users"
  on "public"."class_tickets"
  as permissive
  for select
  to public
using (true);



  create policy "Enable read access for all users"
  on "public"."tickets"
  as permissive
  for select
  to public
using (true);



