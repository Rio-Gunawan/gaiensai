import { useEffect, useRef, useState } from 'preact/hooks';
import baseStyles from '../../styles/sub-pages.module.css';
import styles from './Register.module.css';
import {
  decodeAndVerifyTicket,
  decodeTicketCodeWithEnv,
  toTicketDecodedDisplaySeed,
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

const STORAGE_KEY = 'scan_server_url';

async function logTicketToServer(
  code: string,
  result: string,
  localServerUrl?: string,
) {
  if (!localServerUrl) {
    return;
  }
  try {
    let url = localServerUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    url = url.replace(/\/+$/, '');

    await fetch(url + '/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: code.replace('-', ''),
        result,
      }),
    });
  } catch {
    // ログ送信失敗は無視
  }
}

type DuplicateInfo = {
  ticketUsedAt: string;
  lastUsedAt: Date | null;
  isRecent: boolean;
};

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

  const [showReentryModal, setShowReentryModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(
    null,
  );
  const [isReentryResult, setIsReentryResult] = useState(false);

  const [shouldRenderResultCard, setShouldRenderResultCard] = useState(false);
  const [isResultCardExiting, setIsResultCardExiting] = useState(false);
  const [autoHideRequested, setAutoHideRequested] = useState(false);

  const [localServerUrl, setLocalServerUrl] = useState<string>();
  const [showServerModal, setShowServerModal] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState<string>('');
  const [showMissingSignatureModal, setShowMissingSignatureModal] =
    useState(false);

  const [pendingFullCode, setPendingFullCode] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const inputServerRef = useRef<HTMLInputElement>(null);
  const pendingDecodedRef = useRef<TicketDecodedDisplaySeed | null>(null);

  const hasResultContent =
    Boolean(decodedTicket || decodeError || scannedValue) && !autoHideRequested;

  const focus = () => {
    if (showServerModal) {
      setTimeout(() => inputServerRef.current?.focus(), 10);
      inputRef.current?.blur();
    } else {
      setTimeout(() => inputRef.current?.focus(), 10);
      inputServerRef.current?.blur();
    }
  };

  useEffect(() => {
    if (showServerModal) {
      inputServerRef.current?.focus();
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
      inputServerRef.current?.blur();
    }

    document.addEventListener('click', focus);
    return () => {
      document.removeEventListener('click', focus);
    };
  }, [showServerModal]);

  // ローカルストレージから URL を読み込み、初回設定をチェック
  useEffect(() => {
    const savedUrl = localStorage.getItem(STORAGE_KEY);
    if (savedUrl) {
      setLocalServerUrl(savedUrl);
      setTempServerUrl(savedUrl);
    } else {
      // URL が未設定の場合、モーダルを表示
      setShowServerModal(true);
    }
  }, []);

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

    // Modalが表示されている場合はタイマーを開始しない
    if (showReentryModal || showMissingSignatureModal || showServerModal) {
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
  }, [
    hasResultContent,
    showReentryModal,
    showMissingSignatureModal,
    showServerModal,
  ]);

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

  const handleResolvedTicket = async (
    decoded: TicketDecodedDisplaySeed,
    options?: { reentry?: boolean },
  ) => {
    setIsReentryResult(Boolean(options?.reentry));
    setDecodeError(undefined);
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
  };

  const handleRegister = async (event: Event) => {
    setAutoHideRequested(false);
    event.preventDefault();
    if (!scannedValue) {
      return null;
    }

    try {
      const [code, signature] = scannedValue.split('.');
      if (!code) {
        await logTicketToServer(scannedValue, 'failed', localServerUrl);
        setDecodeError(
          'QRコードは読めましたが、チケットコードとしては不正な形式です。',
        );
        return;
      }

      if (!signature) {
        setPendingFullCode(scannedValue);
        setShowMissingSignatureModal(true);
        return;
      }

      const { decoded, signatureIsValid } = await decodeAndVerifyTicket(
        code,
        signature,
      );

      if (!decoded) {
        await logTicketToServer(scannedValue, 'failed', localServerUrl);
        setDecodeError(
          'デコードに失敗しました。チケットコードが正しいか確認してください。',
        );
        return;
      }

      if (!signatureIsValid) {
        await logTicketToServer(scannedValue, 'unverified', localServerUrl);
        setDecodeError(
          'チケットコードの署名が無効です。正規のコードをスキャンしてください。',
        );
        return;
      }

      const { ticketStatus, ticketUsedAt, lastUsedAt } = await useTicket(code);

      await processTicketStatus(
        decoded,
        ticketStatus,
        ticketUsedAt,
        lastUsedAt,
        scannedValue,
      );
    } catch (e) {
      await logTicketToServer(scannedValue, 'failed', localServerUrl);
      setDecodeError(
        'QRコードは読めましたが、チケットコードの検証に失敗しました。',
      );
    }
  };

  const processTicketStatus = async (
    decoded: TicketDecodedDisplaySeed,
    ticketStatus: string | null,
    ticketUsedAt: string | null,
    lastUsedAt: Date | null,
    code: string,
  ) => {
    if (ticketStatus === 'success') {
      pendingDecodedRef.current = null;
      setDuplicateInfo(null);
      await handleResolvedTicket(decoded);
      await logTicketToServer(code, 'success', localServerUrl);
      return;
    }

    if (ticketStatus === 'duplicate') {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const wasBeforeToday = Boolean(lastUsedAt && lastUsedAt < startOfToday);

      if (wasBeforeToday) {
        pendingDecodedRef.current = null;
        setDuplicateInfo(null);
        await logTicketToServer(code, 'reentry', localServerUrl);
        await handleResolvedTicket(decoded, { reentry: true });
        return;
      }

      pendingDecodedRef.current = decoded;
      const isRecent =
        lastUsedAt !== null &&
        now.getTime() - lastUsedAt.getTime() <= 5 * 60 * 1000;

      setDuplicateInfo({
        ticketUsedAt: ticketUsedAt ?? '不明',
        lastUsedAt,
        isRecent,
      });
      setShowReentryModal(true);
      return;
    }

    setDecodeError('使用済みかどうかを確認する際にエラーが発生しました。');
    await logTicketToServer(code, 'failed', localServerUrl);
  };

  const handleReentryConfirm = async () => {
    setShowReentryModal(false);
    setDuplicateInfo(null);
    const decoded = pendingDecodedRef.current;
    pendingDecodedRef.current = null;
    if (!decoded) {
      return;
    }
    const code = scannedValue?.split('.')[0];
    if (code) {
      await logTicketToServer(scannedValue, 'reentry', localServerUrl);
    }
    await handleResolvedTicket(decoded, { reentry: true });
  };

  const handleReentryCancel = async () => {
    setShowReentryModal(false);
    pendingDecodedRef.current = null;
    setDuplicateInfo(null);
    setDecodeError('再入場はキャンセルされました。');
    if (scannedValue) {
      await logTicketToServer(scannedValue, 'duplicate', localServerUrl);
    }
  };

  const handleMissingSignatureContinue = async () => {
    setShowMissingSignatureModal(false);
    if (!pendingFullCode) {
      return;
    }

    setAutoHideRequested(false);

    try {
      const pendingSignatureCode = pendingFullCode
        .split('.')[0]
        .replace('-', '');
      const decodedRaw = await decodeTicketCodeWithEnv(pendingSignatureCode);
      const decoded = toTicketDecodedDisplaySeed(decodedRaw);

      if (!decoded) {
        await logTicketToServer(pendingFullCode, 'failed', localServerUrl);
        setDecodeError(
          'デコードに失敗しました。チケットコードが正しいか確認してください。',
        );
        return;
      }

      const { ticketStatus, ticketUsedAt, lastUsedAt } =
        await useTicket(pendingSignatureCode);

      await processTicketStatus(
        decoded,
        ticketStatus,
        ticketUsedAt,
        lastUsedAt,
        pendingSignatureCode,
      );
    } catch {
      await logTicketToServer(pendingFullCode, 'failed', localServerUrl);
      setDecodeError(
        'QRコードは読めましたが、チケットコードの検証に失敗しました。',
      );
    } finally {
      setPendingFullCode('');
    }
  };

  const handleMissingSignatureCancel = () => {
    setShowMissingSignatureModal(false);
    setPendingFullCode('');
    setDecodeError(
      'チケットコードの署名が無効です。正規のコードをスキャンしてください。',
    );
  };

  const handleSaveServerUrl = () => {
    if (tempServerUrl.trim()) {
      localStorage.setItem(STORAGE_KEY, tempServerUrl);
      setLocalServerUrl(tempServerUrl);
      setShowServerModal(false);
    }
  };

  function buildApiUrl(localServerUrl: string) {
    let url = localServerUrl.trim();

    // http:// または https:// が無ければ追加
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }

    // 末尾の / を削除
    url = url.replace(/\/+$/, '');

    return url + '/api';
  }

  const handleOpenServerModal = () => {
    setTempServerUrl(localServerUrl || '');
    setShowServerModal(true);
  };

  async function useTicket(ticketId: string) {
    if (!localServerUrl) {
      setDecodeError('ローカルサーバーのURLを入力してください。');
      return { ticketStatus: null, ticketUsedAt: null, lastUsedAt: null };
    }
    const res = await fetch(buildApiUrl(localServerUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: ticketId,
      }),
    });

    const result = await res.json();

    const ticketStatus = result.status as string;
    const usedAt =
      result.usedAt && !Number.isNaN(new Date(result.usedAt).getTime())
        ? new Date(result.usedAt)
        : null;
    const ticketUsedAt = usedAt ? usedAt.toLocaleString() : '不明';

    return { ticketStatus, ticketUsedAt, lastUsedAt: usedAt };
  }

  return (
    <div className={styles.pageShell}>
      <h1 className={baseStyles.pageTitle}>校内入場</h1>
      <section className={styles.serverSection}>
        <div className={styles.serverUrlDisplay}>
          <p className={styles.serverUrlLabel}>
            同期サーバー:
            <span className={styles.serverUrl}>{localServerUrl}</span>
          </p>
          <button
            type='button'
            className={styles.changeButton}
            onClick={handleOpenServerModal}
          >
            変更
          </button>
        </div>
      </section>

      <section>
        <form onSubmit={handleRegister} className={styles.form}>
          <label className={styles.formLabel} htmlFor='ticket-code'>
            チケットコード
          </label>
          <input
            ref={inputRef}
            onBlur={focus}
            autoFocus
            id='ticket-code'
            className={styles.textInput}
            type='text'
            value={scannedValue}
            disabled={showServerModal}
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
          <div
            className={`${styles.resultSuccessOverlay} ${
              isReentryResult ? styles.resultSuccessOverlayReentry : ''
            }`}
          ></div>
          <section
            className={`${styles.resultCard} ${
              isResultCardExiting
                ? styles.resultCardExit
                : styles.resultCardEnter
            } ${isReentryResult ? styles.resultCardReentry : ''}`}
          >
            <h2 className={styles.resultTitle}>
              <FaCircleCheck />
              読み取り成功{isReentryResult && ' (再入場)'}
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

      {showServerModal && (
        <div className={styles.modalOverlay} onClick={() => undefined}>
          <div className={styles.modalContainer}>
            <div className={styles.modalContent}>
              <h2 className={styles.modalTitle}>
                読み取り履歴同期サーバーの設定
              </h2>
              <p>
                親となるコンピューターで付属のserver.exeを実行してローカルサーバーを立てた上で、そのURLを入力してください。
              </p>
              <label className={styles.formLabel} htmlFor='server-url-input'>
                サーバーURL
              </label>
              <input
                ref={inputServerRef}
                onBlur={focus}
                id='server-url-input'
                className={styles.textInput}
                type='text'
                value={tempServerUrl}
                onChange={(e) => setTempServerUrl(e.currentTarget.value)}
                placeholder='http://127.0.0.1:8000'
                disabled={!showServerModal}
                autoFocus
              />
              <div className={styles.modalButtonGroup}>
                <button
                  type='button'
                  className={styles.submitButton}
                  onClick={handleSaveServerUrl}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showMissingSignatureModal && (
        <div className={styles.modalOverlay} onClick={() => undefined}>
          <div
            className={styles.modalContainer}
            role='dialog'
            aria-modal='true'
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalContent}>
              <h2 className={styles.modalTitle}>署名がありません</h2>
              <p className={styles.modalDescription}>
                QRコードの署名が入力されていません。QRコード下のコードを手入力した場合は問題ありません。通常通りQRコードをスキャナで読み取った場合は、このチケットが不正な可能性があります。続行しますか?
              </p>
              <div className={styles.modalButtonGroup}>
                <button
                  type='button'
                  className={styles.modalSecondaryButton}
                  onClick={handleMissingSignatureCancel}
                >
                  キャンセル
                </button>
                <button
                  type='button'
                  className={styles.submitButton}
                  onClick={handleMissingSignatureContinue}
                >
                  続行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showReentryModal &&
        duplicateInfo &&
        (() => {
          let timeAgo = '';
          if (duplicateInfo.lastUsedAt) {
            const diffMinutes = Math.floor(
              (new Date().getTime() - duplicateInfo.lastUsedAt.getTime()) /
                (1000 * 60),
            );
            if (diffMinutes >= 60) {
              const diffHours = Math.floor(diffMinutes / 60);
              timeAgo = `${diffHours}時間${diffMinutes % 60}分前`;
            } else if (diffMinutes >= 1) {
              timeAgo = `${diffMinutes}分前`;
            } else if (diffMinutes < 1) {
              timeAgo = '1分未満前';
            } else {
              timeAgo = `${diffMinutes}分前`;
            }
          }
          return (
            <div className={styles.modalOverlay} onClick={() => undefined}>
              <div
                className={styles.modalContainer}
                role='dialog'
                aria-modal='true'
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.modalContent}>
                  <h2 className={styles.modalTitle}>
                    このチケットは使用済みです
                  </h2>
                  <p className={styles.modalDescription}>
                    このチケットは使用済みです。再入場として処理しますか?
                  </p>
                  <p className={styles.modalDescription}>
                    前回の使用時間: {duplicateInfo.ticketUsedAt}
                    {timeAgo && ` (${timeAgo})`}
                  </p>
                  {duplicateInfo.isRecent && (
                    <Alert type='warning'>
                      このチケットは直近に使用されたばかりです。
                    </Alert>
                  )}
                  <div className={styles.modalButtonGroup}>
                    <button
                      type='button'
                      className={styles.modalSecondaryButton}
                      onClick={handleReentryCancel}
                    >
                      キャンセル
                    </button>
                    <button
                      type='button'
                      className={styles.submitButton}
                      onClick={handleReentryConfirm}
                    >
                      再入場
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default Register;
