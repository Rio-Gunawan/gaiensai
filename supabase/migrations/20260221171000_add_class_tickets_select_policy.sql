drop policy if exists "Enable users to view their own class tickets" on "public"."class_tickets";

create policy "Enable users to view their own class tickets"
on "public"."class_tickets"
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = class_tickets.id
      and t.user_id = auth.uid()
  )
);
