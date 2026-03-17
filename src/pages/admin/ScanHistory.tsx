import { useEffect, useMemo, useState } from 'preact/hooks';
import styles from './ScanHistory.module.css';
import baseStyles from '../../styles/sub-pages.module.css';
import { TbReload } from 'react-icons/tb';
import { ServerUrlModal } from '../../components/admin/ServerUrlModal';

const STORAGE_KEY = 'scan_server_url';

type ScanRecord = {
  id: number;
  ticket_code: string;
  scanned_at: string;
  result: string;
  count: number;
};

const resultLabels: Record<string, string> = {
  success: '成功',
  duplicate: '重複',
  reentry: '再入場',
  failed: 'エラー',
  unverified: '署名検証エラー',
  wrongYear: '年度確認エラー',
};

function normalizeServerUrl(localServerUrl: string) {
  let url = localServerUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '');
}

const ScanHistory = () => {
  const [localServerUrl, setLocalServerUrl] = useState<string | null>(null);
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showServerModal, setShowServerModal] = useState(false);

  const hasServerUrl = Boolean(localServerUrl);

  useEffect(() => {
    const savedUrl = localStorage.getItem(STORAGE_KEY);
    if (savedUrl) {
      setLocalServerUrl(savedUrl);
    } else {
      setLocalServerUrl(null);
      setError(
        '同期サーバーが未設定です。先に「校内入場」で設定してください。',
      );
    }
  }, []);

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
        const res = await fetch(
          normalizeServerUrl(localServerUrl) + '/api/records',
        );
        const data = await res.json();
        if (!cancelled) {
          setRecords(Array.isArray(data.records) ? data.records : []);
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
    const intervalId = window.setInterval(fetchRecords, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [localServerUrl, refreshToken]);

  const rows = useMemo(
    () =>
      records.map((record) => ({
        ...record,
        label: resultLabels[record.result] ?? record.result,
        scannedAtLabel: new Date(record.scanned_at).toLocaleString(),
      })),
    [records],
  );

  const handleOpenServerModal = () => {
    setShowServerModal(true);
  };

  const handleSaveServerUrl = (url: string) => {
    if (url.trim()) {
      localStorage.setItem(STORAGE_KEY, url);
      setLocalServerUrl(url);
      setShowServerModal(false);
      setError(null);
    }
  };

  return (
    <div className={`${baseStyles.subPageShell} ${styles.pageShell}`}>
      <h1 className={baseStyles.pageTitle}>読み取り履歴</h1>
      <section className={styles.tableSection}>
        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>同期サーバー</span>
            <span className={styles.metaValue}>
              {localServerUrl ?? '未設定'}
            </span>
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
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        {rows.length === 0 && !error ? (
          <p className={styles.emptyText}>
            {isLoading
              ? '読み取り履歴を読み込み中...'
              : '読み取り履歴がまだありません。'}
          </p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.cellId}>ID</th>
                  <th>チケットコード</th>
                  <th>結果</th>
                  <th className={styles.cellCount}>人数</th>
                  <th>読み取り時刻</th>
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
                    <td className={styles.cellCount}>{record.count ?? 1}</td>
                    <td>{record.scannedAtLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ServerUrlModal
        isOpen={showServerModal}
        currentUrl={localServerUrl ?? undefined}
        onSave={handleSaveServerUrl}
      />
    </div>
  );
};

export default ScanHistory;
