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
};

type IssuedTicketCardListProps = {
  title?: string;
  tickets: TicketCardItem[];
  emptyMessage?: string;
  showTicketLink?: boolean;
  showTicketCode?: boolean;
  showSerialNumber?: boolean;
  serialStart?: number;
  embedded?: boolean;
  collapseAt?: number;
};

const IssuedTicketCardList = ({
  title,
  tickets,
  emptyMessage = '表示できるチケットがありません。',
  showTicketLink = true,
  showTicketCode = false,
  showSerialNumber = false,
  serialStart = 1,
  embedded = false,
  collapseAt,
}: IssuedTicketCardListProps) => {
  const [expanded, setExpanded] = useState(false);
  const [collapsedMaxHeight, setCollapsedMaxHeight] = useState<number | null>(null);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const serialNumbers = useMemo(() => {
    const groupCounts = new Map<string, number>();
    return tickets.map((ticket) => {
      if (typeof ticket.serial === 'number') {
        return ticket.serial;
      }

      const groupKey = [
        ticket.scheduleName,
        ticket.performanceName,
        ticket.relationshipName,
        ticket.ticketTypeLabel,
      ].join('::');
      const next = (groupCounts.get(groupKey) ?? 0) + 1;
      groupCounts.set(groupKey, next);
      return next;
    });
  }, [tickets]);

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
        firstHiddenRowTop -
        firstRowTop +
        firstHiddenCard.offsetHeight / 2;

      setCollapsedMaxHeight(Math.max(maxHeight, 0));
    };

    calculateCollapsedState();

    window.addEventListener('resize', calculateCollapsedState);
    return () => {
      window.removeEventListener('resize', calculateCollapsedState);
    };
  }, [collapseAt, expanded, tickets]);

  return (
    <section
      className={`${styles.issuedSection} ${
        embedded ? styles.issuedSectionEmbedded : ''
      }`}
    >
      {title && <h2 className={styles.issuedTitle}>{title}</h2>}
      {tickets.length === 0 ? (
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
            {tickets.map((ticket, index) => {
              const isAdmissionOnly =
                ticket.ticketTypeLabel.includes('入場専用券');
              const headlineLabel = isAdmissionOnly
                ? '入場専用券'
                : ticket.performanceName;
              const serialNumber = serialStart + serialNumbers[index] - 1;

              return (
                <article
                  className={styles.ticketCard}
                  key={ticket.code}
                  ref={(element) => {
                    cardRefs.current[index] = element;
                  }}
                >
                  {showSerialNumber && (
                    <span className={styles.serialBadge}>#{serialNumber}</span>
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
