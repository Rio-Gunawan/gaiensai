import Alert from '../../components/ui/Alert';
import NormalSection from '../../components/ui/NormalSection';
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import styles from './Settings.module.css';

const ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY = 'admin_control_panel_session_v2';

const getSessionToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.localStorage.getItem(ADMIN_CONTROL_PANEL_SESSION_TOKEN_KEY);
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

      if (typeof data?.sessionToken !== 'string' || data.sessionToken.length < 1) {
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
      setPasswordChangeError(
        `パスワード変更に失敗しました。${message}`,
      );
    } finally {
      setIsChangingPassword(false);
    }
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
      <div className={styles.authContainer}>
        <h1 className={styles.pageTitle}>コントロールパネル</h1>
        <NormalSection className={styles.authForm}>
          <h2>管理者ログイン</h2>
          <form onSubmit={handleUnlock}>
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
        <h1 className={styles.pageTitle}>コントロールパネル</h1>
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
      </NormalSection>
      <NormalSection>
        <h2>チケット発券</h2>
      </NormalSection>
      <NormalSection>
        <h2>削除ツール</h2>
        <p>
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
    </div>
  );
};

export default Settings;
