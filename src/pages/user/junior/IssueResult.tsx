import { useEffect, useState } from 'preact/hooks';
import BackButton from '../../../components/ui/BackButton';
import {
  JUNIOR_ISSUE_RESULT_STORAGE_KEY,
  type IssueResultPayload,
} from '../../../features/issue/issueResultStorage';
import IssuedTicketCardList from '../../../features/tickets/IssuedTicketCardList';
import { useDecodedSerialTickets } from '../../../features/tickets/useDecodedSerialTickets';
import { useTicketStorage } from '../../../features/tickets/useTicketStorage';
import { useTitle } from '../../../hooks/useTitle';
import styles from '../students/Issue.module.css';

const IssueResult = () => {
  const [result, setResult] = useState<IssueResultPayload | null>(null);
  const { saveTicketToCache } = useTicketStorage();

  useTitle('発券完了 - 中学生用ページ');

  useEffect(() => {
    const raw = window.sessionStorage.getItem(JUNIOR_ISSUE_RESULT_STORAGE_KEY);
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

      void Promise.all(
        parsed.issuedTickets.map((ticket) =>
          saveTicketToCache(
            ticket.code,
            ticket.signature,
            {
              performanceName: parsed.performanceName,
              performanceTitle: parsed.performanceTitle ?? null,
              scheduleName: parsed.scheduleName,
              scheduleDate: parsed.scheduleDate,
              scheduleTime: parsed.scheduleTime,
              scheduleEndTime: parsed.scheduleEndTime,
              ticketTypeLabel: parsed.ticketTypeLabel,
              relationshipName: parsed.relationshipName,
              relationshipId: parsed.relationshipId,
            },
            'valid',
          ),
        ),
      );
    } catch {
      setResult(null);
    }
  }, []);

  const issuedTickets = useDecodedSerialTickets(result?.issuedTickets ?? []);

  return (
    <div className={styles.issuePage}>
      <BackButton href='/junior/issue' />
      <h1 className={styles.pageTitle}>発券完了</h1>

      {!result ? (
        <section className={styles.issuedSection}>
          <p>表示できる発券結果がありません。</p>
          <a href='/junior/issue' className={styles.topBackButton}>
            発券画面へ戻る
          </a>
        </section>
      ) : (
        <section className={styles.issuedSection}>
          <IssuedTicketCardList
            title='発券したチケット一覧'
            showSortControl
            showSerialNumber
            showTicketCode
            tickets={issuedTickets.map((ticket) => ({
              ...ticket,
              performanceName: result.performanceName,
              performanceTitle: result.performanceTitle,
              scheduleName: result.scheduleName,
              ticketTypeLabel: result.ticketTypeLabel,
              relationshipName: result.relationshipName,
              status: 'valid',
            }))}
          />
        </section>
      )}

      <a href='/junior/mypage' className={styles.buttonLink}>
        ダッシュボードへ戻る
      </a>
    </div>
  );
};

export default IssueResult;
