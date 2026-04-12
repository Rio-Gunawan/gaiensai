
  create table "public"."healthcheck" (
    "id" bigint generated always as identity not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."healthcheck" enable row level security;

CREATE UNIQUE INDEX healthcheck_pkey ON public.healthcheck USING btree (id);

alter table "public"."healthcheck" add constraint "healthcheck_pkey" PRIMARY KEY using index "healthcheck_pkey";

grant delete on table "public"."healthcheck" to "anon";

grant insert on table "public"."healthcheck" to "anon";

grant references on table "public"."healthcheck" to "anon";

grant select on table "public"."healthcheck" to "anon";

grant trigger on table "public"."healthcheck" to "anon";

grant truncate on table "public"."healthcheck" to "anon";

grant update on table "public"."healthcheck" to "anon";

grant delete on table "public"."healthcheck" to "authenticated";

grant insert on table "public"."healthcheck" to "authenticated";

grant references on table "public"."healthcheck" to "authenticated";

grant select on table "public"."healthcheck" to "authenticated";

grant trigger on table "public"."healthcheck" to "authenticated";

grant truncate on table "public"."healthcheck" to "authenticated";

grant update on table "public"."healthcheck" to "authenticated";

grant delete on table "public"."healthcheck" to "service_role";

grant insert on table "public"."healthcheck" to "service_role";

grant references on table "public"."healthcheck" to "service_role";

grant select on table "public"."healthcheck" to "service_role";

grant trigger on table "public"."healthcheck" to "service_role";

grant truncate on table "public"."healthcheck" to "service_role";

grant update on table "public"."healthcheck" to "service_role";


  create policy "allow anon select healthcheck"
  on "public"."healthcheck"
  as permissive
  for select
  to anon
using (true);


  create policy "Enable insert for all users"
  on "public"."healthcheck"
  as permissive
  for insert
  to public
with check (true);
