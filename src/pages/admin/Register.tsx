import { useEffect, useState } from 'preact/hooks';
import baseStyles from '../../styles/sub-pages.module.css';
import styles from './Register.module.css';
import {
  decodeAndVerifyTicket,
  type TicketDecodedDisplaySeed,
} from '../../features/tickets/ticketCodeDecode';
import Alert from '../../components/ui/Alert';
import {
  preloadScanTicketMaster,
  resolveScanTicketDisplay,
  type ResolvedScanTicketDisplay,
  type ScanTicketMaster,
} from '../../features/tickets/scanTicketMaster';
import { FaCircleCheck, FaCircleXmark } from 'react-icons/fa6';

const RESULT_CLEAR_DELAY_MS = 4000;
const RESULT_EXIT_DURATION_MS = 1000;

const Register = () => {
  const [scannedValue, setScannedValue] = useState<string>();
  const [decodedTicket, setDecodedTicket] =
    useState<TicketDecodedDisplaySeed | null>(null);
  const [resolvedTicket, setResolvedTicket] =
    useState<ResolvedScanTicketDisplay | null>(null);
  const [decodeError, setDecodeError] = useState<string>();
  const [ticketMaster, setTicketMaster] = useState<ScanTicketMaster | null>(
    null,
  );

  const [shouldRenderResultCard, setShouldRenderResultCard] = useState(false);
  const [isResultCardExiting, setIsResultCardExiting] = useState(false);
  const [autoHideRequested, setAutoHideRequested] = useState(false);

  const hasResultContent =
    Boolean(decodedTicket || decodeError || scannedValue) && !autoHideRequested;

  useEffect(() => {
    let timeoutId: number | null = null;

    if (hasResultContent) {
      setShouldRenderResultCard(true);
      setIsResultCardExiting(false);
      return () => {
        // noop
      };
    }

    if (!shouldRenderResultCard) {
      return () => {
        // noop
      };
    }

    setIsResultCardExiting(true);
    timeoutId = window.setTimeout(() => {
      setShouldRenderResultCard(false);
      setIsResultCardExiting(false);
    }, 1000);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hasResultContent, shouldRenderResultCard]);

  useEffect(() => {
    if (!hasResultContent) {
      return () => {
        // noop
      };
    }

    const timeoutId = window.setTimeout(
      () => setAutoHideRequested(true),
      RESULT_CLEAR_DELAY_MS,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasResultContent]);

  useEffect(() => {
    if (!autoHideRequested) {
      return () => {
        // noop
      };
    }

    const timeoutId = window.setTimeout(() => {
      setDecodedTicket(null);
      setResolvedTicket(null);
      setDecodeError(undefined);
      setScannedValue('');
      setAutoHideRequested(false);
    }, RESULT_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoHideRequested]);

  const handleRegister = async (event: Event) => {
    setAutoHideRequested(false);
    event.preventDefault();
    if (!scannedValue) {
      return null;
    }
    try {
      const [code, signature] = scannedValue.split('.');
      if (!code || !signature) {
        setDecodeError(
          'QRコードは読めましたが、チケットコードとしては不正な形式です。',
        );
        return;
      }
      const { decoded, signatureIsValid } = await decodeAndVerifyTicket(
        code,
        signature,
      );

      if (!decoded) {
        setDecodeError(
          'デコードに失敗しました。チケットコードが正しいか確認してください。',
        );
        return;
      }

      if (!signatureIsValid) {
        setDecodeError(
          'チケットコードの署名が無効です。正規のコードをスキャンしてください。',
        );
        return;
      }

      const ticketStatus = await useTicket(code);

      if (ticketStatus === 'success') {
        setDecodedTicket(decoded);

        let master = ticketMaster;
        if (!master) {
          try {
            master = await preloadScanTicketMaster();
            setTicketMaster(master);
          } catch {
            master = null;
          }
        }

        if (master) {
          setResolvedTicket(resolveScanTicketDisplay(decoded, master));
        }
      } else if (ticketStatus === 'duplicate') {
        setDecodeError('このチケットは使用済みです。');
      } else {
        setDecodeError('使用済みかどうかを確認する際にエラーが発生しました。');
      }
    } catch (e) {
      setDecodeError(
        'QRコードは読めましたが、チケットコードの検証に失敗しました。',
      );
    }
  };

  async function useTicket(ticketId: string) {
    const res = await fetch('http://localhost:8000', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: ticketId,
      }),
    });

    const result = await res.json();

    return result.status;
  }

  return (
    <div>
      <h1 className={baseStyles.pageTitle}>校内入場</h1>
      <section>
        <form onSubmit={handleRegister} className={styles.form}>
          <label className={styles.formLabel}>チケットコード</label>
          <input
            className={styles.textInput}
            type='text'
            value={scannedValue}
            onChange={(e) => {
              setAutoHideRequested(false);
              setScannedValue(e.currentTarget.value);
            }}
          />
          <button type='submit' className={styles.submitButton}>
            登録
          </button>
        </form>
      </section>
      {shouldRenderResultCard && decodedTicket && (
        <>
          <div className={styles.resultSuccessOverlay}></div>
          <section
            className={`${styles.resultCard} ${
              isResultCardExiting
                ? styles.resultCardExit
                : styles.resultCardEnter
            }`}
          >
            <h2 className={styles.resultTitle}>
              <FaCircleCheck />
              読み取り成功
            </h2>
            <div className={styles.resultBody}>
              <p className={styles.primaryPerformance}>
                {resolvedTicket?.performanceName ?? '公演情報を解決中...'}
                <span className={styles.scheduleName}>
                  {resolvedTicket?.scheduleName || '回情報なし'}
                </span>
              </p>

              <div className={styles.secondaryRow}>
                <span className={styles.secondaryItem}>
                  券種: {resolvedTicket?.ticketTypeLabel ?? '-'}
                </span>
                <span className={styles.secondaryItem}>
                  間柄: {resolvedTicket?.relationshipName ?? '-'}
                </span>
                <span className={styles.secondaryItem}>
                  所属: {decodedTicket.affiliation}
                </span>
              </div>

              <div className={styles.tertiaryBlock}>
                {resolvedTicket?.performanceTitle && (
                  <p className={styles.tertiaryLine}>
                    演目: {resolvedTicket.performanceTitle}
                  </p>
                )}
                {resolvedTicket &&
                  (resolvedTicket.scheduleDate ||
                    resolvedTicket.scheduleTime ||
                    resolvedTicket.scheduleEndTime) && (
                    <p className={styles.tertiaryLine}>
                      日時: {resolvedTicket.scheduleDate}
                      {resolvedTicket.scheduleTime &&
                      resolvedTicket.scheduleEndTime
                        ? ` ${resolvedTicket.scheduleTime} - ${resolvedTicket.scheduleEndTime}`
                        : ''}
                    </p>
                  )}
                {scannedValue && (
                  <>
                    <p className={styles.rawValue}>
                      チケットコード: {scannedValue.split('.')[0]}
                    </p>
                    <p className={styles.rawValue}>
                      読み取り時刻: {new Date().toLocaleString()}
                    </p>
                    <p className={styles.rawValue}>Raw: {scannedValue}</p>
                  </>
                )}
                <div className={styles.instructionBlock}>
                  <p>ようこそ!係員の指示に従ってご入場ください。</p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {shouldRenderResultCard && decodeError && (
        <>
          <div className={styles.resultErrorOverlay}></div>
          <section
            className={`${styles.resultCard} ${isResultCardExiting ? styles.resultCardExit : styles.resultCardEnter} ${styles.resultCardError}`}
          >
            <h2 className={styles.resultTitle}>
              <FaCircleXmark />
              読み取り失敗
            </h2>
            <Alert type='error' className={styles.errorText}>
              {decodeError}
            </Alert>
            <div className={styles.tertiaryBlock}>
              <p className={styles.rawValue}>Raw: {scannedValue}</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Register;
