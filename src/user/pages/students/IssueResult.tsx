import { useEffect, useState } from 'preact/hooks';
import { MdArrowBack } from 'react-icons/md';
import { Link } from 'wouter-preact';
import IssuedTicketCardList from '../../../features/tickets/IssuedTicketCardList';

import {
  ISSUE_RESULT_STORAGE_KEY,
  type IssueResultPayload,
} from '../../../features/issue/issueResultStorage';
import styles from './Issue.module.css';

const IssueResult = () => {
  const [result, setResult] = useState<IssueResultPayload | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(ISSUE_RESULT_STORAGE_KEY);

    if (!raw) {
      setResult(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as IssueResultPayload;
      if (!parsed.issuedTickets || parsed.issuedTickets.length === 0) {
        setResult(null);
        return;
      }

      setResult(parsed);
    } catch {
      setResult(null);
    }
  }, []);

  return (
    <div className={styles.issuePage}>
      <div className={styles.topActions}>
        <Link to='/students/issue' className={styles.topBackButton}>
          <MdArrowBack />
          戻る
        </Link>
      </div>
      <h1 className={styles.pageTitle}>発券完了</h1>

      {!result ? (
        <section className={styles.issuedSection}>
          <p>表示できる発券結果がありません。</p>
          <Link to='/students/issue' className={styles.topBackButton}>
            発券画面へ戻る
          </Link>
        </section>
      ) : (
        <IssuedTicketCardList
          title='発券したチケット一覧'
          tickets={result.issuedTickets.map((ticket) => ({
            ...ticket,
            performanceName: result.performanceName,
            performanceTitle: result.performanceTitle,
            scheduleName: result.scheduleName,
            ticketTypeLabel: result.ticketTypeLabel,
            relationshipName: result.relationshipName,
          }))}
        />
      )}

      <Link to='/students/dashboard' className={styles.buttonLink}>
        ダッシュボードへ戻る
      </Link>
    </div>
  );
};

export default IssueResult;
