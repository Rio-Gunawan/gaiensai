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

  select role
  into v_role
  from public.users
  where id = p_user_id
  limit 1
  for update;

  if not found or v_role <> 'student' then
    raise exception 'only students can issue tickets';
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

  if p_issue_count > v_max_tickets then
    raise exception 'issue count exceeds max_tickets_per_user';
  end if;

  select count(*)::int
  into v_existing_user_tickets
  from public.tickets
  where user_id = p_user_id
    and status = 'valid';

  if v_existing_user_tickets + p_issue_count > v_max_tickets then
    raise exception '1人当たりの招待券最大発行枚数を超えています。さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。';
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

ALTER FUNCTION public.issue_gym_tickets_with_codes(
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  integer,
  text[],
  text[]
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.issue_gym_tickets_with_codes(
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  integer,
  text[],
  text[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_gym_tickets_with_codes(
  uuid,
  smallint,
  smallint,
  smallint,
  smallint,
  integer,
  text[],
  text[]
) TO anon, authenticated, service_role;
