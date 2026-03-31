drop policy "Policy with table joins" on "public"."teachers";

alter table "public"."class_tickets" drop constraint "class_tickets_class_id_fkey";

alter table "public"."class_tickets" drop constraint "class_tickets_id_fkey";

alter table "public"."class_tickets" drop constraint "class_tickets_round_id_fkey";

alter table "public"."gym_tickets" drop constraint "gym_tickets_id_fkey";

alter table "public"."gym_tickets" drop constraint "gym_tickets_performance_id_fkey";

alter table "public"."rehearsals" drop constraint "rehearsals_class_id_fkey";

alter table "public"."tickets" drop constraint "tickets_relationship_fkey";

alter table "public"."tickets" drop constraint "tickets_ticket_type_fkey";

alter table "public"."tickets" drop constraint "tickets_user_id_fkey";

alter table "public"."rehearsals" alter column "type" set default 'official'::public.rehearsal_type;

alter table "public"."rehearsals" alter column "type" set data type public.rehearsal_type using "type"::text::public.rehearsal_type;

alter table "public"."ticket_issue_controls" enable row level security;

alter table "public"."tickets" alter column "status" set default 'valid'::public.ticket_status;

alter table "public"."tickets" alter column "status" set data type public.ticket_status using "status"::text::public.ticket_status;

alter table "public"."class_tickets" add constraint "class_tickets_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.class_performances(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."class_tickets" validate constraint "class_tickets_class_id_fkey";

alter table "public"."class_tickets" add constraint "class_tickets_id_fkey" FOREIGN KEY (id) REFERENCES public.tickets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."class_tickets" validate constraint "class_tickets_id_fkey";

alter table "public"."class_tickets" add constraint "class_tickets_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.performances_schedule(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."class_tickets" validate constraint "class_tickets_round_id_fkey";

alter table "public"."gym_tickets" add constraint "gym_tickets_id_fkey" FOREIGN KEY (id) REFERENCES public.tickets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."gym_tickets" validate constraint "gym_tickets_id_fkey";

alter table "public"."gym_tickets" add constraint "gym_tickets_performance_id_fkey" FOREIGN KEY (performance_id) REFERENCES public.gym_performances(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."gym_tickets" validate constraint "gym_tickets_performance_id_fkey";

alter table "public"."rehearsals" add constraint "rehearsals_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.class_performances(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."rehearsals" validate constraint "rehearsals_class_id_fkey";

alter table "public"."tickets" add constraint "tickets_relationship_fkey" FOREIGN KEY (relationship) REFERENCES public.relationships(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."tickets" validate constraint "tickets_relationship_fkey";

alter table "public"."tickets" add constraint "tickets_ticket_type_fkey" FOREIGN KEY (ticket_type) REFERENCES public.ticket_types(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."tickets" validate constraint "tickets_ticket_type_fkey";

alter table "public"."tickets" add constraint "tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."tickets" validate constraint "tickets_user_id_fkey";


  create policy "Enable read access for no users"
  on "public"."admin_auth_rate_limits"
  as permissive
  for select
  to public
using (false);



  create policy "Enable read access for all users"
  on "public"."ticket_issue_controls"
  as permissive
  for select
  to public
using (true);



  create policy "Policy with table joins"
  on "public"."teachers"
  as permissive
  for update
  to public
using ((( SELECT auth.uid() AS uid) IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))));



