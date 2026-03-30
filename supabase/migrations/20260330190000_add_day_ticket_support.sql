INSERT INTO public.users (id, email, name, affiliation, role)
VALUES (
  '00000000-0000-0000-0000-00000000d001'::uuid,
  'day-ticket-guest@gaiensai.local',
  '当日券ゲスト',
  0,
  'guest'
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  affiliation = EXCLUDED.affiliation,
  role = EXCLUDED.role;

CREATE OR REPLACE FUNCTION public.get_remaining_seats(
  p_performance_id smallint,
  p_schedule_id smallint
)
RETURNS TABLE(remaining_general integer, remaining_junior integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
    count(*) filter (where t.ticket_type in (1, 3, 8) and t.status = 'valid')::int,
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

CREATE OR REPLACE FUNCTION public.issue_class_tickets_with_codes(
  p_user_id uuid,
  p_ticket_type_id smallint,
  p_relationship_id smallint,
  p_performance_id smallint,
  p_schedule_id smallint,
  p_issue_count integer,
  p_codes text[],
  p_signatures text[]
)
RETURNS TABLE(code text, signature text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_role text;
  v_max_tickets smallint;
  v_junior_release_open boolean;
  v_existing_user_tickets integer;
  v_total_capacity smallint;
  v_junior_capacity smallint;
  v_general_count integer;
  v_junior_count integer;
  v_total_issued_count integer;
  v_remaining_general integer;
  v_remaining_junior integer;
  v_required_remaining integer;
  v_is_day_ticket boolean;
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

  v_is_day_ticket := p_ticket_type_id in (8, 9);

  if not v_is_day_ticket then
    select role
    into v_role
    from public.users
    where id = p_user_id
    limit 1
    for update;

    if not found or v_role <> 'student' then
      raise exception 'only students can issue tickets';
    end if;
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

  if not v_is_day_ticket and p_issue_count > v_max_tickets then
    raise exception 'issue count exceeds max_tickets_per_user';
  end if;

  if not v_is_day_ticket then
    select count(*)::int
    into v_existing_user_tickets
    from public.tickets
    where user_id = p_user_id
      and status = 'valid';

    if v_existing_user_tickets + p_issue_count > v_max_tickets then
      raise exception '1人当たりの招待券最大発行枚数を超えています。さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。';
    end if;
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
    count(*) filter (where t.ticket_type in (1, 3, 8) and t.status = 'valid')::int,
    count(*) filter (where t.ticket_type = 2 and t.status = 'valid')::int,
    count(*) filter (where t.status = 'valid')::int
  into v_general_count, v_junior_count, v_total_issued_count
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

  if p_ticket_type_id = 8 then
    v_required_remaining := v_total_capacity - coalesce(v_total_issued_count, 0);
  elsif p_ticket_type_id = 2 then
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
end;
$$;

CREATE OR REPLACE FUNCTION public.issue_gym_tickets_with_codes(
  p_user_id uuid,
  p_ticket_type_id smallint,
  p_relationship_id smallint,
  p_performance_id smallint,
  p_schedule_id smallint,
  p_issue_count integer,
  p_codes text[],
  p_signatures text[]
)
RETURNS TABLE(code text, signature text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_role text;
  v_max_tickets smallint;
  v_existing_user_tickets integer;
  v_capacity smallint;
  v_issued_count integer;
  v_remaining integer;
  v_is_day_ticket boolean;
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

  if p_performance_id <= 0 or p_schedule_id <> 0 then
    raise exception 'gym tickets require performance_id > 0 and schedule_id = 0';
  end if;

  v_is_day_ticket := p_ticket_type_id in (8, 9);

  if not v_is_day_ticket then
    select role
    into v_role
    from public.users
    where id = p_user_id
    limit 1
    for update;

    if not found or v_role <> 'student' then
      raise exception 'only students can issue tickets';
    end if;
  end if;

  select max_tickets_per_user
  into v_max_tickets
  from public.configs
  order by id asc
  limit 1
  for update;

  if v_max_tickets is null then
    raise exception 'config not found';
  end if;

  if not v_is_day_ticket and p_issue_count > v_max_tickets then
    raise exception 'issue count exceeds max_tickets_per_user';
  end if;

  if not v_is_day_ticket then
    select count(*)::int
    into v_existing_user_tickets
    from public.tickets
    where user_id = p_user_id
      and status = 'valid';

    if v_existing_user_tickets + p_issue_count > v_max_tickets then
      raise exception '1人当たりの招待券最大発行枚数を超えています。さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。';
    end if;
  end if;

  perform pg_advisory_xact_lock(p_performance_id::integer, 0);

  select capacity
  into v_capacity
  from public.gym_performances
  where id = p_performance_id
  limit 1
  for update;

  if not found then
    raise exception 'gym performance not found';
  end if;

  select count(*)::int
  into v_issued_count
  from public.gym_tickets gt
  join public.tickets t on t.id = gt.id
  where gt.performance_id = p_performance_id
    and t.status = 'valid';

  v_remaining := v_capacity - v_issued_count;

  if v_remaining < p_issue_count then
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
  ), inserted_gym_tickets as (
    insert into public.gym_tickets (id, performance_id)
    select inserted_tickets.ticket_id, p_performance_id
    from inserted_tickets
    returning id
  )
  select inserted_tickets.ticket_code as code, inserted_tickets.ticket_signature as signature
  from inserted_tickets
  order by inserted_tickets.ticket_code;
end;
$$;
