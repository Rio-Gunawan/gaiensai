create or replace function public.get_remaining_seats(
  p_performance_id smallint,
  p_schedule_id smallint
)
returns table(remaining_general integer, remaining_junior integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
    count(*) filter (where t.ticket_type in (1, 3) and t.status = 'valid')::int,
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
