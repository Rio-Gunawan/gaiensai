import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
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
import { FaCircleCheck, FaCircleXmark, FaMinus, FaPlus } from 'react-icons/fa6';
import { TiDelete } from 'react-icons/ti';
import { ServerUrlModal } from '../../components/admin/ServerUrlModal';
import {
  SCAN_SERVER_URL_STORAGE_KEY,
  isScanServerUnavailableError,
  clampCount,
  deleteScanRecordOnServer,
  fetchEntryCountFromServer,
  fetchScanRecordsFromServer,
  logTicketToServer as postTicketLogToServer,
  useTicketOnServer,
  updateRecordCountOnServer,
  updateReentryCountOnServer,
  type ScanRecord,
} from '../../features/admin/scanSync';
import {
  appendScanRecordToCache,
  clearPendingOperationsForLog,
  dropPendingOperation,
  enqueuePendingCountUpdate,
  enqueuePendingDeleteLog,
  enqueuePendingScanLog,
  estimateEntryCountFromRecords,
  inferOfflineTicketStatus,
  getPendingOperationCount,
  readCachedScanRecords,
  readPendingSyncOperations,
  removeCachedRecord,
  replaceCachedRecordId,
  replaceCachedRecordsWithServerRecords,
  updateCachedRecordCount,
  updatePendingScanLogCount,
} from '../../features/admin/offlineScanCache';

const RESULT_CLEAR_DELAY_MS = 4000;
const RESULT_EXIT_DURATION_MS = 1000;

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
  const [showMissingSignatureModal, setShowMissingSignatureModal] =
    useState(false);
  const [showDeleteLogModal, setShowDeleteLogModal] = useState(false);
  const [pendingDeleteLogId, setPendingDeleteLogId] = useState<number | null>(
    null,
  );

  const [pendingFullCode, setPendingFullCode] = useState<string>('');

  const [entryCount, setEntryCount] = useState<number>(0);
  const [entryCountValue, setEntryCountValue] = useState<number>(1);
  const [currentLogId, setCurrentLogId] = useState<number | null>(null);
  const [currentTicketCode, setCurrentTicketCode] = useState<string>('');
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDecodedRef = useRef<TicketDecodedDisplaySeed | null>(null);
  const isOfflineRef = useRef(false);

  const hasResultContent =
    Boolean(decodedTicket || decodeError) && !autoHideRequested;

  const refreshFromLocalCache = useCallback(() => {
    const allCachedRecords = readCachedScanRecords();
    setScanRecords(allCachedRecords.slice(0, 5));
    setEntryCount(estimateEntryCountFromRecords(allCachedRecords));
    setPendingSyncCount(getPendingOperationCount());
  }, []);

  const markServerOffline = useCallback(() => {
    isOfflineRef.current = true;
    setIsServerOffline(true);
    refreshFromLocalCache();
  }, [refreshFromLocalCache]);

  const markServerOnline = useCallback(() => {
    isOfflineRef.current = false;
    setIsServerOffline(false);
  }, []);

  const focus = useCallback(() => {
    if (showServerModal) {
      inputRef.current?.blur();
    } else {
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 10);
    }
  }, [showServerModal]);

  useEffect(() => {
    // 初期表示時やモーダルの表示が切り替わった時にフォーカスを当てる
    focus();

    const handleClick = (e: MouseEvent) => {
      // ボタンやリンク、入力欄をクリックした場合は、意図的な操作なのでフォーカスを奪わない
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest('button') ||
          e.target.closest('a') ||
          e.target.closest('input'))
      ) {
        setTimeout(() => focus(), 10);
        return;
      }
      // それ以外の場所をクリックしたら、スキャナ入力のためにフォーカスを戻す
      focus();
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [focus]);

  // ローカルストレージから URL を読み込み、初回設定をチェック
  useEffect(() => {
    const savedUrl = localStorage.getItem(SCAN_SERVER_URL_STORAGE_KEY);
    if (savedUrl) {
      setLocalServerUrl(savedUrl);
    } else {
      // URL が未設定の場合、モーダルを表示
      setShowServerModal(true);
    }
    refreshFromLocalCache();
  }, [refreshFromLocalCache]);

  const syncPendingOperations = useCallback(async () => {
    if (!localServerUrl) {
      return;
    }

    const operations = readPendingSyncOperations();
    if (operations.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    for (const operation of operations) {
      try {
        if (operation.type === 'scanLog') {
          if (operation.result === 'success' || operation.result === 'reentry') {
            await useTicketOnServer(localServerUrl, operation.ticketId, operation.count);
          }

          const serverLogId = await postTicketLogToServer(
            localServerUrl,
            operation.ticketCode,
            operation.result,
            operation.count,
          );

          if (operation.result === 'reentry') {
            await updateReentryCountOnServer(
              localServerUrl,
              operation.ticketId,
              operation.count,
            );
          }

          if (serverLogId !== null && operation.localRecordId < 0) {
            replaceCachedRecordId(operation.localRecordId, serverLogId);
          }
        } else if (operation.type === 'countUpdate') {
          await updateRecordCountOnServer(
            localServerUrl,
            operation.logId,
            operation.code,
            operation.count,
          );
        } else if (operation.type === 'deleteLog') {
          await deleteScanRecordOnServer(localServerUrl, operation.logId);
        }

        dropPendingOperation(operation.opId);
      } catch (error) {
        if (isScanServerUnavailableError(error)) {
          markServerOffline();
          break;
        }
        break;
      }
    }

    setPendingSyncCount(getPendingOperationCount());
  }, [localServerUrl, markServerOffline]);

  const refreshFromServer = useCallback(async () => {
    if (!localServerUrl) {
      return;
    }

    try {
      await syncPendingOperations();
      const [records, count] = await Promise.all([
        fetchScanRecordsFromServer(localServerUrl),
        fetchEntryCountFromServer(localServerUrl),
      ]);
      const merged = replaceCachedRecordsWithServerRecords(records);
      setScanRecords(merged.slice(0, 5));
      setEntryCount(count);
      setPendingSyncCount(getPendingOperationCount());
      markServerOnline();
    } catch (error) {
      if (isScanServerUnavailableError(error)) {
        markServerOffline();
        return;
      }
      refreshFromLocalCache();
    }
  }, [
    localServerUrl,
    markServerOffline,
    markServerOnline,
    refreshFromLocalCache,
    syncPendingOperations,
  ]);

  useEffect(() => {
    if (!localServerUrl) {
      return () => {
        // noop
      };
    }

    void refreshFromServer();
    const intervalId = window.setInterval(() => {
      void refreshFromServer();
    }, 5000);

    const handleOnline = () => {
      void refreshFromServer();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [localServerUrl, refreshFromServer]);

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
      setEntryCountValue(1);
      setCurrentLogId(null);
      setCurrentTicketCode('');
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
    setCurrentLogId(null);
    setCurrentTicketCode('');
    setEntryCountValue(1);

    try {
      const [code, signature] = scannedValue.split('.');
      if (!code) {
        await saveScanResult(scannedValue, 'failed', 1);
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

      const { decoded, signatureIsValid, isTicketThisYear } =
        await decodeAndVerifyTicket(code, signature);

      if (!decoded) {
        await saveScanResult(scannedValue, 'failed', 1);
        setDecodeError(
          'デコードに失敗しました。チケットコードが正しいか確認してください。',
        );
        return;
      }

      if (!isTicketThisYear) {
        await saveScanResult(scannedValue, 'wrongYear', 1);
        setDecodeError(
          '今年度のものではないチケットが読まれました。別のチケットをスキャンしてください。',
        );
        return;
      }

      if (!signatureIsValid) {
        await saveScanResult(scannedValue, 'unverified', 1);
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
      await saveScanResult(scannedValue, 'failed', 1);
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
      setEntryCountValue(1);
      setCurrentTicketCode(code.split('.')[0]);
      const logId = await saveScanResult(code, 'success', 1);
      setCurrentLogId(logId);
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
        setEntryCountValue(1);
        setCurrentTicketCode(code.split('.')[0]);
        const logId = await saveScanResult(code, 'reentry', 1);
        setCurrentLogId(logId);
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
    await saveScanResult(code, 'failed', 1);
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
      setEntryCountValue(1);
      setCurrentTicketCode(code);
      const logId = await saveScanResult(scannedValue, 'reentry', 1);
      setCurrentLogId(logId);
    }
    await handleResolvedTicket(decoded, { reentry: true });
  };

  const handleReentryCancel = async () => {
    setShowReentryModal(false);
    pendingDecodedRef.current = null;
    setDuplicateInfo(null);
    setDecodeError('再入場はキャンセルされました。');
    if (scannedValue) {
      await saveScanResult(scannedValue, 'duplicate', 1);
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
        await saveScanResult(pendingFullCode, 'failed', 1);
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
      await saveScanResult(pendingFullCode, 'failed', 1);
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

  const handleSaveServerUrl = (url: string) => {
    if (url.trim()) {
      localStorage.setItem(SCAN_SERVER_URL_STORAGE_KEY, url);
      setLocalServerUrl(url);
      setShowServerModal(false);
      markServerOnline();
    }
  };

  const handleOpenServerModal = () => {
    setShowServerModal(true);
  };

  async function useTicket(ticketId: string) {
    if (!localServerUrl) {
      setDecodeError('ローカルサーバーのURLを入力してください。');
      return { ticketStatus: null, ticketUsedAt: null, lastUsedAt: null };
    }
    try {
      const result = await useTicketOnServer(localServerUrl, ticketId);
      markServerOnline();
      return result;
    } catch (error) {
      if (!isScanServerUnavailableError(error)) {
        throw error;
      }
      markServerOffline();
      return inferOfflineTicketStatus(ticketId);
    }
  }

  async function saveScanResult(code: string, result: string, count: number) {
    const scannedAt = new Date().toISOString();
    const normalizedCode = code.replace(/-/g, '');
    const ticketId = normalizedCode.split('.')[0];
    let logId: number | null = null;
    let shouldQueue = true;

    if (localServerUrl && !isOfflineRef.current) {
      try {
        logId = await postTicketLogToServer(localServerUrl, code, result, count);
        if (result === 'reentry') {
          await updateReentryCountOnServer(localServerUrl, ticketId, count);
        }
        shouldQueue = false;
        markServerOnline();
      } catch (error) {
        if (isScanServerUnavailableError(error)) {
          markServerOffline();
        }
      }
    }

    const saved = appendScanRecordToCache({
      id: logId ?? undefined,
      ticket_code: normalizedCode,
      scanned_at: scannedAt,
      result,
      count,
    });

    if (shouldQueue) {
      enqueuePendingScanLog({
        localRecordId: saved.id,
        ticketCode: normalizedCode,
        result,
        count,
        scannedAt,
      });
    }

    refreshFromLocalCache();
    return saved.id;
  }

  async function updateCountOnServer(
    logId: number | null,
    code: string,
    count: number,
  ) {
    if (logId === null) {
      return;
    }
    updateCachedRecordCount(logId, count);
    if (logId < 0) {
      updatePendingScanLogCount(logId, count);
      refreshFromLocalCache();
      return;
    }

    if (!localServerUrl || isOfflineRef.current) {
      enqueuePendingCountUpdate(logId, code, count);
      refreshFromLocalCache();
      return;
    }

    try {
      await updateRecordCountOnServer(localServerUrl, logId, code, count);
      markServerOnline();
    } catch (error) {
      enqueuePendingCountUpdate(logId, code, count);
      if (isScanServerUnavailableError(error)) {
        markServerOffline();
      }
    }
    refreshFromLocalCache();
  }

  const handleEntryCountChange = async (delta: number) => {
    const next = clampCount(entryCountValue + delta);
    setEntryCountValue(next);
    if (!currentTicketCode) {
      return;
    }

    let targetLogId = currentLogId;
    if (targetLogId === null) {
      const matched = scanRecords.find(
        (record) => record.ticket_code.split('.')[0] === currentTicketCode,
      );
      if (matched) {
        targetLogId = matched.id;
        setCurrentLogId(matched.id);
      }
    }

    if (targetLogId !== null) {
      await updateCountOnServer(targetLogId, currentTicketCode, next);
      setScanRecords((prev) =>
        prev.map((record) =>
          record.id === targetLogId ? { ...record, count: next } : record,
        ),
      );
      refreshFromLocalCache();
    }
  };

  const handleRecordCountChange = async (
    logId: number,
    code: string,
    delta: number,
  ) => {
    let next = 1;
    setScanRecords((prev) =>
      prev.map((record) => {
        if (record.id !== logId) {
          return record;
        }
        next = clampCount((record.count ?? 1) + delta);
        return { ...record, count: next };
      }),
    );
    await updateCountOnServer(logId, code, next);
    refreshFromLocalCache();
  };

  const handleDeleteLog = async (logId: number) => {
    if (!logId) {
      return;
    }
    removeCachedRecord(logId);
    clearPendingOperationsForLog(logId);

    if (logId < 0) {
      refreshFromLocalCache();
      return;
    }

    if (!localServerUrl || isOfflineRef.current) {
      enqueuePendingDeleteLog(logId);
      refreshFromLocalCache();
      return;
    }

    try {
      await deleteScanRecordOnServer(localServerUrl, logId);
      markServerOnline();
    } catch (error) {
      enqueuePendingDeleteLog(logId);
      if (isScanServerUnavailableError(error)) {
        markServerOffline();
      }
    }
    refreshFromLocalCache();
  };

  const requestDeleteLog = (logId: number) => {
    setPendingDeleteLogId(logId);
    setShowDeleteLogModal(true);
  };

  const handleDeleteLogConfirm = async () => {
    if (pendingDeleteLogId === null) {
      return;
    }
    await handleDeleteLog(pendingDeleteLogId);
    setPendingDeleteLogId(null);
    setShowDeleteLogModal(false);
  };

  const handleDeleteLogCancel = () => {
    setPendingDeleteLogId(null);
    setShowDeleteLogModal(false);
  };

  return (
    <div className={styles.pageShell}>
      <h1 className={baseStyles.pageTitle}>校内入場</h1>

      {isServerOffline && (
        <section className={styles.offlineAlertSection}>
          <Alert type='warning'>
            同期サーバーに接続できないため、ローカルストレージの履歴を使って判定しています。再接続後に自動同期します。未同期:{' '}
            {pendingSyncCount}件
          </Alert>
        </section>
      )}

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
          <p className={styles.textInputRules}>
            大文字・小文字は区別します。ハイフンはあっても無くても可。
          </p>
          <button type='submit' className={styles.submitButton}>
            登録
          </button>
        </form>
      </section>

      <section className={styles.statsSection}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>現在の入場者数</p>
          <p className={styles.statValue}>{entryCount}人</p>
        </div>
      </section>

      <section className={styles.recordsSection}>
        <div className={styles.recordsTitleRow}>
          <h2 className={styles.recordsTitle}>直近5件の読み取り履歴</h2>
          <a href='./history'>すべての履歴</a>
        </div>
        {scanRecords.length > 0 ? (
          <div className={styles.recordsList}>
            {scanRecords.map((record) => (
              <div key={record.id} className={styles.recordItem}>
                <div className={styles.recordId}>
                  <span className={styles.recordLabel}>ID:</span>
                  <span className={styles.recordValue}>{record.id}</span>
                </div>
                <div className={styles.recordCode}>
                  <span className={styles.recordLabel}>コード:</span>
                  <span className={styles.recordValue}>
                    {record.ticket_code}
                  </span>
                </div>
                {(record.result === 'success' ||
                  record.result === 'reentry') && (
                  <div className={styles.recordEntryCount}>
                    <span className={styles.recordLabel}>人数:</span>
                    <button
                      type='button'
                      className={styles.recordCountButton}
                      onClick={() =>
                        handleRecordCountChange(
                          record.id,
                          record.ticket_code,
                          -1,
                        )
                      }
                    >
                      <FaMinus />
                    </button>
                    <span className={styles.recordCountValue}>
                      {record.count ?? 1} 人
                    </span>
                    <button
                      type='button'
                      className={styles.recordCountButton}
                      onClick={() =>
                        handleRecordCountChange(
                          record.id,
                          record.ticket_code,
                          1,
                        )
                      }
                    >
                      <FaPlus />
                    </button>
                  </div>
                )}
                <div className={styles.recordDateTime}>
                  <span className={styles.recordLabel}>時刻:</span>
                  <span className={styles.recordValue}>
                    {new Date(record.scanned_at).toLocaleString()}
                  </span>
                </div>
                <div
                  className={`${styles.recordResult} ${
                    record.result === 'success'
                      ? styles.resultSuccess
                      : record.result === 'reentry'
                        ? styles.resultReentry
                        : styles.resultFailed
                  }`}
                >
                  <span className={styles.recordLabel}>結果:</span>
                  <span className={styles.recordValue}>
                    {record.result === 'success'
                      ? '成功'
                      : record.result === 'duplicate'
                        ? '重複'
                        : record.result === 'reentry'
                          ? '再入場'
                          : record.result === 'failed'
                            ? 'エラー'
                            : record.result === 'unverified'
                              ? '署名検証エラー'
                              : record.result === 'wrongYear'
                                ? '年度確認エラー'
                                : record.result}
                  </span>
                </div>
                <div className={styles.deleteLog}>
                  <button
                    type='button'
                    className={styles.deleteButton}
                    onClick={() => requestDeleteLog(record.id)}
                  >
                    <TiDelete />
                    読み取り履歴を削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.noRecords}>読み取り履歴がまだありません</p>
        )}
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
              <div className={styles.entryCountDisplay}>
                <button
                  type='button'
                  className={styles.entryCountButton}
                  onClick={() => handleEntryCountChange(-1)}
                >
                  <FaMinus />
                </button>
                <div className={styles.entryCountValue}>
                  {entryCountValue}
                  <span className={styles.entryCountUnit}>名</span>
                </div>
                <button
                  type='button'
                  className={styles.entryCountButton}
                  onClick={() => handleEntryCountChange(1)}
                >
                  <FaPlus />
                </button>
              </div>

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

      <ServerUrlModal
        isOpen={showServerModal}
        currentUrl={localServerUrl}
        onSave={handleSaveServerUrl}
      />
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
      {showDeleteLogModal && (
        <div className={styles.modalOverlay} onClick={() => undefined}>
          <div
            className={styles.modalContainer}
            role='dialog'
            aria-modal='true'
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalContent}>
              <h2 className={styles.modalTitle}>読み取り履歴を削除</h2>
              <p className={styles.modalDescription}>
                この履歴を削除しますか?一度削除した履歴は戻せません。ただし、操作履歴はすべてログに記録されています。
              </p>
              <div className={styles.modalButtonGroup}>
                <button
                  type='button'
                  className={styles.modalSecondaryButton}
                  onClick={handleDeleteLogCancel}
                >
                  キャンセル
                </button>
                <button
                  type='button'
                  className={styles.submitButton}
                  onClick={handleDeleteLogConfirm}
                >
                  削除
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
