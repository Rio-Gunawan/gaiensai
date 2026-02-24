import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import { decodeTicketCode } from '@ticket-codec';
import performancesSnapshot from '../../../generated/performances-static.json';

import type { UserData } from '../../../types/types';
import NormalSection from '../../../components/ui/NormalSection';
import { type TicketCardItem } from '../../../features/tickets/IssuedTicketCardList';
import TicketListContent from '../../../features/tickets/TicketListContent';

import subPageStyles from '../../../styles/sub-pages.module.css';
import sharedStyles from '../../../styles/shared.module.css';
import styles from './Dashboard.module.css';
import { Link } from 'wouter-preact';
import { IoMdAdd } from 'react-icons/io';
import PerformancesTable from '../../../features/performances/PerformancesTable';
import {
  readCachedTicketCards,
  writeCachedTicketCards,
} from './offlineCache';
import Alert from '../../../components/ui/Alert';

type DashboardProps = {
  userData: Exclude<UserData, null>;
};

type TicketSnapshot = {
  performances?: Array<{ id: number; class_name: string; title?: string | null }>;
  schedules?: Array<{ id: number; round_name: string }>;
  ticketTypes?: Array<{ id: number; name: string }>;
  relationships?: Array<{ id: number; name: string }>;
};

type DecodedTicketSeed = {
  relationshipId: number;
  ticketTypeId: number;
  performanceId: number;
  scheduleId: number;
  serial: number;
};

const ticketSnapshot = performancesSnapshot as TicketSnapshot;

const toDecodedSeed = (
  decoded: Awaited<ReturnType<typeof decodeTicketCode>>,
): DecodedTicketSeed | null => {
  if (!decoded) {
    return null;
  }

  return {
    relationshipId: decoded.relationship,
    ticketTypeId: decoded.type,
    performanceId: decoded.performance,
    scheduleId: decoded.schedule,
    serial: decoded.serial,
  };
};

const Dashboard = ({ userData }: DashboardProps) => {
  const [ticketCards, setTicketCards] = useState<
    (TicketCardItem & { relationshipId: number })[]
  >([]);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketNotice, setTicketNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const loadTickets = async () => {
      setTicketLoading(true);
      setTicketError(null);
      setTicketNotice(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (sessionError || !user) {
        setTicketError('ログイン情報の取得に失敗しました。');
        setTicketLoading(false);
        return;
      }

      const fallbackToCachedTickets = () => {
        const cachedTickets = readCachedTicketCards(user.id);
        if (cachedTickets) {
          setTicketCards(cachedTickets);
          setTicketNotice(
            'オフラインのため、前回読み込んだ発券済みチケットを表示しています。',
          );
          setTicketError(null);
          setTicketLoading(false);
          setIsOnline(false);
          return true;
        }
        return false;
      };

      const [
        { data: ticketsData, error: ticketsError },
      ] = await Promise.all([
        supabase
          .from('tickets')
          .select('code, signature, relationship, created_at')
          .eq('user_id', user.id)
          .eq('status', 'valid')
          .order('created_at', { ascending: false }),
      ]);

      if (ticketsError) {
        if (fallbackToCachedTickets()) {
          return;
        }
        setTicketError('チケット情報の取得に失敗しました。');
        setTicketLoading(false);
        return;
      }

      const tickets = (ticketsData ?? []) as Array<{
        code: string;
        signature: string;
        relationship: number;
        created_at: string;
      }>;

      if (tickets.length === 0) {
        setTicketCards([]);
        setTicketLoading(false);
        return;
      }

      const decodedTickets = await Promise.all(
        tickets.map(async (ticket) => {
          const decodedRaw = await decodeTicketCode(ticket.code, {
            ticketSigningPrivateKeyMacBase64: import.meta.env
              .VITE_TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64,
            ticketSigningPrivateKeyCipherBase64: import.meta.env
              .VITE_TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64,
            base58Alphabet: import.meta.env.VITE_BASE58_ALPHABET,
          });

          return {
            ticket,
            decoded: toDecodedSeed(decodedRaw),
          };
        }),
      );

      const performanceIds = [
        ...new Set(
          decodedTickets
            .map((item) => item.decoded?.performanceId ?? 0)
            .filter((id) => id > 0),
        ),
      ];

      const { data: performanceData } =
        performanceIds.length > 0
          ? await supabase
              .from('class_performances')
              .select('id, class_name, title')
              .in('id', performanceIds)
          : { data: [] };

      const performanceMap = new Map(
        (
          (performanceData ?? []) as Array<{
            id: number;
            class_name: string;
            title: string | null;
          }>
        ).map((performance) => [performance.id, performance]),
      );

      const scheduleMap = new Map(
        ((ticketSnapshot.schedules ?? []) as Array<{
          id: number;
          round_name: string;
        }>).map((schedule) => [schedule.id, schedule]),
      );

      const ticketTypeMap = new Map(
        ((ticketSnapshot.ticketTypes ?? []) as Array<{
          id: number;
          name: string;
        }>).map((ticketType) => [
          ticketType.id,
          ticketType.name,
        ]),
      );
      const relationshipMap = new Map(
        ((ticketSnapshot.relationships ?? []) as Array<{
          id: number;
          name: string;
        }>).map((relationship) => [
          relationship.id,
          relationship.name,
        ]),
      );

      const snapshotPerformanceMap = new Map(
        ((ticketSnapshot.performances ?? []) as Array<{
          id: number;
          class_name: string;
          title?: string | null;
        }>).map((performance) => [performance.id, performance]),
      );

      const cards = decodedTickets.map(({ ticket, decoded }) => {
        const relationshipId = decoded?.relationshipId ?? ticket.relationship;
        const performance = decoded
          ? performanceMap.get(decoded.performanceId) ??
            snapshotPerformanceMap.get(decoded.performanceId)
          : undefined;
        const schedule = decoded
          ? scheduleMap.get(decoded.scheduleId)
          : undefined;
        const isAdmissionOnly =
          decoded?.performanceId === 0 && decoded?.scheduleId === 0;

        return {
          code: ticket.code,
          signature: ticket.signature,
          serial: decoded?.serial,
          performanceName: performance?.class_name ?? '-',
          performanceTitle: performance?.title ?? null,
          scheduleName: isAdmissionOnly ? '' : (schedule?.round_name ?? '-'),
          ticketTypeLabel: decoded
            ? (ticketTypeMap.get(decoded.ticketTypeId) ?? `券種${decoded.ticketTypeId}`)
            : '-',
          relationshipName: decoded
            ? (relationshipMap.get(decoded.relationshipId) ??
              `間柄${decoded.relationshipId}`)
            : '-',
          relationshipId,
        };
      });

      cards.sort((a, b) => {
        const groupCompare =
          a.performanceName.localeCompare(b.performanceName, 'ja') ||
          a.scheduleName.localeCompare(b.scheduleName, 'ja') ||
          a.relationshipName.localeCompare(b.relationshipName, 'ja') ||
          a.ticketTypeLabel.localeCompare(b.ticketTypeLabel, 'ja');

        if (groupCompare !== 0) {
          return groupCompare;
        }

        const aSerial = typeof a.serial === 'number' ? a.serial : Number.MAX_SAFE_INTEGER;
        const bSerial = typeof b.serial === 'number' ? b.serial : Number.MAX_SAFE_INTEGER;
        return aSerial - bSerial;
      });

      setTicketCards(cards);
      writeCachedTicketCards(user.id, cards);
      setTicketLoading(false);
    };

    void loadTickets();
  }, []);

  const ownUseTickets = useMemo(
    () => ticketCards.filter((ticket) => ticket.relationshipId === 1),
    [ticketCards],
  );

  const guestTickets = useMemo(
    () => ticketCards.filter((ticket) => ticket.relationshipId !== 1),
    [ticketCards],
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <>
      <h1 className={subPageStyles.pageTitle}>ダッシュボード</h1>
      <section>
        <h2 className={sharedStyles.normalH2}>
          {userData.affiliation} {userData.name} 様
        </h2>
        <Link
          to='/students/issue'
          class={`${styles.buttonLink} ${!isOnline ? styles.buttonLinkDisabled : ''}`}
          aria-disabled={!isOnline}
          tabIndex={!isOnline ? -1 : 0}
          onClick={(event) => {
            if (!isOnline) {
              event.preventDefault();
            }
          }}
        >
          <IoMdAdd />
          新規チケット発行
        </Link>
        {!isOnline && (
          <p className={styles.issueOfflineNote}>
            オフライン中は新規チケットを発行できません。
          </p>
        )}
      </section>
      {ticketNotice && <Alert type='info'><p>{ticketNotice}</p></Alert>}
      <NormalSection>
        <h2>発券状況</h2>
        {ticketLoading ? (
          <p>読み込み中...</p>
        ) : ticketError ? (
          <p>{ticketError}</p>
        ) : ticketCards.length > 0 ? (
          <div className={styles.ticketSummary}>
            <div className={styles.ticketSummaryItem}>
              <p className={styles.ticketSummaryNumber}>
                {ticketCards.length}
              </p>
              <p className={styles.ticketSummaryLabel}>合計発券枚数</p>
            </div>
            <div className={styles.ticketSummaryItem}>
              <p className={styles.ticketSummaryNumber}>
                {ownUseTickets.length}
              </p>
              <p className={styles.ticketSummaryLabel}>自分用</p>
            </div>
            <div className={styles.ticketSummaryItem}>
              <p className={styles.ticketSummaryNumber}>
                {guestTickets.length}
              </p>
              <p className={styles.ticketSummaryLabel}>招待者用</p>
            </div>
          </div>
        ) : (
          <p>まだチケットは発券されていません。</p>
        )}
      </NormalSection>
      <NormalSection>
        <h2>自分が使うチケット</h2>
        <TicketListContent
          loading={ticketLoading}
          error={ticketError}
          tickets={ownUseTickets}
          emptyMessage='自分が使うチケットはまだありません。'
        />
      </NormalSection>
      <NormalSection>
        <h2>招待者用のチケット</h2>
        <TicketListContent
          loading={ticketLoading}
          error={ticketError}
          tickets={guestTickets}
          emptyMessage='招待者用のチケットはまだありません。'
        />
      </NormalSection>
      <NormalSection>
        <h2>公演空き状況</h2>
        <h3>予約可能なチケットの残り枚数</h3>
        <PerformancesTable enableIssueJump={true} />
      </NormalSection>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          ログアウト
        </button>
      </section>
    </>
  );
};

export default Dashboard;
