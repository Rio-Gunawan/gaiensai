import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FaMinus, FaPlus } from 'react-icons/fa6';
import { TbReload } from 'react-icons/tb';
import { TiDelete } from 'react-icons/ti';
import { ServerUrlModal } from '../../components/admin/ServerUrlModal';
import {
  SCAN_SERVER_URL_STORAGE_KEY,
  clampCount,
  deleteScanRecordOnServer,
  fetchScanRecordsFromServer,
  scanResultLabels,
  type ScanRecord,
  updateRecordCountOnServer,
  fetchEntryCountFromServer,
} from '../../features/admin/scanSync';
import baseStyles from '../../styles/sub-pages.module.css';
import styles from './ScanHistory.module.css';
import Alert from '../../components/ui/Alert';
import BackButton from '../../components/ui/BackButton';

const ScanHistory = () => {
  const [localServerUrl, setLocalServerUrl] = useState<string | null>(null);
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showDeleteLogModal, setShowDeleteLogModal] = useState(false);
  const [pendingDeleteLogId, setPendingDeleteLogId] = useState<number | null>(
    null,
  );

  const [entryCount, setEntryCount] = useState<number>(0);

  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = wrapper;

      // スクロール可能かどうか判定
      const isScrollable = scrollWidth > clientWidth;

      if (!isScrollable) {
        wrapper.removeAttribute('data-scroll-fade');
        return;
      }

      // 端の判定（1px程度の誤差を許容）
      const isAtStart = scrollLeft <= 1;
      const isAtEnd = Math.abs(scrollWidth - clientWidth - scrollLeft) <= 1;

      if (isAtStart) {
        wrapper.setAttribute('data-scroll-fade', 'start');
      } else if (isAtEnd) {
        wrapper.setAttribute('data-scroll-fade', 'end');
      } else {
        wrapper.setAttribute('data-scroll-fade', 'middle');
      }
    };

    // 初期化とイベントリスナー設定
    updateScrollState();
    wrapper.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      wrapper.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [records]);

  const hasServerUrl = Boolean(localServerUrl);

  useEffect(() => {
    const savedUrl = localStorage.getItem(SCAN_SERVER_URL_STORAGE_KEY);
    if (savedUrl) {
      setLocalServerUrl(savedUrl);
    } else {
      setLocalServerUrl(null);
      setError(
        '同期サーバーが未設定です。先に「校内入場」で設定してください。',
      );
    }
  }, []);

  async function fetchEntryCount() {
    if (!localServerUrl) {
      return;
    }
    try {
      const next = await fetchEntryCountFromServer(localServerUrl);
      setEntryCount(next);
    } catch {
      // 統計情報の取得に失敗しても無視
    }
  }

  useEffect(() => {
    if (!localServerUrl) {
      return () => {
        // noop
      };
    }

    let cancelled = false;

    const fetchRecords = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await fetchScanRecordsFromServer(localServerUrl, {
          all: true,
        });
        if (!cancelled) {
          setRecords(next);
        }
      } catch {
        if (!cancelled) {
          setError('読み取り履歴の取得に失敗しました。');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchRecords();
    fetchEntryCount();
    const intervalId = window.setInterval(fetchRecords, 5000);
    const intervalId2 = window.setInterval(fetchEntryCount, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearInterval(intervalId2);
    };
  }, [localServerUrl, refreshToken]);

  const rows = useMemo(
    () =>
      records.map((record) => ({
        ...record,
        label: scanResultLabels[record.result] ?? record.result,
        scannedAtLabel: new Date(record.scanned_at).toLocaleString(),
      })),
    [records],
  );

  const handleOpenServerModal = () => {
    setShowServerModal(true);
  };

  const handleSaveServerUrl = (url: string) => {
    if (url.trim()) {
      localStorage.setItem(SCAN_SERVER_URL_STORAGE_KEY, url);
      setLocalServerUrl(url);
      setShowServerModal(false);
      setError(null);
    }
  };

  const handleRecordCountChange = async (
    logId: number,
    code: string,
    delta: number,
  ) => {
    if (!localServerUrl) {
      return;
    }

    let next = 1;
    setRecords((prev) =>
      prev.map((record) => {
        if (record.id !== logId) {
          return record;
        }
        next = clampCount((record.count ?? 1) + delta);
        return { ...record, count: next };
      }),
    );

    try {
      await updateRecordCountOnServer(localServerUrl, logId, code, next);
    } catch {
      setError(
        '人数変更の保存に失敗しました。再読み込みして再度お試しください。',
      );
      setRefreshToken((value) => value + 1);
    }
  };

  const requestDeleteLog = (logId: number) => {
    setPendingDeleteLogId(logId);
    setShowDeleteLogModal(true);
  };

  const handleDeleteLogConfirm = async () => {
    if (!localServerUrl || pendingDeleteLogId === null) {
      return;
    }

    try {
      await deleteScanRecordOnServer(localServerUrl, pendingDeleteLogId);
      setRecords((prev) =>
        prev.filter((record) => record.id !== pendingDeleteLogId),
      );
      setShowDeleteLogModal(false);
      setPendingDeleteLogId(null);
    } catch {
      setError('履歴の削除に失敗しました。');
    }
  };

  const handleDeleteLogCancel = () => {
    setShowDeleteLogModal(false);
    setPendingDeleteLogId(null);
  };

  return (
    <div className={`${baseStyles.subPageShell} ${styles.pageShell}`}>
      <BackButton />
      <h1 className={baseStyles.pageTitle}>読み取り履歴</h1>
      {error && <Alert type='error'>{error}</Alert>}
      <section className={styles.metaRow}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>同期サーバー</span>
          <span className={styles.metaValue}>{localServerUrl ?? '未設定'}</span>
          <button
            type='button'
            className={styles.changeButton}
            onClick={handleOpenServerModal}
          >
            変更
          </button>
        </div>
        <button
          type='button'
          className={styles.refreshButton}
          onClick={() => {
            if (!localServerUrl) {
              return;
            }
            setRefreshToken((value) => value + 1);
          }}
          disabled={!hasServerUrl || isLoading}
        >
          <TbReload />
          更新
        </button>
      </section>
      <section className={styles.statsSection}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>現在の入場者数</p>
          <p className={styles.statValue}>{entryCount}人</p>
        </div>
      </section>
      <section className={styles.tableSection}>
        {rows.length === 0 && !error ? (
          <p className={styles.emptyText}>
            {isLoading
              ? '読み取り履歴を読み込み中...'
              : '読み取り履歴がまだありません。'}
          </p>
        ) : (
          <>
            <p className={styles.scrollHint}>← 横にスクロールできます →</p>
            <div className={styles.tableWrapper} ref={tableWrapperRef}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.cellId}>ID</th>
                    <th>チケットコード</th>
                    <th>結果</th>
                    <th className={styles.cellCount}>人数</th>
                    <th>読み取り時刻</th>
                    <th className={styles.cellActions}>削除</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id}>
                      <td className={styles.cellId}>{record.id}</td>
                      <td className={styles.cellCode}>{record.ticket_code}</td>
                      <td>
                        <span
                          className={`${styles.resultBadge} ${
                            record.result === 'success'
                              ? styles.resultSuccess
                              : record.result === 'reentry'
                                ? styles.resultReentry
                                : record.result === 'duplicate'
                                  ? styles.resultDuplicate
                                  : styles.resultFailed
                          }`}
                        >
                          {record.label}
                        </span>
                      </td>
                      <td className={styles.cellCount}>
                        <div className={styles.count}>
                          {(record.result === 'success' ||
                            record.result === 'reentry') && (
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
                              aria-label='人数を減らす'
                            >
                              <FaMinus />
                            </button>
                          )}
                          {record.count ?? 'なし'}
                          {(record.result === 'success' ||
                            record.result === 'reentry') && (
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
                              aria-label='人数を増やす'
                            >
                              <FaPlus />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{record.scannedAtLabel}</td>
                      <td className={styles.cellActions}>
                        <button
                          type='button'
                          className={styles.deleteButton}
                          onClick={() => requestDeleteLog(record.id)}
                        >
                          <TiDelete />
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <ServerUrlModal
        isOpen={showServerModal}
        currentUrl={localServerUrl ?? undefined}
        onSave={handleSaveServerUrl}
      />
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
                この履歴を削除しますか?一度削除した履歴は戻せません。
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
                  className={styles.modalPrimaryButton}
                  onClick={handleDeleteLogConfirm}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanHistory;
