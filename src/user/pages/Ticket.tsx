import { useEffect, useState } from 'preact/hooks';
import { useParams } from 'wouter-preact';
import { navigate } from 'wouter-preact/use-browser-location';

import Alert from '../../components/ui/Alert';
import QRCode from '../../components/ui/QRCode';
import { useEventConfig } from '../../hooks/useEventConfig';
import { supabase } from '../../lib/supabase';
import { decodeTicketCode } from '@ticket-codec';

import pageStyles from '../../styles/sub-pages.module.css';
import styles from './Ticket.module.css';

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

const TICKET_CACHE_PREFIX = 'ticket-display-cache:v1:';
const getTicketCacheKey = (code: string): string =>
  `${TICKET_CACHE_PREFIX}${code}`;

const publicKeyToArrayBuffer = (keyText: string): ArrayBuffer => {
  const trimmed = keyText.trim();
  const base64 = trimmed.replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const decodeBase64Url = (value: string): Uint8Array => {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const signingPublicKeyPromise = crypto.subtle.importKey(
  'spki',
  publicKeyToArrayBuffer(
    import.meta.env.VITE_TICKET_SIGNING_PUBLIC_KEY_ED25519_BASE64,
  ),
  { name: 'Ed25519' },
  false,
  ['verify'],
);

const verifyTicketSignature = async (
  code: string,
  signature: string,
): Promise<boolean> => {
  try {
    const key = await signingPublicKeyPromise;
    const payload = new TextEncoder().encode(code);
    const signatureBytes = decodeBase64Url(signature);

    return await crypto.subtle.verify(
      'Ed25519',
      key,
      toArrayBuffer(signatureBytes),
      payload,
    );
  } catch {
    return false;
  }
};

const toDecodedSeed = (
  decoded: Awaited<ReturnType<typeof decodeTicketCode>>,
): DecodedTicketSeed | null => {
  if (!decoded) {
    return null;
  }

  return {
    affiliation: String(decoded.affiliation).padStart(4, '0'),
    ticketTypeId: decoded.type,
    relationshipId: decoded.relationship,
    performanceId: decoded.performance,
    scheduleId: decoded.schedule,
    year: String(decoded.year).padStart(2, '0'),
  };
};

const readTicketCache = (code: string): TicketDisplay | null => {
  try {
    const raw = localStorage.getItem(getTicketCacheKey(code));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { ticket?: TicketDisplay };

    return parsed.ticket ?? null;
  } catch {
    return null;
  }
};

const writeTicketCache = (code: string, ticket: TicketDisplay): void => {
  localStorage.setItem(
    getTicketCacheKey(code),
    JSON.stringify({
      ticket,
      cachedAt: Date.now(),
    }),
  );
};

const checkTicketValidity = async (code: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('tickets')
    .select('status')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    return `チケットの有効性確認に失敗しました。デバイスがオフラインの場合、または障害が発生している場合は、このエラーが発生する可能性があります。
    これが正規のQRコードであれば、そのままご入場いただけます。オンラインでこのエラーが表示される場合は、外苑祭総務にお問い合わせください。`;
  }

  const status = (data as { status?: string } | null)?.status;

  if (status === 'used') {
    return 'このチケットはすでに使用されています。';
  }
  if (status === 'cancelled') {
    return 'このチケットはキャンセルされています。';
  }
  if (!status) {
    return 'このチケットは存在しないか、無効です。';
  }
  if (status !== 'valid') {
    return 'このチケットは無効です。';
  }

  return null;
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
  const [ticket, setTicket] = useState<TicketDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

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
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessages([]);
      const nonBlockingErrors: string[] = [];

      const [decodedRaw, signatureIsValid] = await Promise.all([
        decodeTicketCode(code, {
          ticketSigningPrivateKeyMacBase64: import.meta.env
            .VITE_TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64,
          ticketSigningPrivateKeyCipherBase64: import.meta.env
            .VITE_TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64,
          base58Alphabet: import.meta.env.VITE_BASE58_ALPHABET,
        }),
        verifyTicketSignature(code, signature),
      ]);
      const decoded = toDecodedSeed(decodedRaw);

      if (!decoded) {
        setErrorMessages(['チケット情報の復元に失敗しました。']);
        setLoading(false);
        return;
      }

      if (!signatureIsValid) {
        nonBlockingErrors.push(
          'チケット署名の検証に失敗しました。不正なチケットの可能性があります。',
        );
      }

      const cached = readTicketCache(code);
      if (cached) {
        setTicket({ ...cached, signature });
        const validityError = await checkTicketValidity(code);
        if (validityError) {
          nonBlockingErrors.push(validityError);
        }
        setErrorMessages(nonBlockingErrors);
        setLoading(false);
        return;
      }

      const [ticketTypeRes, relationshipRes, validityError] = await Promise.all(
        [
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
          checkTicketValidity(code),
        ],
      );

      if (ticketTypeRes.error || relationshipRes.error) {
        setErrorMessages(['チケット情報の取得に失敗しました。']);
        setLoading(false);
        return;
      }

      if (validityError) {
        nonBlockingErrors.push(validityError);
      }

      const isAdmissionOnly =
        decoded.performanceId === 0 && decoded.scheduleId === 0;

      let performanceName = '-';
      let performanceTitle: string | null = null;
      let scheduleName = '-';
      let scheduleDate = '-';
      let scheduleTime = '-';
      let scheduleEndTime = '-';

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
        const [performanceRes, scheduleRes, configRes] = await Promise.all([
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

        if (performanceRes.error || scheduleRes.error || configRes.error) {
          setErrorMessages(['チケット情報の取得に失敗しました。']);
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

        performanceName = performanceRes.data?.class_name ?? '-';
        performanceTitle = performanceRes.data?.title ?? null;
        scheduleName = scheduleRes.data?.round_name ?? '-';
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
        ticketTypeLabel: ticketTypeRes.data?.name ?? '-',
        relationshipName: relationshipRes.data?.name ?? '-',
      };
      setTicket(resolvedTicket);
      writeTicketCache(code, resolvedTicket);
      setErrorMessages(nonBlockingErrors);
      setLoading(false);
    };

    void loadTicket();
  }, [code, signature, config.date, token]);

  const ticketUrl = `https://${config.site_url}/t/${token}`;

  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケットを表示</h1>
      <Alert type='warning'>
        <p>必ずスクリーンショットで保存してください。</p>
      </Alert>
      {loading ? (
        <p>読み込み中...</p>
      ) : !ticket ? (
        <p>チケットが見つかりません。</p>
      ) : (
        <div className={styles.ticketContainer}>
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
