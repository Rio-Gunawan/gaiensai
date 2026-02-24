import IssuedTicketCardList, {
  type TicketCardItem,
} from './IssuedTicketCardList';

type TicketListContentProps = {
  tickets: TicketCardItem[];
  loading?: boolean;
  error?: string | null;
  emptyMessage: string;
  embedded?: boolean;
  collapseAt?: number;
  showTicketCode?: boolean;
  showSerialNumber?: boolean;
};

const TicketListContent = ({
  tickets,
  loading = false,
  error = null,
  emptyMessage,
  embedded = true,
  collapseAt = 2,
  showTicketCode = true,
  showSerialNumber = true,
}: TicketListContentProps) => {
  if (loading) {
    return <p>読み込み中...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <IssuedTicketCardList
      embedded={embedded}
      collapseAt={collapseAt}
      showTicketCode={showTicketCode}
      showSerialNumber={showSerialNumber}
      tickets={tickets}
      emptyMessage={emptyMessage}
    />
  );
};

export default TicketListContent;
