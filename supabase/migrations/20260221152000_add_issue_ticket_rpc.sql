create or replace function public.increment_ticket_code_counter(
  p_prefix text,
  p_increment integer
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last_value bigint;
begin
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix is required';
  end if;

  if p_increment is null or p_increment <= 0 then
    raise exception 'increment must be positive';
  end if;

  insert into public.ticket_code_counters (prefix, last_value)
  values (p_prefix, 0)
  on conflict (prefix) do nothing;

  update public.ticket_code_counters
  set last_value = last_value + p_increment,
      updated_at = now()
  where prefix = p_prefix
  returning last_value into v_last_value;

  return v_last_value;
end;
$$;

create or replace function public.issue_class_tickets_with_codes(
  p_user_id uuid,
  p_ticket_type_id smallint,
  p_relationship_id smallint,
  p_performance_id smallint,
  p_schedule_id smallint,
  p_issue_count integer,
  p_codes text[],
  p_signatures text[]
)
returns table(code text, signature text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_affiliation smallint;
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

  perform pg_advisory_xact_lock(p_performance_id::integer, p_schedule_id::integer);

  select affiliation, role
  into v_affiliation, v_role
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
    raise exception 'ticket limit exceeded';
  end if;

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
  from public.class_performances_schedule
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
      p_codes[ordinality] as code,
      p_signatures[ordinality] as signature
    from generate_subscripts(p_codes, 1) as ordinality
  ), inserted_tickets as (
    insert into public.tickets (
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
      input_rows.code,
      input_rows.signature,
      p_ticket_type_id,
      'valid'::public.ticket_status,
      p_user_id,
      p_relationship_id
    from input_rows
    returning id, code, signature
  ), inserted_class_tickets as (
    insert into public.class_tickets (id, class_id, round_id)
    select id, p_performance_id, p_schedule_id
    from inserted_tickets
    returning id
  )
  select inserted_tickets.code, inserted_tickets.signature
  from inserted_tickets
  order by inserted_tickets.code;
end;
$$;

grant execute on function public.increment_ticket_code_counter(text, integer) to service_role;
grant execute on function public.issue_class_tickets_with_codes(uuid, smallint, smallint, smallint, smallint, integer, text[], text[]) to service_role;
