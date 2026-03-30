create table if not exists public.admin_auth_rate_limits (
  ip_address text primary key,
  failed_attempts integer not null default 0,
  last_failed_at timestamp with time zone,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint admin_auth_rate_limits_failed_attempts_check
    check (failed_attempts >= 0)
);

create index if not exists admin_auth_rate_limits_locked_until_idx
  on public.admin_auth_rate_limits (locked_until);

alter table public.admin_auth_rate_limits enable row level security;

revoke all on table public.admin_auth_rate_limits from anon;
revoke all on table public.admin_auth_rate_limits from authenticated;
grant all on table public.admin_auth_rate_limits to service_role;
