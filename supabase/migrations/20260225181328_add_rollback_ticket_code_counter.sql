CREATE OR REPLACE FUNCTION "public"."rollback_ticket_code_counter"(
  "p_prefix" "text",
  "p_decrement" integer,
  "p_expected_last_value" bigint
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_applied boolean;
begin
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix is required';
  end if;

  if p_decrement is null or p_decrement <= 0 then
    raise exception 'decrement must be positive';
  end if;

  if p_expected_last_value is null or p_expected_last_value < 0 then
    raise exception 'expected_last_value must be non-negative';
  end if;

  -- 巻き戻しは「このリクエストが更新した直後の値」のときだけ適用する。
  -- 他トランザクションで値が進んでいる場合は false を返し、カウンタを壊さない。
  update public.ticket_code_counters
  set
    last_value = last_value - p_decrement,
    updated_at = now()
  where prefix = p_prefix
    and last_value = p_expected_last_value
    and last_value - p_decrement >= 0
  returning true into v_applied;

  return coalesce(v_applied, false);
end;
$$;


ALTER FUNCTION "public"."rollback_ticket_code_counter"(
  "p_prefix" "text",
  "p_decrement" integer,
  "p_expected_last_value" bigint
) OWNER TO "postgres";


GRANT ALL ON FUNCTION "public"."rollback_ticket_code_counter"(
  "p_prefix" "text",
  "p_decrement" integer,
  "p_expected_last_value" bigint
) TO "anon";
GRANT ALL ON FUNCTION "public"."rollback_ticket_code_counter"(
  "p_prefix" "text",
  "p_decrement" integer,
  "p_expected_last_value" bigint
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollback_ticket_code_counter"(
  "p_prefix" "text",
  "p_decrement" integer,
  "p_expected_last_value" bigint
) TO "service_role";
