import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import styles from './IssuedTicketCardList.module.css';
import { Link } from 'wouter-preact';

export type TicketCardItem = {
  code: string;
  signature: string;
  serial?: number;
  performanceName: string;
  performanceTitle?: string | null;
  scheduleName: string;
  ticketTypeLabel: string;
  relationshipName: string;
  issuerName?: string;
  status?: 'valid' | 'cancelled' | 'used' | 'missing' | 'unknown';
};

type IssuedTicketCardListProps = {
  title?: string;
  tickets: TicketCardItem[];
  emptyMessage?: string;
  showTicketLink?: boolean;
  showTicketCode?: boolean;
  showSerialNumber?: boolean;
  embedded?: boolean;
  collapseAt?: number;
};

export const compareTicketCardItem = (
  a: TicketCardItem,
  b: TicketCardItem,
): number => {
  const groupCompare =
    a.performanceName.localeCompare(b.performanceName, 'ja') ||
    a.scheduleName.localeCompare(b.scheduleName, 'ja') ||
    a.relationshipName.localeCompare(b.relationshipName, 'ja') ||
    (a.issuerName ?? '').localeCompare(b.issuerName ?? '', 'ja') ||
    a.ticketTypeLabel.localeCompare(b.ticketTypeLabel, 'ja');

  if (groupCompare !== 0) {
    return groupCompare;
  }

  const aSerial =
    typeof a.serial === 'number' ? a.serial : Number.MAX_SAFE_INTEGER;
  const bSerial =
    typeof b.serial === 'number' ? b.serial : Number.MAX_SAFE_INTEGER;
  if (aSerial !== bSerial) {
    return aSerial - bSerial;
  }

  return a.code.localeCompare(b.code, 'ja');
};

const IssuedTicketCardList = ({
  title,
  tickets,
  emptyMessage = '表示できるチケットがありません。',
  showTicketLink = true,
  showTicketCode = false,
  showSerialNumber = false,
  embedded = false,
  collapseAt,
}: IssuedTicketCardListProps) => {
  const [expanded, setExpanded] = useState(false);
  const [collapsedMaxHeight, setCollapsedMaxHeight] = useState<number | null>(
    null,
  );
  const [isCollapsible, setIsCollapsible] = useState(false);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const sortedTickets = useMemo(
    () => [...tickets].sort(compareTicketCardItem),
    [tickets],
  );

  useEffect(() => {
    if (typeof collapseAt !== 'number') {
      setIsCollapsible(false);
      setCollapsedMaxHeight(null);
      return;
    }

    const calculateCollapsedState = () => {
      const cards = cardRefs.current.filter(
        (card): card is HTMLElement => card !== null,
      );

      if (cards.length === 0) {
        setIsCollapsible(false);
        setCollapsedMaxHeight(null);
        return;
      }

      const rowTops = [...new Set(cards.map((card) => card.offsetTop))].sort(
        (a, b) => a - b,
      );

      const nextCollapsible = rowTops.length > collapseAt;
      setIsCollapsible(nextCollapsible);

      if (!nextCollapsible || expanded) {
        setCollapsedMaxHeight(null);
        return;
      }

      const firstRowTop = rowTops[0];
      const firstHiddenRowTop = rowTops[collapseAt];
      const firstHiddenCard = cards.find(
        (card) => card.offsetTop === firstHiddenRowTop,
      );

      if (!firstHiddenCard) {
        setCollapsedMaxHeight(null);
        return;
      }

      const maxHeight =
        firstHiddenRowTop - firstRowTop + firstHiddenCard.offsetHeight / 2;

      setCollapsedMaxHeight(Math.max(maxHeight, 0));
    };

    calculateCollapsedState();

    window.addEventListener('resize', calculateCollapsedState);
    return () => {
      window.removeEventListener('resize', calculateCollapsedState);
    };
  }, [collapseAt, expanded, sortedTickets]);

  return (
    <section
      className={`${styles.issuedSection} ${
        embedded ? styles.issuedSectionEmbedded : ''
      }`}
    >
      {title && <h2 className={styles.issuedTitle}>{title}</h2>}
      {sortedTickets.length === 0 ? (
        <p className={styles.emptyState}>{emptyMessage}</p>
      ) : (
        <div
          className={`${styles.collapsible} ${
            isCollapsible && !expanded ? styles.collapsibleCollapsed : ''
          }`}
          style={
            isCollapsible && !expanded && collapsedMaxHeight !== null
              ? { maxHeight: `${collapsedMaxHeight}px` }
              : undefined
          }
        >
          <div className={styles.issuedGrid}>
            {sortedTickets.map((ticket, index) => {
              const isAdmissionOnly =
                ticket.ticketTypeLabel.includes('入場専用券');
              const headlineLabel = isAdmissionOnly
                ? '入場専用券'
                : ticket.performanceName;

              return (
                <article
                  className={styles.ticketCard}
                  key={ticket.code}
                  ref={(element) => {
                    cardRefs.current[index] = element;
                  }}
                >
                  {showSerialNumber && typeof ticket.serial === 'number' && (
                    <span className={styles.serialBadge}>#{ticket.serial}</span>
                  )}
                  <div className={styles.ticketHeader}>
                    <h3 className={styles.ticketClass}>
                      {headlineLabel}
                      {!isAdmissionOnly && ticket.performanceTitle && (
                        <span className={styles.ticketTitle}>
                          「{ticket.performanceTitle}」
                        </span>
                      )}
                    </h3>
                    <span className={styles.ticketSchedule}>
                      {ticket.scheduleName}
                    </span>
                  </div>
                  <div className={styles.ticketMeta}>
                    {showTicketCode && (
                      <div className={styles.ticketMetaRow}>
                        <span className={styles.ticketMetaLabel}>
                          チケットコード
                        </span>
                        <span
                          className={`${styles.ticketMetaValue} ${styles.ticketCodeValue}`}
                        >
                          {ticket.code}
                        </span>
                      </div>
                    )}
                    <div className={styles.ticketMetaRow}>
                      <span className={styles.ticketMetaLabel}>券種</span>
                      <span className={styles.ticketMetaValue}>
                        {ticket.ticketTypeLabel}
                      </span>
                    </div>
                    <div className={styles.ticketMetaRow}>
                      <span className={styles.ticketMetaLabel}>間柄</span>
                      <span className={styles.ticketMetaValue}>
                        {ticket.relationshipName}
                      </span>
                    </div>
                  </div>
                  {showTicketLink && (
                    <Link
                      to={`/t/${ticket.code}.${ticket.signature}`}
                      className={styles.ticketLinkButton}
                    >
                      チケットを表示
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
          {isCollapsible && !expanded && <div className={styles.fadeMask} />}
        </div>
      )}
      {isCollapsible && (
        <button
          type='button'
          className={styles.showMoreButton}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '閉じる' : '続きを表示'}
        </button>
      )}
    </section>
  );
};

export default IssuedTicketCardList;
