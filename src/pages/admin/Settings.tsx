import Alert from '../../components/ui/Alert';
import NormalSection from '../../components/ui/NormalSection';
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import styles from './Settings.module.css';
import Switch from '../../components/ui/Switch';

const ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY = 'admin_control_panel_session_v2';

const getSessionToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.localStorage.getItem(
    ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY,
  );
  return token && token.trim().length > 0 ? token : null;
};

const saveSessionToken = (token: string) => {
  window.localStorage.setItem(ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY, token);
};

const clearSessionToken = () => {
  window.localStorage.removeItem(ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY);
};

const readErrorMessage = async (error: unknown): Promise<string> => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    !error.message.includes('non-2xx')
  ) {
    return error.message;
  }

  try {
    const responseMessage = (await (
      error as { context: { json: () => Promise<unknown> } }
    ).context.json()) as { error?: string };
    if (responseMessage?.error) {
      return responseMessage.error;
    }
  } catch {
    // no-op
  }

  return '通信状況と設定を確認してください。';
};

type ControlPanelSettings = {
  eventYear: number;
  showLength: number;
  maxTicketsPerUser: number;
  juniorReleaseOpen: boolean;
};

const NUMERIC_SETTING_META = {
  eventYear: { label: '年度', min: 2020, max: 2100 },
  showLength: { label: '1公演の長さ（分）', min: 1, max: 300 },
  maxTicketsPerUser: { label: '1人あたりのチケット購入上限', min: 1, max: 100 },
} as const;

type NumericSettingKey = keyof typeof NUMERIC_SETTING_META;
type SettingsMessageScope = 'modal' | 'globalSection' | 'ticketSection' | null;

const Settings = () => {
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authState, setAuthState] = useState<
    'checking' | 'locked' | 'unlocked'
  >('checking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginWarningMessage, setLoginWarningMessage] = useState<string | null>(
    null,
  );
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(
    null,
  );
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<
    string | null
  >(null);
  const [settings, setSettings] = useState<ControlPanelSettings>({
    eventYear: 2025,
    showLength: 60,
    maxTicketsPerUser: 20,
    juniorReleaseOpen: false,
  });
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isSyncingSetting, setIsSyncingSetting] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsMessageScope, setSettingsMessageScope] =
    useState<SettingsMessageScope>(null);
  const [editingNumericKey, setEditingNumericKey] =
    useState<NumericSettingKey | null>(null);
  const [editingNumericValue, setEditingNumericValue] = useState('');
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    const verifySession = async () => {
      const token = getSessionToken();
      if (!token) {
        if (isActive) {
          setAuthState('locked');
        }
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('admin-auth', {
          body: { action: 'verify' },
          headers: {
            'x-admin-session-token': token,
          },
        });

        if (error) {
          throw error;
        }

        if (isActive) {
          setAuthState(data?.authenticated ? 'unlocked' : 'locked');
        }

        if (!data?.authenticated) {
          clearSessionToken();
        }
      } catch {
        clearSessionToken();
        if (isActive) {
          setAuthState('locked');
        }
      }
    };

    void verifySession();

    return () => {
      isActive = false;
    };
  }, []);

  const handleUnlock = async (event: Event) => {
    event.preventDefault();
    setErrorMessage(null);
    setLoginWarningMessage(null);
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: { action: 'login', password },
      });

      if (error) {
        throw error;
      }

      if (!data?.authenticated) {
        setErrorMessage('パスワードが正しくありません。');
        const remainingAttempts =
          typeof data?.remainingAttempts === 'number'
            ? data.remainingAttempts
            : null;
        if (
          remainingAttempts !== null &&
          remainingAttempts >= 1 &&
          remainingAttempts <= 3
        ) {
          setLoginWarningMessage(
            `あと${remainingAttempts}回間違えると一定時間ロックされます。`,
          );
        }
        return;
      }

      if (
        typeof data?.sessionToken !== 'string' ||
        data.sessionToken.length < 1
      ) {
        setErrorMessage('セッション作成に失敗しました。');
        return;
      }

      saveSessionToken(data.sessionToken);
      setPassword('');
      setLoginWarningMessage(null);
      setAuthState('unlocked');
    } catch (error) {
      const message = await readErrorMessage(error);
      setErrorMessage(`認証に失敗しました。${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLock = async () => {
    const token = getSessionToken();
    if (token) {
      try {
        await supabase.functions.invoke('admin-auth', {
          body: { action: 'logout' },
          headers: {
            'x-admin-session-token': token,
          },
        });
      } catch {
        // no-op
      }
    }

    clearSessionToken();
    setAuthState('locked');
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setErrorMessage(null);
    setLoginWarningMessage(null);
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);
    setSettingsError(null);
    setSettingsSuccess(null);
    setSettingsMessageScope(null);
    setEditingNumericKey(null);
    setEditingNumericValue('');
  };

  const handlePasswordChange = async (event: Event) => {
    event.preventDefault();
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    if (newPassword.length < 8) {
      setPasswordChangeError('新しいパスワードは8文字以上で入力してください。');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError(
        '新しいパスワードと確認用パスワードが一致しません。',
      );
      return;
    }

    setIsChangingPassword(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: {
          action: 'changePassword',
          currentPassword,
          newPassword,
        },
        headers: {
          'x-admin-session-token': getSessionToken() ?? '',
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.changed) {
        setPasswordChangeError(
          'パスワード変更に失敗しました。時間をおいて再度お試しください。',
        );
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordChangeSuccess('管理者パスワードを変更しました。');
    } catch (error) {
      const message = await readErrorMessage(error);
      setPasswordChangeError(`パスワード変更に失敗しました。${message}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  useEffect(() => {
    if (authState !== 'unlocked') {
      return;
    }

    let isActive = true;
    const token = getSessionToken();
    if (!token) {
      return;
    }

    const loadSettings = async () => {
      setIsSettingsLoading(true);
      setSettingsError(null);
      setSettingsSuccess(null);
      setSettingsMessageScope(null);

      try {
        const { data, error } = await supabase.functions.invoke('admin-auth', {
          body: { action: 'getSettings' },
          headers: {
            'x-admin-session-token': token,
          },
        });

        if (error) {
          throw error;
        }

        const nextSettings = data?.settings;
        if (
          !nextSettings ||
          typeof nextSettings.eventYear !== 'number' ||
          typeof nextSettings.showLength !== 'number' ||
          typeof nextSettings.maxTicketsPerUser !== 'number' ||
          typeof nextSettings.juniorReleaseOpen !== 'boolean'
        ) {
          throw new Error('設定データの形式が不正です。');
        }

        if (isActive) {
          setSettings(nextSettings);
        }
      } catch (error) {
        const message = await readErrorMessage(error);
        if (isActive) {
          setSettingsMessageScope('globalSection');
          setSettingsError(`設定の読み込みに失敗しました。${message}`);
        }
      } finally {
        if (isActive) {
          setIsSettingsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [authState]);

  const syncSettings = async (
    nextSettings: ControlPanelSettings,
    successMessage = '設定を更新しました。',
    messageScope: Exclude<SettingsMessageScope, null> = 'ticketSection',
  ) => {
    const token = getSessionToken();
    if (!token) {
      setSettingsMessageScope(messageScope);
      setSettingsError('セッションがありません。再ログインしてください。');
      return false;
    }

    setSettingsMessageScope(messageScope);
    setSettingsError(null);
    setSettingsSuccess(null);
    setIsSyncingSetting(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: {
          action: 'updateSettings',
          eventYear: nextSettings.eventYear,
          showLength: nextSettings.showLength,
          maxTicketsPerUser: nextSettings.maxTicketsPerUser,
          juniorReleaseOpen: nextSettings.juniorReleaseOpen,
        },
        headers: {
          'x-admin-session-token': token,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.updated) {
        throw new Error('設定の保存に失敗しました。');
      }

      setSettings(nextSettings);
      setSettingsSuccess(successMessage);
      return true;
    } catch (error) {
      const message = await readErrorMessage(error);
      setSettingsError(`設定の保存に失敗しました。${message}`);
      return false;
    } finally {
      setIsSyncingSetting(false);
    }
  };

  const openNumericEditModal = (key: NumericSettingKey) => {
    setEditingNumericKey(key);
    setEditingNumericValue(String(settings[key]));
    setSettingsMessageScope('modal');
    setSettingsError(null);
    setSettingsSuccess(null);
  };

  const closeNumericEditModal = () => {
    setEditingNumericKey(null);
    setEditingNumericValue('');
    setSettingsMessageScope(null);
    setSettingsError(null);
    setSettingsSuccess(null);
  };

  const handleConfirmNumericEdit = async () => {
    if (!editingNumericKey) {
      return;
    }

    const meta = NUMERIC_SETTING_META[editingNumericKey];
    const parsed = Number(editingNumericValue);
    if (!Number.isInteger(parsed) || parsed < meta.min || parsed > meta.max) {
      setSettingsError(
        `${meta.label}は${meta.min}〜${meta.max}の範囲の整数で入力してください。`,
      );
      return;
    }

    setIsModalSubmitting(true);
    const nextSettings: ControlPanelSettings = {
      ...settings,
      [editingNumericKey]: parsed,
    };

    const updated = await syncSettings(
      nextSettings,
      `${meta.label}を更新しました。`,
      'modal',
    );
    if (updated) {
      closeNumericEditModal();
    }
    setIsModalSubmitting(false);
  };

  if (authState === 'checking') {
    return (
      <div>
        <h1 className={styles.pageTitle}>コントロールパネル</h1>
        <p>認証状態を確認しています...</p>
      </div>
    );
  }

  if (authState === 'locked') {
    return (
      <div>
        <h1 className={styles.pageTitle}>コントロールパネル</h1>
        <NormalSection className={styles.authForm}>
          <h2>管理者ログイン</h2>
          <form className={styles.authLoginForm} onSubmit={handleUnlock}>
            <label
              className={styles.authLabel}
              htmlFor='admin-control-password'
            >
              管理者パスワード
            </label>
            <input
              id='admin-control-password'
              type='password'
              className={styles.authInput}
              value={password}
              onInput={(event) =>
                setPassword((event.target as HTMLInputElement).value)
              }
              autoComplete='current-password'
              required
            />
            {errorMessage && <p className={styles.authError}>{errorMessage}</p>}
            {loginWarningMessage && (
              <p className={styles.authWarning}>{loginWarningMessage}</p>
            )}
            <button
              type='submit'
              className={styles.authButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? '認証中...' : 'ログイン'}
            </button>
          </form>
        </NormalSection>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.pageTitle}>コントロールパネル</h1>
          <p className={styles.pageLead}>
            システム全体設定と管理者セキュリティをここで管理します。
          </p>
        </div>
        <button
          type='button'
          className={styles.lockButton}
          onClick={handleLock}
        >
          ロック
        </button>
      </div>
      <Alert type='warning'>
        <p>
          このページはシステム全体に影響を与えます。設定変更には十分ご注意ください。
        </p>
      </Alert>
      <NormalSection>
        <h2>全体</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <div className={styles.settingLabelGroup}>
              <label
                className={styles.settingLabel}
                htmlFor='settings-event-year'
              >
                年度
              </label>
              <p className={styles.settingHint}>
                ここでの変更はチケットの年度情報のみ適用されます
              </p>
            </div>
            <div className={styles.settingControlGroup}>
              <span
                id='settings-event-year'
                className={styles.fieldValue}
              >
                {settings.eventYear}
              </span>
              <button
                type='button'
                className={styles.inlineEditButton}
                onClick={() => openNumericEditModal('eventYear')}
                disabled={isSettingsLoading || isSyncingSetting}
              >
                変更する
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label
              className={styles.settingLabel}
              htmlFor='settings-show-length-minutes'
            >
              1公演の長さ（分）
            </label>
            <div className={styles.settingControlGroup}>
              <span
                id='settings-show-length-minutes'
                className={styles.fieldValue}
              >
                {settings.showLength}
              </span>
              <button
                type='button'
                className={styles.inlineEditButton}
                onClick={() => openNumericEditModal('showLength')}
                disabled={isSettingsLoading || isSyncingSetting}
              >
                変更する
              </button>
            </div>
          </div>
        </div>
        {settingsMessageScope === 'globalSection' && isSettingsLoading && (
          <p className={styles.statusMessage}>設定を読み込み中です...</p>
        )}
        {settingsMessageScope === 'globalSection' && settingsError && (
          <p className={styles.authError}>{settingsError}</p>
        )}
        {settingsMessageScope === 'globalSection' && settingsSuccess && (
          <p className={styles.authSuccess}>{settingsSuccess}</p>
        )}
      </NormalSection>
      <NormalSection>
        <h2>チケット発券</h2>
        <div className={styles.formGrid}>
          {/* <div>
            <h3>券種別の受付設定</h3>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-class-invite'
              >
                招待券(クラス公演)受付
              </label>
              <select id='ticket-class-invite' className={styles.fieldControl}>
                <option value='open'>すべて</option>
                <option value='only-own'>自クラスのみ</option>
                <option value='off'>無効</option>
              </select>
            </div>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-rehearsal-invite'
              >
                招待券(リハーサル)受付
              </label>
              <select
                id='ticket-rehearsal-invite'
                className={styles.fieldControl}
              >
                <option value='open'>すべて</option>
                <option value='public-rehearsals'>公開リハーサルのみ</option>
                <option value='off'>無効</option>
              </select>
            </div>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-gym-invite'
              >
                招待券(体育館公演)受付
              </label>
              <select id='ticket-gym-invite' className={styles.fieldControl}>
                <option value='open'>すべて</option>
                <option value='only-own'>自部活のみ</option>
                <option value='off'>無効</option>
              </select>
            </div>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-entry-only'
              >
                招待券(入場専用券)受付
              </label>
              <select id='ticket-entry-only' className={styles.fieldControl}>
                <option value='open'>有効</option>
                <option value='off'>無効</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.settingLabel} htmlFor='ticket-same-day'>
                当日券受付
              </label>
              <select id='ticket-same-day' className={styles.fieldControl}>
                <option value='open'>有効</option>
                <option value='auto'>当日のみ</option>
                <option value='off'>無効</option>
              </select>
            </div>
          </div> */}
          {/* <div>
            <h3>チケット数の受付設定</h3>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-class-total'
              >
                クラス公演の1公演あたりのチケット数(中学生券含む)
              </label>
              <input
                id='ticket-class-total'
                className={styles.fieldControl}
                type='number'
                min={1}
                max={100}
                defaultValue={50}
              />
            </div>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-class-junior'
              >
                クラス公演の1公演あたり中学生枠
              </label>
              <input
                id='ticket-class-junior'
                className={styles.fieldControl}
                type='number'
                min={1}
                max={100}
                defaultValue={10}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.settingLabel} htmlFor='ticket-gym-total'>
                体育館公演の1公演あたりのチケット数
              </label>
              <input
                id='ticket-gym-total'
                className={styles.fieldControl}
                type='number'
                min={1}
                max={100}
                defaultValue={100}
              />
            </div>
          </div> */}
          <div>
            <h3>その他設定</h3>
            <div className={styles.field}>
              <label
                className={styles.settingLabel}
                htmlFor='ticket-max-per-user'
              >
                1人あたりのチケット発行上限
              </label>
              <div className={styles.settingControlGroup}>
                <span
                  id='ticket-max-per-user'
                  className={styles.fieldValue}
                >
                  {settings.maxTicketsPerUser}
                </span>
                <button
                  type='button'
                  className={styles.inlineEditButton}
                  onClick={() => openNumericEditModal('maxTicketsPerUser')}
                  disabled={isSettingsLoading || isSyncingSetting}
                >
                  変更する
                </button>
              </div>
            </div>
            <label className={styles.field} htmlFor='ticket-junior-release'>
              <span className={styles.settingLabel}>中学生枠の一般解放</span>
              <Switch
                id='ticket-junior-release'
                onChange={(checked: boolean) => {
                  if (isSettingsLoading || isSyncingSetting) {
                    return;
                  }

                  setSettings((prev) => {
                    const next = { ...prev, juniorReleaseOpen: checked };
                    // 非同期通信をバックグラウンドで実行
                    void syncSettings(
                      next,
                      '中学生枠の一般解放設定を更新しました。',
                      'ticketSection',
                    ).then((updated) => {
                      // 失敗した場合は以前の値を参照して戻す
                      if (!updated) {
                        setSettings((current) => ({
                          ...current,
                          juniorReleaseOpen: prev.juniorReleaseOpen,
                        }));
                      }
                    });
                    return next;
                  });
                }}
                checked={settings.juniorReleaseOpen}
              />
            </label>
          </div>
        </div>
        {settingsMessageScope === 'ticketSection' && isSettingsLoading && (
          <p className={styles.statusMessage}>設定を読み込み中です...</p>
        )}
        {settingsMessageScope === 'ticketSection' && settingsError && (
          <p className={styles.authError}>{settingsError}</p>
        )}
        {settingsMessageScope === 'ticketSection' && settingsSuccess && (
          <p className={styles.authSuccess}>{settingsSuccess}</p>
        )}
      </NormalSection>
      <NormalSection>
        <h2>削除ツール</h2>
        <p className={styles.noteText}>
          データの削除は慎重に行う必要があります。削除を行う前に、必ずデータのバックアップを取ってください。
        </p>
      </NormalSection>
      <NormalSection>
        <h2>パスワード変更</h2>
        <form className={styles.passwordForm} onSubmit={handlePasswordChange}>
          <label className={styles.authLabel} htmlFor='admin-current-password'>
            現在の管理者パスワード
          </label>
          <input
            id='admin-current-password'
            type='password'
            className={styles.authInput}
            value={currentPassword}
            onInput={(event) =>
              setCurrentPassword((event.target as HTMLInputElement).value)
            }
            autoComplete='current-password'
            required
          />
          <label className={styles.authLabel} htmlFor='admin-new-password'>
            新しい管理者パスワード
          </label>
          <input
            id='admin-new-password'
            type='password'
            className={styles.authInput}
            value={newPassword}
            onInput={(event) =>
              setNewPassword((event.target as HTMLInputElement).value)
            }
            autoComplete='new-password'
            minLength={8}
            required
          />
          <label
            className={styles.authLabel}
            htmlFor='admin-new-password-confirm'
          >
            新しい管理者パスワード（確認）
          </label>
          <input
            id='admin-new-password-confirm'
            type='password'
            className={styles.authInput}
            value={confirmNewPassword}
            onInput={(event) =>
              setConfirmNewPassword((event.target as HTMLInputElement).value)
            }
            autoComplete='new-password'
            minLength={8}
            required
          />
          {passwordChangeError && (
            <p className={styles.authError}>{passwordChangeError}</p>
          )}
          {passwordChangeSuccess && (
            <p className={styles.authSuccess}>{passwordChangeSuccess}</p>
          )}
          <button
            type='submit'
            className={styles.authButton}
            disabled={isChangingPassword}
          >
            {isChangingPassword ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
      </NormalSection>
      {editingNumericKey && (
        <div
          className={styles.settingModalOverlay}
          role='presentation'
          onClick={closeNumericEditModal}
        >
          <div
            className={styles.settingModal}
            role='dialog'
            aria-modal='true'
            aria-labelledby='settings-edit-title'
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id='settings-edit-title' className={styles.settingModalTitle}>
              {NUMERIC_SETTING_META[editingNumericKey].label}を変更
            </h3>
            <input
              className={styles.fieldControl}
              type='number'
              min={NUMERIC_SETTING_META[editingNumericKey].min}
              max={NUMERIC_SETTING_META[editingNumericKey].max}
              value={editingNumericValue}
              onInput={(event) =>
                setEditingNumericValue(
                  (event.target as HTMLInputElement).value,
                )
              }
            />
            {settingsMessageScope === 'modal' && settingsError && (
              <p className={styles.authError}>{settingsError}</p>
            )}
            {settingsMessageScope === 'modal' && settingsSuccess && (
              <p className={styles.authSuccess}>{settingsSuccess}</p>
            )}
            <div className={styles.settingModalActions}>
              <button
                type='button'
                className={styles.settingModalCancel}
                onClick={closeNumericEditModal}
                disabled={isModalSubmitting}
              >
                キャンセル
              </button>
              <button
                type='button'
                className={styles.settingModalConfirm}
                onClick={handleConfirmNumericEdit}
                disabled={isModalSubmitting}
              >
                {isModalSubmitting ? '同期中...' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
