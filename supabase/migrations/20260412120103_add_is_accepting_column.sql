drop policy "Enable read access for all users" on "public"."keep_alive";

drop policy "Update Policy" on "public"."keep_alive";

drop policy "allow anon upsert keep alive" on "public"."keep_alive";

drop function if exists "public"."register_student"(student_name text, grade_no integer, class_no integer, student_no integer, teacher_name_input text);

alter table "public"."class_performances" add column "is_accepting" boolean default true;

alter table "public"."gym_performances" add column "is_accepting" boolean default true;

alter table "public"."keep_alive" alter column "id" drop identity;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_by_email(user_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT id
          FROM auth.users
          WHERE email = user_email
          LIMIT 1);
END;
$function$
;


  create policy "allow anon update keep alive"
  on "public"."keep_alive"
  as permissive
  for update
  to anon
using ((id = 1))
with check ((id = 1));



  create policy "allow anon upsert keep alive"
  on "public"."keep_alive"
  as permissive
  for insert
  to anon
with check ((id = 1));
