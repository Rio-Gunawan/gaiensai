


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."rehearsal_type" AS ENUM (
    'official',
    'unofficial'
);


ALTER TYPE "public"."rehearsal_type" OWNER TO "postgres";


CREATE TYPE "public"."ticket_status" AS ENUM (
    'valid',
    'cancelled',
    'used'
);


ALTER TYPE "public"."ticket_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- 現在ログインしているユーザーのIDを取得し、auth.usersから削除
  delete from auth.users where id = auth.uid();
  delete from public.users where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_remaining_seats"("p_performance_id" smallint, "p_schedule_id" smallint) RETURNS TABLE("remaining_general" integer, "remaining_junior" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  total_cap int;
  junior_cap int;
  general_count int;
  junior_count int;
  is_released boolean;
begin
  select cp.total_capacity, cp.junior_capacity
  into total_cap, junior_cap
  from public.class_performances cp
  where cp.id = p_performance_id
  limit 1;

  if total_cap is null or junior_cap is null then
    return query select 0, 0;
    return;
  end if;

  select c.junior_release_open
  into is_released
  from public.configs c
  order by c.id asc
  limit 1;

  select
    count(*) filter (where t.ticket_type in (1, 3) and t.status = 'valid')::int,
    count(*) filter (where t.ticket_type = 2 and t.status = 'valid')::int
  into general_count, junior_count
  from public.class_tickets ct
  join public.tickets t on t.id = ct.id
  where ct.class_id = p_performance_id
    and ct.round_id = p_schedule_id;

  general_count := coalesce(general_count, 0);
  junior_count := coalesce(junior_count, 0);
  is_released := coalesce(is_released, false);

  if is_released then
    return query
    select
      greatest(total_cap - general_count - junior_count, 0),
      0;
  else
    return query
    select
      greatest((total_cap - junior_cap) - general_count, 0),
      greatest(junior_cap - junior_count, 0);
  end if;
end;
$$;


ALTER FUNCTION "public"."get_remaining_seats"("p_performance_id" smallint, "p_schedule_id" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_by_email"("user_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$  
BEGIN  
  RETURN (SELECT id  
          FROM auth.users  
          WHERE email = user_email  
          LIMIT 1);  
END;  
$$;


ALTER FUNCTION "public"."get_user_by_email"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_last_value bigint;
begin
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix is required';
  end if;

  if p_increment is null or p_increment <= 0 then
    raise exception 'increment must be positive';
  end if;

  -- 1. 行が存在しない場合は初期化（既存なら何もしない）
  insert into public.ticket_code_counters (prefix, last_value)
  values (p_prefix, 0)
  on conflict (prefix) do nothing;

  -- 2. 条件付きでアップデート
  -- WHERE句で「更新後の値が15以下であること」を保証する
  update public.ticket_code_counters
  set last_value = last_value + p_increment,
      updated_at = now()
  where prefix = p_prefix
    and last_value + p_increment <= 15
  returning last_value into v_last_value;

  -- 3. v_last_value が null ということは、WHERE条件に合致しなかった（＝15を超えた）ということ
  if v_last_value is null then
    raise exception 'The maximum number of cards that can be issued (15 cards) has been exceeded. (Current limit: 15)';
  end if;

  return v_last_value;
end;$$;


ALTER FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_class_tickets_with_codes"("p_user_id" "uuid", "p_ticket_type_id" smallint, "p_relationship_id" smallint, "p_performance_id" smallint, "p_schedule_id" smallint, "p_issue_count" integer, "p_codes" "text"[], "p_signatures" "text"[]) RETURNS TABLE("code" "text", "signature" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_role text;
  v_max_tickets smallint;
  v_junior_release_open boolean;
  v_existing_user_tickets integer;
  v_total_capacity smallint;
  v_junior_capacity smallint;
  v_general_count integer;
  v_junior_count integer;
  v_remaining_general integer;
  v_remaining_junior integer;
  v_required_remaining integer;
begin
  if p_user_id is null then
    raise exception 'user is required';
  end if;

  if p_issue_count is null or p_issue_count <= 0 then
    raise exception 'issue_count must be positive';
  end if;

  if p_codes is null or p_signatures is null then
    raise exception 'codes/signatures are required';
  end if;

  if array_length(p_codes, 1) is distinct from p_issue_count
     or array_length(p_signatures, 1) is distinct from p_issue_count then
    raise exception 'codes/signatures length mismatch';
  end if;

  select role
  into v_role
  from public.users
  where id = p_user_id
  limit 1
  for update;

  if not found or v_role <> 'student' then
    raise exception 'only students can issue tickets';
  end if;

  select max_tickets_per_user, junior_release_open
  into v_max_tickets, v_junior_release_open
  from public.configs
  order by id asc
  limit 1
  for update;

  if v_max_tickets is null then
    raise exception 'config not found';
  end if;

  if p_issue_count > v_max_tickets then
    raise exception 'issue count exceeds max_tickets_per_user';
  end if;

  select count(*)::int
  into v_existing_user_tickets
  from public.tickets
  where user_id = p_user_id
    and status = 'valid';

  if v_existing_user_tickets + p_issue_count > v_max_tickets then
    raise exception '1人当たりの招待券最大発行枚数を超えています。さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。';
  end if;

  if p_ticket_type_id = 4 then
    return query
    with input_rows as (
      select
        ordinality,
        p_codes[ordinality] as input_code,
        p_signatures[ordinality] as input_signature
      from generate_subscripts(p_codes, 1) as ordinality
    ), inserted_tickets as (
      insert into public.tickets as t (
        id,
        code,
        signature,
        ticket_type,
        status,
        user_id,
        relationship
      )
      select
        gen_random_uuid(),
        input_rows.input_code,
        input_rows.input_signature,
        p_ticket_type_id,
        'valid'::public.ticket_status,
        p_user_id,
        p_relationship_id
      from input_rows
      returning t.code as ticket_code, t.signature as ticket_signature
    )
    select inserted_tickets.ticket_code as code, inserted_tickets.ticket_signature as signature
    from inserted_tickets
    order by inserted_tickets.ticket_code;

    return;
  end if;

  if p_performance_id <= 0 or p_schedule_id <= 0 then
    raise exception 'performance/schedule must be positive for this ticket type';
  end if;

  perform pg_advisory_xact_lock(p_performance_id::integer, p_schedule_id::integer);

  select total_capacity, junior_capacity
  into v_total_capacity, v_junior_capacity
  from public.class_performances
  where id = p_performance_id
  limit 1
  for update;

  if not found then
    raise exception 'performance not found';
  end if;

  perform 1
  from public.performances_schedule
  where id = p_schedule_id
    and is_active = true
  limit 1
  for update;

  if not found then
    raise exception 'schedule not found';
  end if;

  select
    count(*) filter (where t.ticket_type in (1, 3) and t.status = 'valid')::int,
    count(*) filter (where t.ticket_type = 2 and t.status = 'valid')::int
  into v_general_count, v_junior_count
  from public.class_tickets ct
  join public.tickets t on t.id = ct.id
  where ct.class_id = p_performance_id
    and ct.round_id = p_schedule_id;

  if v_junior_release_open then
    v_remaining_general := v_total_capacity - v_general_count - v_junior_count;
    v_remaining_junior := 0;
  else
    v_remaining_general := v_total_capacity - v_junior_capacity - v_general_count;
    v_remaining_junior := v_junior_capacity - v_junior_count;
  end if;

  if p_ticket_type_id = 2 then
    v_required_remaining := v_remaining_junior;
  else
    v_required_remaining := v_remaining_general;
  end if;

  if v_required_remaining < p_issue_count then
    raise exception 'not enough remaining seats';
  end if;

  return query
  with input_rows as (
    select
      ordinality,
      p_codes[ordinality] as input_code,
      p_signatures[ordinality] as input_signature
    from generate_subscripts(p_codes, 1) as ordinality
  ), inserted_tickets as (
    insert into public.tickets as t (
      id,
      code,
      signature,
      ticket_type,
      status,
      user_id,
      relationship
    )
    select
      gen_random_uuid(),
      input_rows.input_code,
      input_rows.input_signature,
      p_ticket_type_id,
      'valid'::public.ticket_status,
      p_user_id,
      p_relationship_id
    from input_rows
    returning t.id as ticket_id, t.code as ticket_code, t.signature as ticket_signature
  ), inserted_class_tickets as (
    insert into public.class_tickets (id, class_id, round_id)
    select inserted_tickets.ticket_id, p_performance_id, p_schedule_id
    from inserted_tickets
    returning id
  )
  select inserted_tickets.ticket_code as code, inserted_tickets.ticket_signature as signature
  from inserted_tickets
  order by inserted_tickets.ticket_code;
end;$$;


ALTER FUNCTION "public"."issue_class_tickets_with_codes"("p_user_id" "uuid", "p_ticket_type_id" smallint, "p_relationship_id" smallint, "p_performance_id" smallint, "p_schedule_id" smallint, "p_issue_count" integer, "p_codes" "text"[], "p_signatures" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_student"("student_name" "text", "grade_no" integer, "class_no" integer, "student_no" integer, "teacher_name_input" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  correct_teacher_name text;
  normalized_input text;
  normalized_correct text;
begin
  -- 1. 担任名を取得
  select name into correct_teacher_name
  from teachers
  where grade = grade_no and "class_id" = class_no;

  if correct_teacher_name is null then
    raise exception '担任情報が見つかりません';
  end if;

  -- 2. 名前を正規化して比較 (スペース削除、異体字対応など)
  normalized_input := replace(replace(replace(teacher_name_input, ' ', ''), '　', ''), '崎', '﨑');
  normalized_correct := replace(replace(replace(correct_teacher_name, ' ', ''), '　', ''), '崎', '﨑');

  if normalized_input != normalized_correct then
    raise exception '担任の先生の名前が一致しません';
  end if;

  -- 3. ユーザー登録
  insert into users (id, email, name, affiliation, role)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    student_name,
    (grade_no * 1000 + class_no * 100 + student_no),
    'student'
  );
end;$$;


ALTER FUNCTION "public"."register_student"("student_name" "text", "grade_no" integer, "class_no" integer, "student_no" integer, "teacher_name_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."class_performances" (
    "year" smallint,
    "class_name" "text",
    "title" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "junior_capacity" smallint DEFAULT '10'::smallint,
    "total_capacity" smallint DEFAULT '50'::smallint,
    "id" smallint NOT NULL
);


ALTER TABLE "public"."class_performances" OWNER TO "postgres";


ALTER TABLE "public"."class_performances" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."class_performances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."class_tickets" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" smallint NOT NULL,
    "round_id" smallint NOT NULL
);


ALTER TABLE "public"."class_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configs" (
    "id" integer DEFAULT 1 NOT NULL,
    "event_year" integer DEFAULT 2025 NOT NULL,
    "name" "text" DEFAULT '外苑祭'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "admin_password" "text" DEFAULT 'admin123'::"text" NOT NULL,
    "show_length" smallint DEFAULT '60'::smallint NOT NULL,
    "junior_release_open" boolean DEFAULT false NOT NULL,
    "max_tickets_per_user" smallint DEFAULT '20'::smallint NOT NULL,
    CONSTRAINT "single_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performances_schedule" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "id" smallint NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "round_name" "text" NOT NULL
);


ALTER TABLE "public"."performances_schedule" OWNER TO "postgres";


ALTER TABLE "public"."performances_schedule" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."performances_schedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rehearsals" (
    "id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" smallint NOT NULL,
    "round_id" smallint,
    "round_name" "text" NOT NULL,
    "start_time" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "type" "public"."rehearsal_type" DEFAULT 'official'::"public"."rehearsal_type" NOT NULL
);


ALTER TABLE "public"."rehearsals" OWNER TO "postgres";


ALTER TABLE "public"."rehearsals" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."rehearsals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."relationships" (
    "id" smallint NOT NULL,
    "name" "text",
    "is_accepting" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."relationships" OWNER TO "postgres";


ALTER TABLE "public"."relationships" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."relationships_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" bigint NOT NULL,
    "grade" smallint NOT NULL,
    "name" "text" NOT NULL,
    "class_id" smallint
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


ALTER TABLE "public"."teachers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."teachers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_code_counters" (
    "prefix" "text" NOT NULL,
    "last_value" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_code_counters_last_value_check" CHECK ((("last_value" >= 0) AND ("last_value" <= 15)))
);


ALTER TABLE "public"."ticket_code_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_types" (
    "id" smallint NOT NULL,
    "name" "text",
    "type" "text",
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."ticket_types" OWNER TO "postgres";


ALTER TABLE "public"."ticket_types" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ticket_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "ticket_type" smallint NOT NULL,
    "status" "public"."ticket_status" DEFAULT 'valid'::"public"."ticket_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "relationship" smallint NOT NULL,
    "signature" "text" NOT NULL
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" NOT NULL,
    "affiliation" smallint NOT NULL,
    "role" "text",
    "name" "text" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."relationships"
    ADD CONSTRAINT "Relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_tickets"
    ADD CONSTRAINT "class_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configs"
    ADD CONSTRAINT "configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_performances"
    ADD CONSTRAINT "performances_class_name_key" UNIQUE ("class_name");



ALTER TABLE ONLY "public"."class_performances"
    ADD CONSTRAINT "performances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performances_schedule"
    ADD CONSTRAINT "performances_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rehearsals"
    ADD CONSTRAINT "rehearsals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_code_counters"
    ADD CONSTRAINT "ticket_code_counters_pkey" PRIMARY KEY ("prefix");



ALTER TABLE ONLY "public"."ticket_types"
    ADD CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_affiliation_key" UNIQUE ("affiliation");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "class_tickets_class_id_idx" ON "public"."class_tickets" USING "btree" ("class_id");



CREATE INDEX "class_tickets_round_id_idx" ON "public"."class_tickets" USING "btree" ("round_id");



CREATE INDEX "rehearsals_class_id_idx" ON "public"."rehearsals" USING "btree" ("class_id");



CREATE INDEX "tickets_relationship_idx" ON "public"."tickets" USING "btree" ("relationship");



CREATE INDEX "tickets_ticket_type_idx" ON "public"."tickets" USING "btree" ("ticket_type");



CREATE INDEX "tickets_user_id_idx" ON "public"."tickets" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."class_tickets"
    ADD CONSTRAINT "class_tickets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."class_performances"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_tickets"
    ADD CONSTRAINT "class_tickets_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."tickets"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_tickets"
    ADD CONSTRAINT "class_tickets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."performances_schedule"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rehearsals"
    ADD CONSTRAINT "rehearsals_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."class_performances"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_relationship_fkey" FOREIGN KEY ("relationship") REFERENCES "public"."relationships"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_type_fkey" FOREIGN KEY ("ticket_type") REFERENCES "public"."ticket_types"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Enable read access for all users" ON "public"."class_performances" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."class_tickets" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."configs" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."performances_schedule" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."rehearsals" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."relationships" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."ticket_code_counters" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."ticket_types" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."tickets" FOR SELECT USING (true);



CREATE POLICY "Enable users to view their own data only" ON "public"."users" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Policy with table joins" ON "public"."teachers" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."role" = 'admin'::"text"))));



ALTER TABLE "public"."class_performances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performances_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rehearsals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_code_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_remaining_seats"("p_performance_id" smallint, "p_schedule_id" smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_remaining_seats"("p_performance_id" smallint, "p_schedule_id" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_remaining_seats"("p_performance_id" smallint, "p_schedule_id" smallint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_by_email"("user_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."issue_class_tickets_with_codes"("p_user_id" "uuid", "p_ticket_type_id" smallint, "p_relationship_id" smallint, "p_performance_id" smallint, "p_schedule_id" smallint, "p_issue_count" integer, "p_codes" "text"[], "p_signatures" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."issue_class_tickets_with_codes"("p_user_id" "uuid", "p_ticket_type_id" smallint, "p_relationship_id" smallint, "p_performance_id" smallint, "p_schedule_id" smallint, "p_issue_count" integer, "p_codes" "text"[], "p_signatures" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_class_tickets_with_codes"("p_user_id" "uuid", "p_ticket_type_id" smallint, "p_relationship_id" smallint, "p_performance_id" smallint, "p_schedule_id" smallint, "p_issue_count" integer, "p_codes" "text"[], "p_signatures" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."register_student"("student_name" "text", "grade_no" integer, "class_no" integer, "student_no" integer, "teacher_name_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_student"("student_name" "text", "grade_no" integer, "class_no" integer, "student_no" integer, "teacher_name_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_student"("student_name" "text", "grade_no" integer, "class_no" integer, "student_no" integer, "teacher_name_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
























GRANT ALL ON TABLE "public"."class_performances" TO "anon";
GRANT ALL ON TABLE "public"."class_performances" TO "authenticated";
GRANT ALL ON TABLE "public"."class_performances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."class_performances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."class_performances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."class_performances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."class_tickets" TO "anon";
GRANT ALL ON TABLE "public"."class_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."class_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."configs" TO "anon";
GRANT ALL ON TABLE "public"."configs" TO "authenticated";
GRANT ALL ON TABLE "public"."configs" TO "service_role";



GRANT ALL ON TABLE "public"."performances_schedule" TO "anon";
GRANT ALL ON TABLE "public"."performances_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."performances_schedule" TO "service_role";



GRANT ALL ON SEQUENCE "public"."performances_schedule_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."performances_schedule_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."performances_schedule_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rehearsals" TO "anon";
GRANT ALL ON TABLE "public"."rehearsals" TO "authenticated";
GRANT ALL ON TABLE "public"."rehearsals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rehearsals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rehearsals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rehearsals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."relationships" TO "anon";
GRANT ALL ON TABLE "public"."relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."relationships" TO "service_role";



GRANT ALL ON SEQUENCE "public"."relationships_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."relationships_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."relationships_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."teachers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."teachers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."teachers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_code_counters" TO "anon";
GRANT ALL ON TABLE "public"."ticket_code_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_code_counters" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_types" TO "anon";
GRANT ALL ON TABLE "public"."ticket_types" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ticket_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ticket_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ticket_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


