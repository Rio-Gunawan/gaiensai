import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';

import type { UserData } from '../../../types/types';
import NormalSection from '../../../components/ui/NormalSection';
import IssuedTicketCardList, {
  type TicketCardItem,
} from '../../../features/tickets/IssuedTicketCardList';

import subPageStyles from '../../../styles/sub-pages.module.css';
import sharedStyles from '../../../styles/shared.module.css';
import styles from './Dashboard.module.css';
import { Link } from 'wouter-preact';
import { IoMdAdd } from 'react-icons/io';
import PerformancesTable from '../../../features/performances/PerformancesTable';

type DashboardProps = {
  userData: Exclude<UserData, null>;
};

const Dashboard = ({ userData }: DashboardProps) => {
  const [ticketCards, setTicketCards] = useState<(TicketCardItem & { relationshipId: number })[]>([]);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    const loadTickets = async () => {
      setTicketLoading(true);
      setTicketError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setTicketError('ログイン情報の取得に失敗しました。');
        setTicketLoading(false);
        return;
      }

      const [
        { data: ticketsData, error: ticketsError },
        { data: ticketTypesData, error: ticketTypesError },
        { data: relationshipsData, error: relationshipsError },
      ] = await Promise.all([
        supabase
          .from('tickets')
          .select('id, code, signature, ticket_type, relationship, created_at')
          .eq('user_id', user.id)
          .eq('status', 'valid')
          .order('created_at', { ascending: false }),
        supabase.from('ticket_types').select('id, name'),
        supabase.from('relationships').select('id, name'),
      ]);

      if (ticketsError || ticketTypesError || relationshipsError) {
        setTicketError('チケット情報の取得に失敗しました。');
        setTicketLoading(false);
        return;
      }

      const tickets = (ticketsData ??
        []) as Array<{
        id: string;
        code: string;
        signature: string;
        ticket_type: number;
        relationship: number;
        created_at: string;
      }>;

      if (tickets.length === 0) {
        setTicketCards([]);
        setTicketLoading(false);
        return;
      }

      const ticketIds = tickets.map((ticket) => ticket.id);
      const { data: classTicketsData, error: classTicketsError } = await supabase
        .from('class_tickets')
        .select('id, class_id, round_id')
        .in('id', ticketIds);

      if (classTicketsError) {
        setTicketError('チケット詳細の取得に失敗しました。');
        setTicketLoading(false);
        return;
      }

      const classTickets = (classTicketsData ??
        []) as Array<{ id: string; class_id: number; round_id: number }>;
      const classIds = [...new Set(classTickets.map((item) => item.class_id))];
      const roundIds = [...new Set(classTickets.map((item) => item.round_id))];

      const [{ data: performanceData }, { data: scheduleData }] = await Promise.all([
        classIds.length > 0
          ? supabase
              .from('class_performances')
              .select('id, class_name, title')
              .in('id', classIds)
          : Promise.resolve({ data: [], error: null }),
        roundIds.length > 0
          ? supabase
              .from('performances_schedule')
              .select('id, round_name')
              .in('id', roundIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const performanceMap = new Map(
        ((performanceData ?? []) as Array<{ id: number; class_name: string; title: string | null }>).map(
          (performance) => [performance.id, performance],
        ),
      );

      const scheduleMap = new Map(
        ((scheduleData ?? []) as Array<{ id: number; round_name: string }>).map(
          (schedule) => [schedule.id, schedule],
        ),
      );

      const classTicketMap = new Map(classTickets.map((item) => [item.id, item]));
      const ticketTypeMap = new Map(
        ((ticketTypesData ?? []) as Array<{ id: number; name: string | null }>).map(
          (ticketType) => [ticketType.id, ticketType.name ?? `券種${ticketType.id}`],
        ),
      );
      const relationshipMap = new Map(
        ((relationshipsData ?? []) as Array<{ id: number; name: string | null }>).map(
          (relationship) => [
            relationship.id,
            relationship.name ?? `間柄${relationship.id}`,
          ],
        ),
      );

      const cards = tickets.map((ticket) => {
        const classTicket = classTicketMap.get(ticket.id);
        const performance = classTicket
          ? performanceMap.get(classTicket.class_id)
          : undefined;
        const schedule = classTicket
          ? scheduleMap.get(classTicket.round_id)
          : undefined;

        return {
          code: ticket.code,
          signature: ticket.signature,
          performanceName: performance?.class_name ?? '-',
          performanceTitle: performance?.title ?? null,
          scheduleName: schedule?.round_name ?? '-',
          ticketTypeLabel: ticketTypeMap.get(ticket.ticket_type) ?? '-',
          relationshipName: relationshipMap.get(ticket.relationship) ?? '-',
          relationshipId: ticket.relationship,
        };
      });

      setTicketCards(cards);
      setTicketLoading(false);
    };

    void loadTickets();
  }, []);

  const ownUseTickets = useMemo(
    () => ticketCards.filter((ticket) => ticket.relationshipId === 1),
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
        <Link to='/students/issue' class={styles.buttonLink}>
          <IoMdAdd />
          新規チケット発行
        </Link>
      </section>
      <NormalSection>
        <h2>自分が使うチケット</h2>
        {ticketLoading ? (
          <p>読み込み中...</p>
        ) : ticketError ? (
          <p>{ticketError}</p>
        ) : (
          <IssuedTicketCardList
            embedded={true}
            collapseAt={2}
            tickets={ownUseTickets}
            emptyMessage='自分が使うチケットはまだありません。'
          />
        )}
      </NormalSection>
      <NormalSection>
        <h2>発券したチケット</h2>
        {ticketLoading ? (
          <p>読み込み中...</p>
        ) : ticketError ? (
          <p>{ticketError}</p>
        ) : (
          <IssuedTicketCardList
            embedded={true}
            collapseAt={2}
            tickets={ticketCards}
            emptyMessage='発券したチケットはまだありません。'
          />
        )}
      </NormalSection>
      <NormalSection>
        <h2>公演空き状況</h2>
        <h3>予約可能なチケットの残り枚数</h3>
        <PerformancesTable enableIssueJump={true} />
      </NormalSection>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>ログアウト</button>
      </section>
    </>
  );
};

export default Dashboard;
