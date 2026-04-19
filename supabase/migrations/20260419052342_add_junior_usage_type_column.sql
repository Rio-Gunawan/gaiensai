alter table "public"."users" add column "junior_usage_type" smallint;

alter table "public"."users" alter column "affiliation" set data type integer using "affiliation"::integer;

alter table "public"."users" alter column "id" set default gen_random_uuid();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.issue_junior_id()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  next_id int;
  min_id int := 100001;
  max_id int := 101919;
begin
  -- 同時実行による重複採番を防ぐ
  lock table public.users in share row exclusive mode;

  -- ロールが 'junior' の中から最大の affiliation を取得
  select coalesce(max(affiliation), min_id - 1) + 1 into next_id
  from public.users
  where role = 'junior';

  -- 上限チェック
  if next_id > max_id then
    raise exception 'ID_LIMIT_REACHED';
  end if;

  return next_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_junior(junior_usage_type smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_affiliation integer;
begin
  if junior_usage_type < 0 or junior_usage_type > 3 then
    raise exception 'INVALID_JUNIOR_USAGE_TYPE';
  end if;

  next_affiliation := public.issue_junior_id();

  insert into public.users (id, email, affiliation, role, clubs, junior_usage_type)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    next_affiliation,
    'junior',
    null,
    junior_usage_type
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_student(affiliation integer, clubs text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, affiliation, role, clubs)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    affiliation,
    'student',
    clubs
  );
END;
$function$
;

grant all on function public.register_junior(smallint) to anon;
grant all on function public.register_junior(smallint) to authenticated;
grant all on function public.register_junior(smallint) to service_role;

grant all on function public.register_student(integer, text[]) to anon;
grant all on function public.register_student(integer, text[]) to authenticated;
grant all on function public.register_student(integer, text[]) to service_role;

CREATE OR REPLACE FUNCTION public.verify_junior_id(input_affiliation integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  found_id int;
begin
  select affiliation into found_id
  from public.users
  where affiliation = input_affiliation
  and role = 'junior';

  return found_id;
end;
$function$
;

