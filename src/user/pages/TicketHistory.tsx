import { useMemo } from 'preact/hooks';
import TicketListContent from '../../features/tickets/TicketListContent';
import { listTicketDisplayCache } from '../../features/tickets/ticketDisplayCache';
import type { TicketCardItem } from '../../features/tickets/IssuedTicketCardList';
import { useDecodedSerialTickets } from '../../features/tickets/useDecodedSerialTickets';
import pageStyles from '../../styles/sub-pages.module.css';

type CachedTicketDisplay = TicketCardItem & {
  serial?: number;
};

const TicketHistory = () => {
  const cachedTickets = useMemo(
    () => listTicketDisplayCache<CachedTicketDisplay>(),
    [],
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
