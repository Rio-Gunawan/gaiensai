alter table "public"."tickets" add column "updated_at" timestamp with time zone not null default now();


