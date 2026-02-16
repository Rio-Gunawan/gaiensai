import { useEffect, useState } from 'preact/hooks';
import { navigate } from 'wouter-preact/use-browser-location';
import { supabase } from '../../../lib/supabase';
import styles from './InitialRegistration.module.css';
import type { Session } from '../../../types/types';
import Modal from '../../../components/ui/Modal';

const InitialRegistration = () => {
  const [session, setSession] = useState<Session>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [number, setNumber] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkSessionAndRegistration = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/students/login');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        setErrorMessage(
          'ユーザー情報の確認に失敗しました。時間をおいて再度お試しください。',
        );
        return;
      }

      if (data) {
        navigate('/students/dashboard');
        return;
      }

      setSession(session);
    };

    void checkSessionAndRegistration();
  }, []);

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!session) {
      setErrorMessage(
        'ログイン情報の取得に失敗しました。再ログインしてください。',
      );
      return;
    }

    const parsedGrade = Number(grade);
    const parsedClass = Number(studentClass);
    const parsedNumber = Number(number);

    if (!Number.isInteger(parsedGrade) || parsedGrade < 1 || parsedGrade > 3) {
      setErrorMessage('学年は 1〜3 の整数で入力してください。');
      return;
    }

    if (!Number.isInteger(parsedClass) || parsedClass < 1 || parsedClass > 20) {
      setErrorMessage('クラスは 1〜7 の整数で入力してください。');
      return;
    }

    if (
      !Number.isInteger(parsedNumber) ||
      parsedNumber < 1 ||
      parsedNumber > 60
    ) {
      setErrorMessage('番号は 1〜42 の整数で入力してください。');
      return;
    }

    if (!teacherName.trim()) {
      setErrorMessage('担任の先生の名前を入力してください。');
      return;
    }

    setLoading(true);

    // サーバーサイド関数 (RPC) を呼び出して登録
    // 担任名の照合とユーザー登録をトランザクション内で安全に実行します
    const { error } = await supabase.rpc('register_student', {
      student_name: name.trim(),
      grade_no: parsedGrade,
      class_no: parsedClass,
      student_no: parsedNumber,
      teacher_name_input: teacherName,
    });

    setLoading(false);

    if (error) {
      // RPC内で発生したエラーメッセージを表示
      if (
        error.message.includes('担任') ||
        error.message.includes('一致しません')
      ) {
        setErrorMessage(
          '担任の先生の名前が一致しません。学年・クラス・担任名をご確認ください。',
        );
        return;
      }

      if (error.code === '23505') {
        setErrorMessage(
          '同じ学年・クラス・番号のユーザーが既に登録されています。入力内容が正しい場合は、お手数ですが、外苑祭総務へお問い合わせください。',
        );
        return;
      }

      setErrorMessage('登録に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    navigate('/students/dashboard');
  };

  const handleDeleteAccount = async () => {
    // SQLで作成した 'delete_user' 関数を呼び出す
    const { error } = await supabase.rpc('delete_user');
    setIsDeleteModalOpen(false);

    if (error) {
      alert('エラーが発生しました。');
    } else {
      // 削除成功後、ログアウト処理を行いトップページなどへ遷移
      await supabase.auth.signOut();
      alert('アカウントを削除しました。');
      window.location.href = '/';
    }
  };

  if (!session) {
    return null;
  }

  return (
    <section className={styles.registrationContainer}>
      <h1>初回登録</h1>
      <p className={styles.description}>
        初回は、氏名と所属情報の入力が必要です。
      </p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor='name'>
          氏名
          <input
            id='name'
            className={styles.input}
            type='text'
            value={name}
            placeholder='例: 青山太郎'
            required={true}
            autoComplete='name'
            maxLength={50}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>学年・クラス・番号</legend>
          <label className={styles.label} htmlFor='grade'>
            <input
              id='grade'
              className={styles.input}
              type='number'
              min='1'
              max='3'
              required={true}
              value={grade}
              onChange={(e) => setGrade(e.currentTarget.value)}
            />
            年
          </label>
          <label className={styles.label} htmlFor='student-class'>
            <input
              id='student-class'
              className={styles.input}
              type='number'
              min='1'
              max='7'
              required={true}
              value={studentClass}
              onChange={(e) => setStudentClass(e.currentTarget.value)}
            />
            組
          </label>
          <label className={styles.label} htmlFor='number'>
            <input
              id='number'
              className={styles.input}
              type='number'
              min='1'
              max='42'
              required={true}
              value={number}
              onChange={(e) => setNumber(e.currentTarget.value)}
            />
            番
          </label>
        </fieldset>
        <p className={styles.info}>
          青高生であることの確認のため、担任の先生の名前の入力をお願いします。
        </p>
        <label className={styles.label} htmlFor='teacher-name'>
          担任の先生の名前(フルネーム・漢字)
          <input
            id='teacher-name'
            className={styles.input}
            type='text'
            value={teacherName}
            placeholder='例: 青山花子'
            required={true}
            maxLength={50}
            onChange={(e) => setTeacherName(e.currentTarget.value)}
          />
        </label>
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        <button
          className={styles.submitButton}
          type='submit'
          disabled={loading}
        >
          {loading ? '登録中...' : '登録する'}
        </button>
        <button
          type='button'
          onClick={() => setIsDeleteModalOpen(true)}
          className={styles.deleteButton}
        >
          アカウントを削除
        </button>
      </form>

      {isDeleteModalOpen ? (
        <Modal
          setIsOpen={setIsDeleteModalOpen}
          handleAction={handleDeleteAccount}
          headingText='アカウントを本当に削除しますか?'
          buttonText='削除'
        >
          <p>この操作は取り消せません。</p>
        </Modal>
      ) : null}
    </section>
  );
};

export default InitialRegistration;
