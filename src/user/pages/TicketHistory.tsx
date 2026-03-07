import { useEffect, useMemo, useState } from 'preact/hooks';
import TicketListContent from '../../features/tickets/TicketListContent';
import {
  listTicketDisplayCache,
  subscribeTicketDisplayCacheUpdated,
} from '../../features/tickets/ticketDisplayCache';
import type { TicketCardItem } from '../../features/tickets/IssuedTicketCardList';
import { useDecodedSerialTickets } from '../../features/tickets/useDecodedSerialTickets';
import pageStyles from '../../styles/sub-pages.module.css';
import type { CachedTicketDisplay } from '../../types/types';

const TicketHistory = () => {
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setCacheVersion((previous) => previous + 1);
    const unsubscribe = subscribeTicketDisplayCacheUpdated(() => {
      refresh();
    });
    window.addEventListener('storage', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const cachedTickets = useMemo(
    () => listTicketDisplayCache<CachedTicketDisplay>(),
    [cacheVersion],
  );
  const tickets = useDecodedSerialTickets<TicketCardItem>(cachedTickets);
  const validTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'valid'),
    [tickets],
  );
  const cancelledTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'cancelled'),
    [tickets],
  );
  const otherTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.status !== 'valid' && ticket.status !== 'cancelled',
      ),
    [tickets],
  );

  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケット表示履歴</h1>
      <section>
        <h2>有効なチケット</h2>
        <TicketListContent
          embedded={false}
          tickets={validTickets}
          emptyMessage='有効なチケットはありません。'
        />
      </section>
      <section>
        <h2>キャンセル済みチケット</h2>
        <TicketListContent
          embedded={false}
          tickets={cancelledTickets}
          emptyMessage='キャンセル済みチケットはありません。'
        />
      </section>
      <section>
        <h2>その他のチケット</h2>
        <TicketListContent
          embedded={false}
          tickets={otherTickets}
          emptyMessage='その他のチケットはありません。'
        />
      </section>
    </>
  );
};

export default TicketHistory;
