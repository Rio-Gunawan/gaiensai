alter table "public"."ticket_issue_controls" drop constraint "ticket_issue_controls_same_day_mode_check";

alter table "public"."ticket_issue_controls" drop column "same_day_mode";

alter table "public"."ticket_issue_controls" add column "same_day_class_mode" text default 'open'::text;

alter table "public"."ticket_issue_controls" add column "same_day_gym_mode" text default 'open'::text;


