import { useEffect, useState } from 'preact/hooks';
import { useParams } from 'wouter-preact';
import { navigate } from 'wouter-preact/use-browser-location';

import Alert from '../../components/ui/Alert';
import QRCode from '../../components/ui/QRCode';
import { useEventConfig } from '../../hooks/useEventConfig';
import { supabase } from '../../lib/supabase';
import performancesSnapshot from '../../generated/performances-static.json';
import {
  readTicketDisplayCache,
  writeTicketDisplayCache,
} from '../../features/tickets/ticketDisplayCache';
import {
  decodeTicketCodeWithEnv,
  toTicketDecodedDisplaySeed,
  type TicketDecodedDisplaySeed,
} from '../../features/tickets/ticketCodeDecode';
import { verifyCodeSignature } from '../../../supabase/functions/_shared/verifyCodeSignature.ts';

import pageStyles from '../../styles/sub-pages.module.css';
import styles from './Ticket.module.css';
import { MdClose } from 'react-icons/md';

type TicketDisplay = TicketDecodedDisplaySeed & {
  code: string;
  signature: string;
  performanceName: string;
  performanceTitle: string | null;
  scheduleName: string;
  scheduleDate: string;
  scheduleTime: string;
  scheduleEndTime: string;
  ticketTypeLabel: string;
  relationshipName: string;
  status?: TicketStatus;
};

type TicketStatus = 'valid' | 'used' | 'cancelled' | 'missing' | 'unknown';

type TicketValidityCheckResult = {
  status: TicketStatus;
  errorMessage: string | null;
};

type SnapshotPerformance = {
  id: number;
  class_name: string;
};

type SnapshotSchedule = {
  id: number;
  round_name: string;
  start_at?: string | null;
};

type SnapshotNamedMaster = {
  id: number;
  name: string;
};

type TicketSnapshot = {
  generatedAt: string | null;
  performances: SnapshotPerformance[];
  schedules: SnapshotSchedule[];
  ticketTypes?: SnapshotNamedMaster[];
  relationships?: SnapshotNamedMaster[];
  showLengthMinutes?: number | null;
};

const ticketSnapshot = performancesSnapshot as TicketSnapshot;

const verifyTicketSignature = async (
  code: string,
  signature: string,
): Promise<boolean> =>
  verifyCodeSignature(
    code,
    signature,
    import.meta.env.VITE_TICKET_SIGNING_PUBLIC_KEY_ED25519_BASE64,
  );

const checkTicketValidity = async (
  code: string,
): Promise<TicketValidityCheckResult> => {

  const cachedStatus = readTicketDisplayCache<{ status: TicketStatus }>(code)?.status;
  if (cachedStatus === 'cancelled') {
    return {
      status: 'cancelled',
      errorMessage: 'このチケットはキャンセルされています。',
    };
  }

  const { data, error } = await supabase
    .from('tickets')
    .select('status')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    return {
      status: 'unknown',
      errorMessage: `チケットの有効性確認に失敗しました。デバイスがオフラインの場合、または障害が発生している場合は、このエラーが発生する可能性があります。
    これが正規で未使用のQRコードであれば、そのままご入場いただけます。不明点がありましたら、お気軽に外苑祭総務にお問い合わせください。`,
    };
  }

  const status = (data as { status?: string } | null)?.status;

  if (status === 'used') {
    return {
      status: 'used',
      errorMessage: 'このチケットはすでに使用されています。',
    };
  }
  if (status === 'cancelled') {
    const existing = readTicketDisplayCache<Record<string, unknown>>(code);
    if (existing) {
      existing.status = 'cancelled';
      writeTicketDisplayCache(code, existing);
    }
    return {
      status: 'cancelled',
      errorMessage: 'このチケットはキャンセルされています。',
    };
  }
  if (!status) {
    return {
      status: 'missing',
      errorMessage: 'このチケットは存在しないか、無効です。',
    };
  }
  if (status !== 'valid') {
    return {
      status: 'unknown',
      errorMessage: 'このチケットは無効です。',
    };
  }

  return {
    status: 'valid',
    errorMessage: null,
  };
};

const formatDateText = (date: string[]) => {
  if (date.length === 0) {
    return '';
  }

  const toParts = (dateText: string) => {
    const [year, month, day] = dateText
      .split('-')
      .map((value) => Number(value));
    return { year, month, day };
  };

  const first = toParts(date[0]);
  const last = toParts(date[date.length - 1]);

  if (first.year === last.year && first.month === last.month) {
    return `${first.year}/${first.month}/${first.day}~${last.day}`;
  }

  return `${first.year}/${first.month}/${first.day}~${last.year}/${last.month}/${last.day}`;
};

const Ticket = () => {
  const { config } = useEventConfig();
  const params = useParams();
  const [showCopySucceed, setShowCopySucceed] = useState(false);
  const [ticket, setTicket] = useState<TicketDisplay>({
    code: '',
    signature: '',
    affiliation: '-',
    ticketTypeId: 0,
    relationshipId: 0,
    performanceId: 0,
    scheduleId: 0,
    year: '',
    serial: 0,
    performanceName: '-',
    performanceTitle: null,
    scheduleName: '-',
    scheduleDate: '-',
    scheduleTime: '',
    scheduleEndTime: '',
    ticketTypeLabel: '-',
    relationshipName: '-',
  });
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('unknown');

  const token = params.id;

  if (!token) {
    navigate('/');
    return null;
  }

  const [code, signature] = token.split('.');

  useEffect(() => {
    const loadTicket = async () => {
      if (!code || !signature) {
        setErrorMessages(['チケットURLの形式が正しくありません。']);
        setTicketStatus('unknown');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessages([]);
      const nonBlockingErrors: string[] = [];

      const [decodedRaw, signatureIsValid] = await Promise.all([
        decodeTicketCodeWithEnv(code),
        verifyTicketSignature(code, signature),
      ]);
      const decoded = toTicketDecodedDisplaySeed(decodedRaw);

      if (!decoded) {
        setErrorMessages(['チケット情報の復元に失敗しました。']);
        setTicketStatus('unknown');
        setLoading(false);
        return;
      }

      if (!signatureIsValid) {
        nonBlockingErrors.push(
          'チケット署名の検証に失敗しました。不正なチケットの可能性があります。',
        );
      }

      const cached = readTicketDisplayCache<TicketDisplay>(code);
      if (cached) {
        setTicket({
          ...cached,
          signature,
          serial:
            typeof cached.serial === 'number' ? cached.serial : decoded.serial,
        });
        const validityResult = await checkTicketValidity(code);
        setTicketStatus(validityResult.status);
        if (validityResult.errorMessage) {
          nonBlockingErrors.push(validityResult.errorMessage);
        }
        setErrorMessages(nonBlockingErrors);
        setLoading(false);
        return;
      }

      const validityResult = await checkTicketValidity(code);
      setTicketStatus(validityResult.status);
      if (validityResult.errorMessage) {
        nonBlockingErrors.push(validityResult.errorMessage);
      }

      const isAdmissionOnly =
        decoded.performanceId === 0 && decoded.scheduleId === 0;

      const snapshotPerformance = ticketSnapshot.performances.find(
        (performance) => performance.id === decoded.performanceId,
      );
      const snapshotSchedule = ticketSnapshot.schedules.find(
        (schedule) => schedule.id === decoded.scheduleId,
      );
      const snapshotTicketType = (ticketSnapshot.ticketTypes ?? []).find(
        (ticketType) => ticketType.id === decoded.ticketTypeId,
      );
      const snapshotRelationship = (ticketSnapshot.relationships ?? []).find(
        (relationship) => relationship.id === decoded.relationshipId,
      );

      let performanceName = '-';
      let performanceTitle: string | null = null;
      let scheduleName = '-';
      let scheduleDate = '-';
      let scheduleTime = '';
      let scheduleEndTime = '';
      let ticketTypeLabel = snapshotTicketType?.name ?? '-';
      let relationshipName = snapshotRelationship?.name ?? '-';

      if (isAdmissionOnly) {
        performanceName = '入場専用券';
        scheduleName = '';
        const eventDates = (config.date ?? []).filter(
          (date) => typeof date === 'string' && date.length > 0,
        );
        scheduleDate = formatDateText(eventDates);
        scheduleTime = '';
        scheduleEndTime = '';
      } else {
        const startAt = snapshotSchedule?.start_at
          ? new Date(snapshotSchedule.start_at)
          : null;
        const showLengthMinutes = Number(ticketSnapshot.showLengthMinutes ?? 0);
        const endAt =
          startAt && Number.isFinite(showLengthMinutes)
            ? new Date(startAt.getTime() + showLengthMinutes * 60 * 1000)
            : null;

        performanceName = snapshotPerformance?.class_name ?? '-';
        scheduleName = snapshotSchedule?.round_name ?? '-';
        scheduleTime = startAt
          ? startAt.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';
        scheduleEndTime = endAt
          ? endAt.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';
        scheduleDate = startAt
          ? startAt.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
          : '-';
      }

      let usedSnapshotFallback = false;

      try {
        if (isAdmissionOnly) {
          const [ticketTypeRes, relationshipRes] = await Promise.all([
            supabase
              .from('ticket_types')
              .select('name')
              .eq('id', decoded.ticketTypeId)
              .maybeSingle(),
            supabase
              .from('relationships')
              .select('name')
              .eq('id', decoded.relationshipId)
              .maybeSingle(),
          ]);

          if (
            ticketTypeRes.error ||
            relationshipRes.error ||
            !ticketTypeRes.data ||
            !relationshipRes.data
          ) {
            throw new Error('failed_to_fetch_ticket_master');
          }

          ticketTypeLabel = ticketTypeRes.data.name ?? '-';
          relationshipName = relationshipRes.data.name ?? '-';
        } else {
          const [
            ticketTypeRes,
            relationshipRes,
            performanceRes,
            scheduleRes,
            configRes,
          ] = await Promise.all([
            supabase
              .from('ticket_types')
              .select('name')
              .eq('id', decoded.ticketTypeId)
              .maybeSingle(),
            supabase
              .from('relationships')
              .select('name')
              .eq('id', decoded.relationshipId)
              .maybeSingle(),
            supabase
              .from('class_performances')
              .select('class_name, title')
              .eq('id', decoded.performanceId)
              .maybeSingle(),
            supabase
              .from('performances_schedule')
              .select('round_name, start_at')
              .eq('id', decoded.scheduleId)
              .maybeSingle(),
            supabase
              .from('configs')
              .select('show_length')
              .order('id', { ascending: true })
              .limit(1)
              .maybeSingle(),
          ]);

          if (
            ticketTypeRes.error ||
            relationshipRes.error ||
            performanceRes.error ||
            scheduleRes.error ||
            configRes.error ||
            !ticketTypeRes.data ||
            !relationshipRes.data ||
            !performanceRes.data ||
            !scheduleRes.data
          ) {
            throw new Error('failed_to_fetch_ticket_display_data');
          }

          ticketTypeLabel = ticketTypeRes.data.name ?? '-';
          relationshipName = relationshipRes.data.name ?? '-';
          performanceName = performanceRes.data.class_name ?? '-';
          performanceTitle = performanceRes.data.title ?? null;
          scheduleName = scheduleRes.data.round_name ?? '-';

          const startAt = scheduleRes.data.start_at
            ? new Date(scheduleRes.data.start_at)
            : null;
          const showLengthMinutes = Number(configRes.data?.show_length ?? 0);
          const endAt =
            startAt && Number.isFinite(showLengthMinutes)
              ? new Date(startAt.getTime() + showLengthMinutes * 60 * 1000)
              : null;

          scheduleTime = startAt
            ? startAt.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '-';
          scheduleEndTime = endAt
            ? endAt.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '-';
          scheduleDate = startAt
            ? startAt.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })
            : '-';
        }
      } catch {
        usedSnapshotFallback = true;
        nonBlockingErrors.push(
          'チケット詳細の取得に失敗したため、保存済みデータを表示しています。',
        );
      }

      if (usedSnapshotFallback) {
        if (!isAdmissionOnly && (!snapshotPerformance || !snapshotSchedule)) {
          nonBlockingErrors.push(
            '一部の公演情報を最新データから解決できなかったため、表示内容に不足がある可能性があります。',
          );
        }
        if (!snapshotTicketType || !snapshotRelationship) {
          nonBlockingErrors.push(
            '券種または間柄マスタを取得できなかったため、一部項目が「-」表示になる場合があります。',
          );
        }
      }

      const resolvedTicket: TicketDisplay = {
        ...decoded,
        code,
        signature,
        performanceName,
        performanceTitle,
        scheduleName,
        scheduleDate,
        scheduleTime,
        scheduleEndTime,
        ticketTypeLabel,
        relationshipName,
      };
      setTicket(resolvedTicket);
      if (!usedSnapshotFallback) {
        writeTicketDisplayCache(code, resolvedTicket);
      }
      setErrorMessages(nonBlockingErrors);
      setLoading(false);
    };

    void loadTicket();
  }, [code, signature, config.date, token]);

  const ticketUrl = `https://${config.site_url}/t/${token}`;
  const canCancelTicket =
    !loading && !cancelLoading && ticketStatus === 'valid';

  const handleCancelTicket = async () => {
    if (!canCancelTicket) {
      return;
    }

    const shouldCancel = window.confirm(
      'このチケットをキャンセルしますか？この操作は取り消せません。',
    );
    if (!shouldCancel) {
      return;
    }

    setCancelLoading(true);
    const { error } = await supabase.rpc('cancel_own_ticket_by_code', {
      p_code: code,
    });

    if (error) {
      setErrorMessages((previous) => [
        ...previous,
        `キャンセルに失敗しました: ${error.message}`,
      ]);
      setCancelLoading(false);
      return;
    }

    setTicketStatus('cancelled');

    // update cached stores so TicketHistory/Dashboard update with status
    try {
      const {
        writeTicketDisplayCache,
        readTicketDisplayCache,
      } = await import('../../features/tickets/ticketDisplayCache');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = readTicketDisplayCache<Record<string, any>>(code);
      if (existing) {
        existing.status = 'cancelled';
        writeTicketDisplayCache(code, existing);
      }
    } catch (e) {
      // ignore cache update failures
    }
    try {
      const { markCachedTicketCardCancelled } =
        await import('./students/offlineCache.ts');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        markCachedTicketCardCancelled(user.id, code);
      }
    } catch (e) {
      // ignore absence of offline cache or auth issues
    }

    setErrorMessages((previous) => {
      const kept = previous.filter(
        (message) => message !== 'このチケットはキャンセルされています。',
      );
      return [...kept, 'このチケットはキャンセルされています。'];
    });
    setCancelLoading(false);
  };

  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケットを表示</h1>
      <Alert type='warning'>
        <p>必ずスクリーンショットで保存してください。</p>
      </Alert>
      {loading && <p>読み込み中...</p>}
      <div className={styles.ticketContainer}>
        <span className={styles.serialBadge}>#{ticket.serial}</span>
        <h2 className={styles.ticketHeader}>
          <span className={styles.performanceName}>
            {ticket.performanceName}
          </span>
          {ticket.scheduleName && (
            <span className={styles.performanceRound}>
              {ticket.scheduleName}
            </span>
          )}
        </h2>
        {ticket.performanceTitle && (
          <p className={styles.performanceTitle}>
            「{ticket.performanceTitle}」
          </p>
        )}
        {errorMessages.length > 0 && (
          <Alert type='error'>
            {errorMessages.length === 1 ? (
              <p>{errorMessages[0]}</p>
            ) : (
              <ul>
                {errorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        {ticketStatus !== 'cancelled' && (
          <div className={styles.qrSection}>
            <QRCode
              value={token}
              size={Math.min(window.innerWidth * 0.8, 350)}
            />
            <p className={styles.ticketCode}>{code}</p>
          </div>
        )}

        <div className={styles.ticketDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>日時</span>
            <span className={styles.detailValue}>
              {ticket.scheduleDate}
              {ticket.scheduleTime && ticket.scheduleEndTime && (
                <>
                  <br />
                  {ticket.scheduleTime} - {ticket.scheduleEndTime}
                </>
              )}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>券種</span>
            <span className={styles.detailValue}>{ticket.ticketTypeLabel}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>発行者</span>
            <span className={styles.detailValue}>{ticket.affiliation}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>間柄</span>
            <span className={styles.detailValue}>
              {ticket.relationshipName}
            </span>
          </div>
        </div>

        {ticketStatus !== 'cancelled' && (
          <div className={styles.actionSection}>
            <p className={styles.urlContainer}>
              <a href={`/t/${token}`}>{ticketUrl}</a>
            </p>
            <button
              className={styles.copyButton}
              onClick={async () => {
                await navigator.clipboard.writeText(ticketUrl);
                setShowCopySucceed(true);
                setTimeout(() => {
                  setShowCopySucceed(false);
                }, 2000);
              }}
            >
              チケットURLをコピー
            </button>
            <p
              className={styles.copySucceed}
              style={{ opacity: showCopySucceed ? 1 : 0 }}
            >
              コピーしました
            </p>
            <button
              className={styles.cancelButton}
              disabled={!canCancelTicket}
              onClick={handleCancelTicket}
            >
              <MdClose />
              {cancelLoading ? 'キャンセル中...' : 'チケットをキャンセル'}
            </button>
          </div>
        )}
      </div>

      <section>
        <h3>注意事項</h3>
        <ul className={styles.notes}>
          <li>
            このQRコードをスクリーンショットで保存し、当日読み取り端末にかざしてご入場ください。
          </li>
          <li>
            他の人に共有する場合は、QRコードのスクリーンショットまたはURLを送信してください。
          </li>
          <li>この券で、校内入場や展示部活を見ることも可能です。</li>
          <li>
            このQRコード1枚につき、一人まで入場可能です。ただし、他の座席を使用しない場合は乳児と同伴可能です。
          </li>
          <li>
            このページで発券されたチケットは、外苑祭当日、入場時に必要となります。忘れずに持参してください。
          </li>
        </ul>
      </section>
    </>
  );
};

export default Ticket;
