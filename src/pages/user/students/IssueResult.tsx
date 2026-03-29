import { useEffect, useState } from 'preact/hooks';
import IssuedTicketCardList from '../../../features/tickets/IssuedTicketCardList';
import { useDecodedSerialTickets } from '../../../features/tickets/useDecodedSerialTickets';

import {
  ISSUE_RESULT_STORAGE_KEY,
  type IssueResultPayload,
} from '../../../features/issue/issueResultStorage';
import styles from './Issue.module.css';
import BackButton from '../../../components/ui/BackButton';

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

      // Cache newly issued tickets to ticketDisplayCache
      void (async () => {
        try {
          const { writeTicketDisplayCache } =
            await import('../../../features/tickets/ticketDisplayCache');
          const { decodeTicketCodeWithEnv, toTicketDecodedSeed } =
            await import('../../../features/tickets/ticketCodeDecode');

          await Promise.all(
            parsed.issuedTickets.map(async (ticket) => {
              const decodedRaw = await decodeTicketCodeWithEnv(ticket.code);
              const decoded = toTicketDecodedSeed(decodedRaw);

              const ticketCacheEntry = {
                code: ticket.code,
                signature: ticket.signature,
                serial: decoded?.serial,
                performanceName: parsed.performanceName,
                performanceTitle: parsed.performanceTitle,
                scheduleName: parsed.scheduleName,
                ticketTypeLabel: parsed.ticketTypeLabel,
                relationshipName: parsed.relationshipName,
                relationshipId: parsed.relationshipId,
                status: 'valid',
                lastOpenedAt: Date.now(),
              };
              writeTicketDisplayCache(ticket.code, ticketCacheEntry);
            }),
          );
        } catch {
          // Ignore cache write failures
        }
      })();
    } catch {
      setResult(null);
    }
  }, []);

  const issuedTickets = useDecodedSerialTickets(result?.issuedTickets ?? []);

  return (
    <div className={styles.issuePage}>
      <BackButton href='/students/issue' />
      <h1 className={styles.pageTitle}>発券完了</h1>

      {!result ? (
        <section className={styles.issuedSection}>
          <p>表示できる発券結果がありません。</p>
          <a href='/students/issue' className={styles.topBackButton}>
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

      <a href='/students/dashboard' className={styles.buttonLink}>
        ダッシュボードへ戻る
      </a>
    </div>
  );
};

export default IssueResult;
