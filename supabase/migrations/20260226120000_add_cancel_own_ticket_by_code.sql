-- Add RPC to allow a logged-in user to cancel their own ticket by code
CREATE OR REPLACE FUNCTION public.cancel_own_ticket_by_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
declare
  v_id uuid;
  v_user uuid;
  v_status public.ticket_status;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'code is required';
  end if;

  select id, user_id, status
  into v_id, v_user, v_status
  from public.tickets
  where code = p_code
  limit 1
  for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  -- only the owner may cancel their ticket
  if v_user is null or v_user <> auth.uid() then
    raise exception 'only the ticket owner may cancel the ticket';
  end if;

  if v_status is distinct from 'valid' then
    raise exception 'only valid tickets can be cancelled';
  end if;

  update public.tickets
  set status = 'cancelled', updated_at = now()
  where id = v_id;

  return true;
end;
$$;

ALTER FUNCTION public.cancel_own_ticket_by_code(text) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.cancel_own_ticket_by_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_ticket_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_ticket_by_code(text) TO service_role;
