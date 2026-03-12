import { useEffect, useRef, useState } from 'preact/hooks';
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

const STORAGE_KEY = 'scan_server_url';

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

  const [localServerUrl, setLocalServerUrl] = useState<string>();
  const [showServerModal, setShowServerModal] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const inputServerRef = useRef<HTMLInputElement>(null);

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
      return;
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

    return result.status;
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
    </div>
  );
};

export default Register;
