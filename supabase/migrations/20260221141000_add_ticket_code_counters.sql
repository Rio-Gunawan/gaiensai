create table if not exists "public"."ticket_code_counters" (
  "prefix" text not null,
  "last_value" bigint not null default 0,
  "updated_at" timestamp with time zone not null default now(),
  constraint "ticket_code_counters_pkey" primary key ("prefix")
);

alter table "public"."ticket_code_counters" enable row level security;

grant delete on table "public"."ticket_code_counters" to "service_role";
grant insert on table "public"."ticket_code_counters" to "service_role";
grant references on table "public"."ticket_code_counters" to "service_role";
grant select on table "public"."ticket_code_counters" to "service_role";
grant trigger on table "public"."ticket_code_counters" to "service_role";
grant truncate on table "public"."ticket_code_counters" to "service_role";
grant update on table "public"."ticket_code_counters" to "service_role";
