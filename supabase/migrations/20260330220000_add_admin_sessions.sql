create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamp with time zone not null default now(),
  last_used_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  constraint admin_sessions_expires_after_created check (expires_at > created_at)
);

create index if not exists admin_sessions_expires_at_idx
  on public.admin_sessions (expires_at);

create index if not exists admin_sessions_revoked_at_idx
  on public.admin_sessions (revoked_at);

alter table public.admin_sessions enable row level security;

revoke all on table public.admin_sessions from anon;
revoke all on table public.admin_sessions from authenticated;
grant all on table public.admin_sessions to service_role;
