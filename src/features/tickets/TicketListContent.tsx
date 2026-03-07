import IssuedTicketCardList, {
  type TicketCardItem,
  type TicketListSortMode,
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
  showSortControl?: boolean;
  sortMode?: TicketListSortMode;
  onSortModeChange?: (mode: TicketListSortMode) => void;
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
  showSortControl = false,
  sortMode,
  onSortModeChange,
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
      showSortControl={showSortControl}
      sortMode={sortMode}
      onSortModeChange={onSortModeChange}
      tickets={tickets}
      emptyMessage={emptyMessage}
    />
  );
};

export default TicketListContent;
