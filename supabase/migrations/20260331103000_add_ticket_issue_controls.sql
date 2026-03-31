create table if not exists public.ticket_issue_controls (
  id smallint primary key default 1 check (id = 1),
  class_invite_mode text not null default 'open' check (class_invite_mode in ('open', 'only-own', 'public-rehearsals', 'auto', 'off')),
  rehearsal_invite_mode text not null default 'open' check (rehearsal_invite_mode in ('open', 'only-own', 'public-rehearsals', 'auto', 'off')),
  gym_invite_mode text not null default 'open' check (gym_invite_mode in ('open', 'only-own', 'public-rehearsals', 'auto', 'off')),
  entry_only_mode text not null default 'open' check (entry_only_mode in ('open', 'only-own', 'public-rehearsals', 'auto', 'off')),
  same_day_mode text not null default 'open' check (same_day_mode in ('open', 'only-own', 'public-rehearsals', 'auto', 'off')),
  updated_at timestamptz not null default now()
);

insert into public.ticket_issue_controls (
  id,
  class_invite_mode,
  rehearsal_invite_mode,
  gym_invite_mode,
  entry_only_mode,
  same_day_mode
)
values (1, 'open', 'open', 'open', 'open', 'open')
on conflict (id) do nothing;

grant all on table public.ticket_issue_controls to service_role;
