import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { supabase } from '../../../lib/supabase';
import styles from '../students/InitialRegistration.module.css';
import { useTitle } from '../../../hooks/useTitle';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

type InitialRegistrationProps = {
  onRegistered: (commit?: boolean) => Promise<boolean>;
};

const JUNIOR_ENTRY_ONLY_TICKET_TYPE_ID = 7;
const SELF_RELATIONSHIP_ID = 1;
const ISSUE_POLL_MAX_RETRIES = 20;
const ISSUE_POLL_INTERVAL_MS = 300;

const InitialRegistration = ({ onRegistered }: InitialRegistrationProps) => {
  const [juniorUsageType, setJuniorUsageType] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [isIssuingTicket, setIsIssuingTicket] = useState(false);
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

    if (error) {
      setErrorMessage('登録に失敗しました。時間をおいて再度お試しください。');
      setLoading(false);
      return;
    }

    const didRefreshProfile = await onRegistered(false);
    if (!didRefreshProfile) {
      setErrorMessage(
        '登録情報の反映確認に失敗しました。時間をおいて再度お試しください。',
      );
      setLoading(false);
      return;
    }

    setIsIssuingTicket(true);

    const { error: issueError } = await supabase.functions.invoke('issue-tickets', {
      body: {
        ticketTypeId: JUNIOR_ENTRY_ONLY_TICKET_TYPE_ID,
        relationshipId: SELF_RELATIONSHIP_ID,
        performanceId: 0,
        scheduleId: 0,
        issueCount: 1,
      },
    });

    if (issueError) {
      setErrorMessage(
        '入場専用券の自動発券に失敗しました。時間をおいて再度お試しください。',
      );
      setIsIssuingTicket(false);
      setLoading(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (!userId) {
      setErrorMessage('認証情報の取得に失敗しました。再ログインしてください。');
      setIsIssuingTicket(false);
      setLoading(false);
      return;
    }

    let issued = false;
    for (let i = 0; i < ISSUE_POLL_MAX_RETRIES; i++) {
      const { count, error: ticketCheckError } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'valid')
        .eq('ticket_type', JUNIOR_ENTRY_ONLY_TICKET_TYPE_ID);

      if (!ticketCheckError && Number(count ?? 0) > 0) {
        issued = true;
        break;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, ISSUE_POLL_INTERVAL_MS);
      });
    }

    if (!issued) {
      setErrorMessage(
        '入場専用券の反映確認に時間がかかっています。時間をおいて再度お試しください。',
      );
      setIsIssuingTicket(false);
      setLoading(false);
      return;
    }

    const didCommitProfile = await onRegistered(true);
    if (!didCommitProfile) {
      setErrorMessage(
        '登録情報の最終反映に失敗しました。時間をおいて再度お試しください。',
      );
      setIsIssuingTicket(false);
      setLoading(false);
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
          {loading ? (isIssuingTicket ? '発券中...' : '登録中...') : '登録する'}
        </button>
      </form>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          ログアウト
        </button>
      </section>
      {loading ? (
        <div className={styles.loadingOverlay} role='status' aria-live='polite'>
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner />
            <p className={styles.loadingOverlayText}>
              {isIssuingTicket ? '入場専用券を発券中です...' : '登録処理中です...'}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default InitialRegistration;
