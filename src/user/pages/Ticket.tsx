import { useEffect, useState } from 'preact/hooks';
import { useParams } from 'wouter-preact';
import { navigate } from 'wouter-preact/use-browser-location';

import Alert from '../../components/ui/Alert';
import QRCode from '../../components/ui/QRCode';
import { useEventConfig } from '../../hooks/useEventConfig';
import { supabase } from '../../lib/supabase';

import pageStyles from '../../styles/sub-pages.module.css';
import styles from './Ticket.module.css';

const BASE58_ALPHABET = import.meta.env.VITE_BASE58_ALPHABET;
type DecodedTicketSeed = {
  affiliation: string;
  ticketTypeId: number;
  relationshipId: number;
  performanceId: number;
  scheduleId: number;
  year: string;
};

type TicketDisplay = DecodedTicketSeed & {
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
};

const decodeBase58 = (value: string): bigint | null => {
  let result = 0n;

  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) {
      return null;
    }
    result = result * 58n + BigInt(index);
  }

  return result;
};

const parseFromCode = (code: string): DecodedTicketSeed | null => {
  const candidateLengths = [8, 7, 6, 5];

  for (const prefixLength of candidateLengths) {
    if (code.length <= prefixLength) {
      continue;
    }

    const prefix = code.slice(0, prefixLength);
    const decoded = decodeBase58(prefix);

    if (decoded === null) {
      continue;
    }

    const padded = decoded.toString().padStart(12, '0');
    if (padded.length !== 12) {
      continue;
    }

    const ticketTypeId = Number(padded.slice(4, 5));
    const relationshipId = Number(padded.slice(5, 6));
    const performanceId = Number(padded.slice(6, 8));
    const scheduleId = Number(padded.slice(8, 10));

    if (
      ticketTypeId <= 0 ||
      relationshipId <= 0 ||
      performanceId <= 0 ||
      scheduleId <= 0
    ) {
      continue;
    }

    return {
      affiliation: padded.slice(0, 4),
      ticketTypeId,
      relationshipId,
      performanceId,
      scheduleId,
      year: padded.slice(10, 12),
    };
  }

  return null;
};

const Ticket = () => {
  const { config } = useEventConfig();
  const params = useParams();
  const [showCopySucceed, setShowCopySucceed] = useState(false);
  const [ticket, setTicket] = useState<TicketDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = params.id;

  if (!token) {
    navigate('/');
    return null;
  }

  const [code, signature] = token.split('.');

  useEffect(() => {
    const loadTicket = async () => {
      if (!code || !signature) {
        setErrorMessage('チケットURLの形式が正しくありません。');
        setLoading(false);
        return;
      }

      const decoded = parseFromCode(code);
      if (!decoded) {
        setErrorMessage('チケット情報の復元に失敗しました。');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      const [
        performanceRes,
        scheduleRes,
        ticketTypeRes,
        relationshipRes,
        configRes,
      ] = await Promise.all([
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
          .from('configs')
          .select('show_length')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (
        performanceRes.error ||
        scheduleRes.error ||
        ticketTypeRes.error ||
        relationshipRes.error ||
        configRes.error
      ) {
        setErrorMessage('チケット情報の取得に失敗しました。');
        setLoading(false);
        return;
      }

      const startAt = scheduleRes.data?.start_at
        ? new Date(scheduleRes.data.start_at)
        : null;
      const showLengthMinutes = Number(configRes.data?.show_length ?? 0);
      const endAt =
        startAt && Number.isFinite(showLengthMinutes)
          ? new Date(startAt.getTime() + showLengthMinutes * 60 * 1000)
          : null;

      setTicket({
        ...decoded,
        code,
        signature,
        performanceName: performanceRes.data?.class_name ?? '-',
        performanceTitle: performanceRes.data?.title ?? null,
        scheduleName: scheduleRes.data?.round_name ?? '-',
        scheduleTime: startAt
          ? startAt.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-',
        scheduleEndTime: endAt
          ? endAt.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-',
        scheduleDate: startAt
          ? startAt.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
          : '-',
        ticketTypeLabel: ticketTypeRes.data?.name ?? '-',
        relationshipName: relationshipRes.data?.name ?? '-',
      });
      setLoading(false);
    };

    void loadTicket();
  }, [code, signature]);

  const ticketUrl = `https://${config.site_url}/t/${token}`;

  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケットを表示</h1>
      <Alert type='warning'>
        <p>必ずスクリーンショットで保存してください。</p>
      </Alert>
      {loading ? (
        <p>読み込み中...</p>
      ) : errorMessage || !ticket ? (
        <p>{errorMessage ?? 'チケットが見つかりません。'}</p>
      ) : (
        <div className={styles.ticketContainer}>
          <h2 className={styles.ticketHeader}>
            <span className={styles.performanceName}>
              {ticket.performanceName}
            </span>
            <span className={styles.performanceRound}>
              {ticket.scheduleName}
            </span>
          </h2>
          {ticket.performanceTitle && (
            <p className={styles.performanceTitle}>
              「{ticket.performanceTitle}」
            </p>
          )}

          <div className={styles.qrSection}>
            <QRCode
              value={token}
              size={Math.min(window.innerWidth * 0.8, 350)}
            />
            <p className={styles.ticketCode}>{ticket.code}</p>
          </div>

          <div className={styles.ticketDetails}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>日時</span>
              <span className={styles.detailValue}>
                {ticket.scheduleDate}
                <br />
                {ticket.scheduleTime} - {ticket.scheduleEndTime}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>券種</span>
              <span className={styles.detailValue}>
                {ticket.ticketTypeLabel}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>発行</span>
              <span className={styles.detailValue}>
                {ticket.affiliation} / {ticket.relationshipName}
              </span>
            </div>
          </div>

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
          </div>
        </div>
      )}
      <section>
        <h3>注意事項</h3>
        <ul className={styles.notes}>
          <li>
            このQRコードをスクリーンショットで保存し、当日読み取り端末にかざしてご入場ください。
          </li>
          <li>
            他の人に共有する場合は、QRコードのスクリーンショットまたはURLを送信してください。
          </li>
          <li>
            この券で、校内入場や展示部活を見ることも可能です。
          </li>
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
