drop policy "Enable insert for all users" on "public"."healthcheck";

drop policy "allow anon select healthcheck" on "public"."healthcheck";

revoke delete on table "public"."healthcheck" from "anon";

revoke insert on table "public"."healthcheck" from "anon";

revoke references on table "public"."healthcheck" from "anon";

revoke select on table "public"."healthcheck" from "anon";

revoke trigger on table "public"."healthcheck" from "anon";

revoke truncate on table "public"."healthcheck" from "anon";

revoke update on table "public"."healthcheck" from "anon";

revoke delete on table "public"."healthcheck" from "authenticated";

revoke insert on table "public"."healthcheck" from "authenticated";

revoke references on table "public"."healthcheck" from "authenticated";

revoke select on table "public"."healthcheck" from "authenticated";

revoke trigger on table "public"."healthcheck" from "authenticated";

revoke truncate on table "public"."healthcheck" from "authenticated";

revoke update on table "public"."healthcheck" from "authenticated";

revoke delete on table "public"."healthcheck" from "service_role";

revoke insert on table "public"."healthcheck" from "service_role";

revoke references on table "public"."healthcheck" from "service_role";

revoke select on table "public"."healthcheck" from "service_role";

revoke trigger on table "public"."healthcheck" from "service_role";

revoke truncate on table "public"."healthcheck" from "service_role";

revoke update on table "public"."healthcheck" from "service_role";

alter table "public"."healthcheck" drop constraint "healthcheck_pkey";

drop index if exists "public"."healthcheck_pkey";

drop table "public"."healthcheck";


  create table "public"."keep_alive" (
    "id" integer not null,
    "last_ping" timestamp with time zone not null default now()
      );


alter table "public"."keep_alive" enable row level security;

CREATE UNIQUE INDEX keep_alive_pkey ON public.keep_alive USING btree (id);

alter table "public"."keep_alive" add constraint "keep_alive_pkey" PRIMARY KEY using index "keep_alive_pkey";

grant delete on table "public"."keep_alive" to "anon";

grant insert on table "public"."keep_alive" to "anon";

grant references on table "public"."keep_alive" to "anon";

grant select on table "public"."keep_alive" to "anon";

grant trigger on table "public"."keep_alive" to "anon";

grant truncate on table "public"."keep_alive" to "anon";

grant update on table "public"."keep_alive" to "anon";

grant delete on table "public"."keep_alive" to "authenticated";

grant insert on table "public"."keep_alive" to "authenticated";

grant references on table "public"."keep_alive" to "authenticated";

grant select on table "public"."keep_alive" to "authenticated";

grant trigger on table "public"."keep_alive" to "authenticated";

grant truncate on table "public"."keep_alive" to "authenticated";

grant update on table "public"."keep_alive" to "authenticated";

grant delete on table "public"."keep_alive" to "service_role";

grant insert on table "public"."keep_alive" to "service_role";

grant references on table "public"."keep_alive" to "service_role";

grant select on table "public"."keep_alive" to "service_role";

grant trigger on table "public"."keep_alive" to "service_role";

grant truncate on table "public"."keep_alive" to "service_role";

grant update on table "public"."keep_alive" to "service_role";


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



