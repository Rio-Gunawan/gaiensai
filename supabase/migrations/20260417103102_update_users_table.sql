drop policy "Policy with table joins" on "public"."teachers";

revoke delete on table "public"."teachers" from "anon";

revoke insert on table "public"."teachers" from "anon";

revoke references on table "public"."teachers" from "anon";

revoke select on table "public"."teachers" from "anon";

revoke trigger on table "public"."teachers" from "anon";

revoke truncate on table "public"."teachers" from "anon";

revoke update on table "public"."teachers" from "anon";

revoke delete on table "public"."teachers" from "authenticated";

revoke insert on table "public"."teachers" from "authenticated";

revoke references on table "public"."teachers" from "authenticated";

revoke select on table "public"."teachers" from "authenticated";

revoke trigger on table "public"."teachers" from "authenticated";

revoke truncate on table "public"."teachers" from "authenticated";

revoke update on table "public"."teachers" from "authenticated";

revoke delete on table "public"."teachers" from "service_role";

revoke insert on table "public"."teachers" from "service_role";

revoke references on table "public"."teachers" from "service_role";

revoke select on table "public"."teachers" from "service_role";

revoke trigger on table "public"."teachers" from "service_role";

revoke truncate on table "public"."teachers" from "service_role";

revoke update on table "public"."teachers" from "service_role";

drop function if exists "public"."register_student"(affiliation integer, clubs text[]);

alter table "public"."teachers" drop constraint "teachers_pkey";

drop index if exists "public"."teachers_pkey";

drop table "public"."teachers";

alter table "public"."users" drop column "name";


-- 既存の関数を削除（引数の構成が変わるため）
DROP FUNCTION IF EXISTS "public"."register_student"(text, integer, integer, integer, text, text[]);

-- InitialRegistration.tsx の呼び出しに合わせて新しい関数を定義
CREATE OR REPLACE FUNCTION "public"."register_student"(
  "affiliation" integer,
  "clubs" "text"[] DEFAULT NULL
)
RETURNS "void"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  INSERT INTO public.users (id, email, affiliation, role, clubs)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    "affiliation"::smallint,
    'student',
    "clubs"
  );
END;
$$;

-- 権限の設定
GRANT ALL ON FUNCTION "public"."register_student"(integer, "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."register_student"(integer, "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_student"(integer, "text"[]) TO "service_role";

