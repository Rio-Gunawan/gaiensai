import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import { useLocation } from 'preact-iso';
import { useTurnstile } from '../../../hooks/useTurnstile';

import styles from './Login.module.css';
import subPageStyles from '../../../styles/sub-pages.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

import type { Session } from '../../../types/types';
import { useTitle } from '../../../hooks/useTitle';

function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session>(null);

  // Check URL params on initial render
  const initialParams = new URLSearchParams(window.location.search);
  const hasTokenHash = initialParams.get('token_hash');

  const [verifying, setVerifying] = useState(!!hasTokenHash);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);

  useTitle('ログイン - 生徒用ページ');

  const { route } = useLocation();
  const {
    token: turnstileToken,
    hasSiteKey: hasTurnstileSiteKey,
    getToken: getTurnstileToken,
    reset: resetTurnstile,
  } = useTurnstile({ containerId: 'login-email-turnstile' });

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search);
    setAuthError(currentParams.get('error') || null);

    // Check if we have token_hash in URL (magic link callback)
    const token_hash = currentParams.get('token_hash');

    if (token_hash) {
      // Verify the OTP token
      supabase.auth
        .verifyOtp({
          token_hash,
          type: 'email',
        })
        .then(({ error }) => {
          if (error) {
            setAuthError(error.message);
          } else {
            setAuthSuccess(true);
            // Clear URL params
            window.history.replaceState({}, document.title, '/students');
          }
          setVerifying(false);
        });
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      route('/students');
    }
  }, [session]);

  const handleLogin = async (event: Event) => {
    event.preventDefault();
    const captchaToken = getTurnstileToken();

    if (!captchaToken) {
      alert('Turnstile認証を完了してからログインしてください。');
      return;
    }

    setLoading(true);
    const loginEmail = `${email}@gaiensai.local`;

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
      options: {
        captchaToken,
      },
    });

    resetTurnstile();
    if (error) {
      alert(`ログインに失敗しました: ${error.message}`);
    }
    setLoading(false);
  };

  // Show verification state
  if (verifying) {
    return (
      <div>
        <h1 className={subPageStyles.pageTitle}>認証</h1>
        <LoadingSpinner message='マジックリンクの確認中...' />
      </div>
    );
  }

  // Show auth error
  if (authError) {
    let message = authError;
    if (authError === 'invalid_state') {
      message = '途中でセッションが切断されました。再度ログインしてください。';
    }
    if (authError === 'Email link is invalid or has expired') {
      message =
        'メールのURLが無効です。メールの有効期限が切れている、あるいは最新のものではない可能性があります。再度ログインしてください。';
    }
    return (
      <section>
        <h1 className={subPageStyles.pageTitle}>認証エラー</h1>
        <p>認証に失敗しました</p>
        <p>エラーメッセージ: {message}</p>
        <button
          onClick={() => {
            setAuthError(null);
            window.history.replaceState({}, document.title, '/students');
          }}
        >
          ログインページに戻る
        </button>
      </section>
    );
  }

  // Show auth success (briefly before session loads)
  if (authSuccess && !session) {
    return (
      <div>
        <h1 className={subPageStyles.pageTitle}>認証</h1>
        <p>認証に成功しました！</p>
        <LoadingSpinner message='アカウントを読み込み中...' />
      </div>
    );
  }

  // If user is logged in, show welcome screen
  if (session) {
    return null;
  }

  // Show login form
  return (
    <>
      <h1 className={subPageStyles.pageTitle}>ようこそ</h1>
      <div className={styles.loginContainer}>
        <h2>ログイン・登録</h2>
        <p>
          事前配布されたログインID・パスワードを使ってログインしてください。
        </p>
        <form onSubmit={handleLogin} className={styles.loginForm}>
          <label>ID</label>
          <input
            type='text'
            placeholder='Your ID'
            value={email}
            required={true}
            className={styles.loginInput}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <br />
          <label>パスワード</label>
          <input
            type='password'
            placeholder='Your Password'
            value={password}
            required={true}
            className={styles.loginInput}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <button
            className={styles.loginButton}
            disabled={loading || !turnstileToken || !hasTurnstileSiteKey}
          >
            {loading ? <span>読み込み中</span> : <span>ログイン</span>}
          </button>
        </form>

        <div className={styles.turnstileContainer}>
          <div id='login-email-turnstile' className='cf-turnstile'></div>
          {!hasTurnstileSiteKey ? (
            <p className={styles.turnstileNote}>
              Turnstile site key が未設定です。
            </p>
          ) : !turnstileToken ? (
            <p className={styles.turnstileNote}>
              メール送信前に Turnstile 認証を完了してください。
            </p>
          ) : (
            ''
          )}
        </div>
      </div>
    </>
  );
}

export default Login;
