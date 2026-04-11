alter table "public"."ticket_code_counters" drop constraint "ticket_code_counters_last_value_check";

alter table "public"."ticket_code_counters" add constraint "ticket_code_counters_last_value_check" CHECK ((last_value >= 0)) not valid;

alter table "public"."ticket_code_counters" validate constraint "ticket_code_counters_last_value_check";

drop function if exists "public"."increment_ticket_code_counter"(p_prefix text, p_increment integer);

CREATE OR REPLACE FUNCTION "public"."increment_ticket_code_counter"("p_prefix" "text", "p_increment" integer, "p_max_value" integer) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_last_value bigint;
begin
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix is required';
  end if;

  if p_increment is null or p_increment <= 0 then
    raise exception 'increment must be positive';
  end if;

  -- 1. 行が存在しない場合は初期化（既存なら何もしない）
  insert into public.ticket_code_counters (prefix, last_value)
  values (p_prefix, 0)
  on conflict (prefix) do nothing;

  -- 2. 条件付きでアップデート
  -- WHERE句で「更新後の値がp_max_value以下であること」を保証する
  update public.ticket_code_counters
  set last_value = last_value + p_increment,
      updated_at = now()
  where prefix = p_prefix
    and last_value + p_increment < p_max_value
  returning last_value into v_last_value;

  -- 3. v_last_value が null ということは、WHERE条件に合致しなかった（＝p_max_valueを超えた）ということ
  if v_last_value is null then
    raise exception 'The maximum number of cards that can be issued (% cards) has been exceeded. (Current limit: %)', p_max_value, p_max_value;
  end if;

  return v_last_value;
end;$$;
