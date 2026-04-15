import { useEffect, useMemo, useState } from 'preact/hooks';
import { useEventConfig } from '../../hooks/useEventConfig';
import { useTitle } from '../../hooks/useTitle';
import { supabase } from '../../lib/supabase';
import {
  AdminAuthLayout,
  getSessionToken,
  readErrorMessage,
} from '../../layout/AdminAuthLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import NormalSection from '../../components/ui/NormalSection';
import styles from './Settings.module.css';
import Alert from '../../components/ui/Alert';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const generateBase58Password = (length = 8): string => {
  let result = '';
  const charactersLength = BASE58_ALPHABET.length;
  for (let i = 0; i < length; i++) {
    result += BASE58_ALPHABET.charAt(
      Math.floor(Math.random() * charactersLength),
    );
  }
  return result;
};

type StudentUser = {
  studentId: string;
  email: string;
  lastSignIn?: string;
  createdAt: string;
};

type BulkCreateResponse = {
  created: number;
  skipped: number;
  errors: string[];
  failedUsers?: { id: string; password: string }[];
};

const StudentAccountsContent = () => {
  const { config } = useEventConfig();
  const [maxGrade, setMaxGrade] = useState(config.grade_number);
  const [maxClass, setMaxClass] = useState(config.class_number);
  const [maxAttendance, setMaxAttendance] = useState(
    config.max_attendance_number,
  );

  const [filterGrade, setFilterGrade] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterAttendance, setFilterAttendance] = useState('');

  const [existingSearchId, setExistingSearchId] = useState('');
  const [existingFilterGrade, setExistingFilterGrade] = useState('');
  const [existingFilterClass, setExistingFilterClass] = useState('');
  const [existingFilterAttendance, setExistingFilterAttendance] = useState('');

  const [generatedAccounts, setGeneratedAccounts] = useState<
    { id: string; password: string }[]
  >([]);
  const [existingUsers, setExistingUsers] = useState<StudentUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [passwordResetInfo, setPasswordResetInfo] = useState<string | null>(
    null,
  );

  useTitle('生徒アカウント管理 - 管理画面');

  const fetchExistingUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const token = getSessionToken();
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: { action: 'getStudentUsers' },
        headers: { 'x-admin-session-token': token ?? '' },
      });
      if (error) {
        throw error;
      }
      setExistingUsers(data.users || []);
    } catch (err) {
      const errorMsg = await readErrorMessage(err);
      setMessage({
        text: `一覧の取得に失敗しました: ${errorMsg}`,
        type: 'error',
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    void fetchExistingUsers();
  }, []);

  const filteredAccounts = useMemo(() => {
    return generatedAccounts.filter((acc) => {
      // IDフォーマット: (学年1桁)(クラス2桁)(番号2桁) 例: 10101
      const g = acc.id.charAt(0);
      const c = acc.id.substring(1, 3);
      const n = acc.id.substring(3, 5);

      const matchGrade = filterGrade === '' || g === filterGrade;
      const matchClass =
        filterClass === '' || c === String(filterClass).padStart(2, '0');
      const matchAttendance =
        filterAttendance === '' ||
        n === String(filterAttendance).padStart(2, '0');

      return matchGrade && matchClass && matchAttendance;
    });
  }, [generatedAccounts, filterGrade, filterClass, filterAttendance]);

  const filteredExistingUsers = useMemo(() => {
    return existingUsers.filter((user) => {
      // IDフォーマット: (学年1桁)(クラス2桁)(番号2桁) 例: 10101
      const id = user.studentId;
      const g = id.charAt(0);
      const c = id.substring(1, 3);
      const n = id.substring(3, 5);

      const matchSearch =
        existingSearchId === '' || id.includes(existingSearchId);
      const matchGrade =
        existingFilterGrade === '' || g === existingFilterGrade;
      const matchClass =
        existingFilterClass === '' ||
        c === String(existingFilterClass).padStart(2, '0');
      const matchAttendance =
        existingFilterAttendance === '' ||
        n === String(existingFilterAttendance).padStart(2, '0');

      return matchSearch && matchGrade && matchClass && matchAttendance;
    });
  }, [
    existingUsers,
    existingSearchId,
    existingFilterGrade,
    existingFilterClass,
    existingFilterAttendance,
  ]);

  const handleGenerate = async () => {
    if (!window.confirm('一括生成を開始しますか？')) {
      return;
    }

    setIsGenerating(true);
    setMessage(null);
    setGenerationErrors([]);
    const accounts: { id: string; password: string }[] = [];
    const BATCH_SIZE = 10;
    const MAX_RETRIES = 3;

    for (let g = 1; g <= maxGrade; g++) {
      for (let c = 1; c <= maxClass; c++) {
        for (let n = 1; n <= maxAttendance; n++) {
          const id = `${g}${String(c).padStart(2, '0')}${String(n).padStart(2, '0')}`;
          accounts.push({ id, password: generateBase58Password() });
        }
      }
    }

    setProgress({ current: 0, total: accounts.length });

    let totalCreated = 0;
    let totalSkipped = 0;
    let resolvedCount = 0;
    const finalErrorsMap = new Map<string, string>();
    let currentQueue = [...accounts];
    let retryAttempt = 0;

    try {
      const token = getSessionToken();

      while (currentQueue.length > 0 && retryAttempt <= MAX_RETRIES) {
        const nextQueue: typeof accounts = [];
        const isRetry = retryAttempt > 0;
        const currentBatchSize = isRetry ? 5 : BATCH_SIZE; // リトライ時はバッチを小さくして安定性を高める

        for (let i = 0; i < currentQueue.length; i += currentBatchSize) {
          const batch = currentQueue.slice(i, i + currentBatchSize);

          try {
            const { data, error } =
              await supabase.functions.invoke<BulkCreateResponse>(
                'admin-auth',
                {
                  body: { action: 'bulkCreateUsers', users: batch },
                  headers: { 'x-admin-session-token': token ?? '' },
                },
              );

            if (error) {
              throw error;
            }

            if (data) {
              totalCreated += data.created;
              totalSkipped += data.skipped;
              resolvedCount += data.created + data.skipped;

              const failedIds = new Set(
                data.failedUsers?.map((f) => f.id) || [],
              );
              // 1. 今回のバッチでエラーに含まれなかったIDは、成功またはスキップ（登録済）
              //    なのでエラーマップから削除する
              batch.forEach((u) => {
                if (!failedIds.has(u.id)) {
                  finalErrorsMap.delete(u.id);
                }
              });

              // 2. 今回失敗したもののメッセージを記録（上書き）
              data.errors?.forEach((errMsg) => {
                const id = errMsg.split(':')[0]?.trim();
                if (id) {
                  finalErrorsMap.set(id, errMsg);
                }
              });

              if (data.failedUsers) {
                nextQueue.push(...data.failedUsers);
              }
            }
          } catch (err) {
            // ネットワークエラー等の場合はバッチごと次の試行へ回す
            batch.forEach((u) => {
              finalErrorsMap.set(u.id, `${u.id}: 通信エラーまたはタイムアウト`);
            });
            nextQueue.push(...batch);
          }

          setProgress({
            current: Math.min(resolvedCount, accounts.length),
            total: accounts.length,
          });
        }

        currentQueue = nextQueue;
        retryAttempt++;
        if (currentQueue.length > 0 && retryAttempt <= MAX_RETRIES) {
          // 指数バックオフ的な待機（1秒, 2回目は2秒...）
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryAttempt),
          );
        }
      }

      // リトライしきれなかったものが残っている場合も進捗を100%にする
      if (currentQueue.length > 0) {
        setProgress({ current: accounts.length, total: accounts.length });
      }

      const allErrors = Array.from(finalErrorsMap.values());
      setGeneratedAccounts(accounts);
      setGenerationErrors(allErrors);
      setMessage({
        text: `作成完了: 新規 ${totalCreated}件 (スキップ: ${totalSkipped}件)${allErrors.length > 0 ? ` ※最終的な失敗 ${allErrors.length}件` : ''}`,
        type: 'success',
      });
      void fetchExistingUsers(); // 作成後に一覧を更新
    } catch (err) {
      const errorMsg = await readErrorMessage(err);
      setMessage({ text: `失敗しました: ${errorMsg}`, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResetPassword = async (studentId: string) => {
    const newPassword = generateBase58Password();
    if (
      !window.confirm(
        `ID: ${studentId} のパスワードをリセットして "${newPassword}" に変更します。よろしいですか？\n変更後、このパスワードを生徒に伝えてください。`,
      )
    ) {
      return;
    }

    setIsGenerating(true);
    try {
      const token = getSessionToken();
      const { error } = await supabase.functions.invoke('admin-auth', {
        body: { action: 'resetUserPassword', studentId, newPassword },
        headers: { 'x-admin-session-token': token ?? '' },
      });
      if (error) {
        throw error;
      }

      alert(
        `ID: ${studentId} のパスワードを "${newPassword}" に更新しました。`,
      );
      setPasswordResetInfo(
        `ID: ${studentId} のパスワードをリセットしました。新パスワード: ${newPassword}`,
      );
    } catch (err) {
      const errorMsg = await readErrorMessage(err);
      alert(`失敗しました: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = (onlyFiltered = false) => {
    const targets = onlyFiltered ? filteredAccounts : generatedAccounts;
    if (targets.length === 0) {
      return;
    }

    const headers = ['id', 'password'];
    const rows = targets.map((a) => `${a.id},${a.password}`);
    const content = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `student_accounts_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className={styles.container}>
      {(existingUsers.length === 0 || generatedAccounts.length > 0) && (
        <NormalSection>
          <h2>生徒アカウント生成</h2>
          <p className={styles.noteText}>
            学年・クラス・番号の最大値を指定して、全組み合わせを生成します。
          </p>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.settingLabel}>学年数</label>
              <input
                type='number'
                className={styles.fieldControl}
                value={maxGrade}
                onInput={(e) =>
                  setMaxGrade(Number((e.target as HTMLInputElement).value))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.settingLabel}>クラス数</label>
              <input
                type='number'
                className={styles.fieldControl}
                value={maxClass}
                onInput={(e) =>
                  setMaxClass(Number((e.target as HTMLInputElement).value))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.settingLabel}>最大出席番号</label>
              <input
                type='number'
                className={styles.fieldControl}
                value={maxAttendance}
                onInput={(e) =>
                  setMaxAttendance(Number((e.target as HTMLInputElement).value))
                }
              />
            </div>
          </div>

          <div className={styles.saveButtonContainer}>
            {generatedAccounts.length === 0 && (
              <button
                className={`${styles.authButton} ${styles.saveButtonPrimary}`}
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? '実行中...' : '一括生成・登録を実行'}
              </button>
            )}
            {generatedAccounts.length > 0 && (
              <button
                className={`${styles.authButton} ${styles.saveButtonSecondary}`}
                onClick={() => handleExportCSV(false)}
              >
                CSVダウンロード ({generatedAccounts.length}件)
              </button>
            )}
          </div>

          {message && (
            <>
              <p
                className={
                  message.type === 'success'
                    ? styles.authSuccess
                    : styles.authError
                }
              >
                {message.text}
              </p>
              {generationErrors.length > 0 && (
                <div
                  className={styles.authError}
                  style={{
                    marginTop: '0.5rem',
                    fontWeight: 'normal',
                    fontSize: '0.9rem',
                  }}
                >
                  <p style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>
                    発生したエラーの内容:
                  </p>
                  <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                    {Array.from(new Set(generationErrors))
                      .slice(0, 5)
                      .map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    {new Set(generationErrors).size > 5 && (
                      <li>
                        ...他 {new Set(generationErrors).size - 5}{' '}
                        件のエラーが発生しました
                      </li>
                    )}
                  </ul>
                </div>
              )}
              <Alert type='warning'>
                パスワードを再度表示することはできません。必ずCSVダウンロードをしてください。
              </Alert>
            </>
          )}
        </NormalSection>
      )}

      {generatedAccounts.length > 0 && (
        <NormalSection>
          <h2>生成済みユーザー一覧</h2>
          <div className={styles.filterArea}>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                学年:
              </label>
              <input
                type='number'
                placeholder='全学年'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={filterGrade}
                onInput={(e) =>
                  setFilterGrade((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                クラス:
              </label>
              <input
                type='number'
                placeholder='全組'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={filterClass}
                onInput={(e) =>
                  setFilterClass((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                出席番号:
              </label>
              <input
                type='number'
                placeholder='全員'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={filterAttendance}
                onInput={(e) =>
                  setFilterAttendance((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <button
              type='button'
              className={styles.inlineEditButton}
              onClick={() => {
                setFilterGrade('');
                setFilterClass('');
                setFilterAttendance('');
              }}
            >
              リセット
            </button>
            <span className={styles.filterCount}>
              該当: {filteredAccounts.length} / {generatedAccounts.length} 件
            </span>
          </div>

          <div className={styles.headerRow}>
            <button
              type='button'
              className={`${styles.saveButtonSecondary}`}
              onClick={() => handleExportCSV(true)}
              disabled={filteredAccounts.length === 0}
            >
              表示中のみCSV保存
            </button>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.managementTable}>
              <thead>
                <tr>
                  <th>学年クラス番号 (ID)</th>
                  <th>パスワード</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>{acc.id}</td>
                    <td>
                      <code className={styles.codePassword}>
                        {acc.password}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NormalSection>
      )}

      {existingUsers.length > 0 && (
        <NormalSection>
          <div className={styles.headerRow}>
            <h2>登録済みアカウント管理</h2>
            <button
              type='button'
              className={styles.inlineEditButton}
              onClick={fetchExistingUsers}
              disabled={isLoadingUsers}
            >
              {isLoadingUsers ? '更新中...' : '一覧を更新'}
            </button>
          </div>

          <Alert type='info'>
            生徒用アカウントを再度生成するには、一度既存のアカウントを全て削除してください。
          </Alert>

          <div className={styles.filterArea}>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                ID検索:
              </label>
              <input
                type='text'
                placeholder='IDの一部'
                className={`${styles.fieldControl} ${styles.filterInputId}`}
                value={existingSearchId}
                onInput={(e) =>
                  setExistingSearchId((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                学年:
              </label>
              <input
                type='number'
                placeholder='全学年'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={existingFilterGrade}
                onInput={(e) =>
                  setExistingFilterGrade((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                クラス:
              </label>
              <input
                type='number'
                placeholder='全組'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={existingFilterClass}
                onInput={(e) =>
                  setExistingFilterClass((e.target as HTMLInputElement).value)
                }
              />
            </div>
            <div className={`${styles.field} ${styles.filterField}`}>
              <label className={`${styles.settingLabel} ${styles.filterLabel}`}>
                出席番号:
              </label>
              <input
                type='number'
                placeholder='全員'
                className={`${styles.fieldControl} ${styles.filterInputSmall}`}
                value={existingFilterAttendance}
                onInput={(e) =>
                  setExistingFilterAttendance(
                    (e.target as HTMLInputElement).value,
                  )
                }
              />
            </div>
            <button
              type='button'
              className={styles.inlineEditButton}
              onClick={() => {
                setExistingSearchId('');
                setExistingFilterGrade('');
                setExistingFilterClass('');
                setExistingFilterAttendance('');
              }}
            >
              リセット
            </button>
            <span className={styles.filterCount}>
              該当: {filteredExistingUsers.length} / {existingUsers.length} 件
            </span>
          </div>

          {passwordResetInfo && (
            <p className={styles.authSuccess}>{passwordResetInfo}</p>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.managementTable}>
              <thead>
                <tr>
                  <th>学年クラス番号 (ID)</th>
                  <th>最終ログイン</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {existingUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.info}>
                      登録済みの生徒アカウントはありません。
                    </td>
                  </tr>
                ) : (
                  filteredExistingUsers.map((user) => (
                    <tr key={user.studentId}>
                      <td>{user.studentId}</td>
                      <td className={styles.tableCellSub}>
                        {user.lastSignIn
                          ? new Date(user.lastSignIn).toLocaleString()
                          : '未ログイン'}
                      </td>
                      <td>
                        <button
                          type='button'
                          className={styles.inlineEditButton}
                          onClick={() => handleResetPassword(user.studentId)}
                          disabled={isGenerating}
                        >
                          パスワードリセット
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className={styles.noteText}>
            ※登録済みの全生徒アカウント（最大1000件）を表示しています。
          </p>
        </NormalSection>
      )}

      {isGenerating && (
        <div className={styles.settingModalOverlay}>
          <LoadingSpinner
            message={`アカウントを生成・登録中です。5分以上時間がかかる場合があります。 (${progress.current} / ${progress.total}) ...`}
          />
        </div>
      )}
    </div>
  );
};

const StudentAccounts = () => {
  return (
    <AdminAuthLayout
      title='生徒アカウント管理'
      description='配布用IDとパスワードの一括生成を行います。'
    >
      <StudentAccountsContent />
    </AdminAuthLayout>
  );
};

export default StudentAccounts;
