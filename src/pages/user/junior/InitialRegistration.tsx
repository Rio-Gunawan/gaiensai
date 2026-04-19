import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { supabase } from '../../../lib/supabase';
import styles from '../students/InitialRegistration.module.css';
import { useTitle } from '../../../hooks/useTitle';

type InitialRegistrationProps = {
  onRegistered: () => Promise<boolean>;
};

const InitialRegistration = ({ onRegistered }: InitialRegistrationProps) => {
  const [juniorUsageType, setJuniorUsageType] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useTitle('初回登録 - 中学生用ページ');

  const { route } = useLocation();

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const { error } = await supabase.rpc('register_junior', {
      junior_usage_type: juniorUsageType,
    });

    setLoading(false);

    if (error) {
      setErrorMessage('登録に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    const didRefreshProfile = await onRegistered();
    if (!didRefreshProfile) {
      setErrorMessage(
        '登録情報の反映確認に失敗しました。時間をおいて再度お試しください。',
      );
      return;
    }

    route('/junior/mypage');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <section className={styles.registrationContainer}>
      <h1>初回登録</h1>
      <p className={styles.description}>初回は利用形態の設定をお願いします。</p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div>
          <p className={styles.label}>利用形態</p>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type='radio'
                name='junior-usage-type'
                className={styles.checkbox}
                checked={juniorUsageType === 0}
                onChange={() => setJuniorUsageType(0)}
              />
              中学生と保護者(共通のチケット使用)
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type='radio'
                name='junior-usage-type'
                className={styles.checkbox}
                checked={juniorUsageType === 1}
                onChange={() => setJuniorUsageType(1)}
              />
              中学生と保護者(別々のチケット使用)
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type='radio'
                name='junior-usage-type'
                className={styles.checkbox}
                checked={juniorUsageType === 2}
                onChange={() => setJuniorUsageType(2)}
              />
              中学生のみ
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type='radio'
                name='junior-usage-type'
                className={styles.checkbox}
                checked={juniorUsageType === 3}
                onChange={() => setJuniorUsageType(3)}
              />
              保護者のみ
            </label>
          </div>
        </div>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        <button className={styles.submitButton} type='submit' disabled={loading}>
          {loading ? '登録中...' : '登録する'}
        </button>
      </form>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          ログアウト
        </button>
      </section>
    </section>
  );
};

export default InitialRegistration;
