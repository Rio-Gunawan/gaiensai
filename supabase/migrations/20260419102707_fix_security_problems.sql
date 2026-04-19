drop function if exists "public"."verify_junior_id"(input_affiliation integer);


ALTER FUNCTION public.issue_junior_id()
SET search_path = public, pg_temp;
