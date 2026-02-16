set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.register_student(student_name text, grade_no integer, class_no integer, student_no integer, teacher_name_input text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  correct_teacher_name text;
  normalized_input text;
  normalized_correct text;
begin
  -- 1. 担任名を取得
  select name into correct_teacher_name
  from teachers
  where grade = grade_no and "classId" = class_no;

  if correct_teacher_name is null then
    raise exception '担任情報が見つかりません';
  end if;

  -- 2. 名前を正規化して比較 (スペース削除、異体字対応など)
  normalized_input := replace(replace(replace(teacher_name_input, ' ', ''), '　', ''), '崎', '﨑');
  normalized_correct := replace(replace(replace(correct_teacher_name, ' ', ''), '　', ''), '崎', '﨑');

  if normalized_input != normalized_correct then
    raise exception '担任の先生の名前が一致しません';
  end if;

  -- 3. ユーザー登録
  insert into users (id, email, name, affiliation, role)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    student_name,
    (grade_no * 1000 + class_no * 100 + student_no),
    'student'
  );
end;
$function$
;


