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

  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケット表示履歴</h1>
      <TicketListContent
        embedded={false}
        tickets={tickets}
        emptyMessage='この端末で表示したことのあるチケットはまだありません。'
      />
    </>
  );
};

export default TicketHistory;
