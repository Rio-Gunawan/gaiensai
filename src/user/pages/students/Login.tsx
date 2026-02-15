import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import {} from '@supabase/supabase-js';
import styles from './Login.module.css';
import lineImageUrl from '../../../assets/line.webp';

type Session = {
  user: {
    email?: string;
  };
} | null;

export function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [session, setSession] = useState<Session>(null);

  // Check URL params on initial render
  const params = new URLSearchParams(window.location.search);
  const hasTokenHash = params.get('token_hash');

  const [verifying, setVerifying] = useState(!!hasTokenHash);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);

  useEffect(() => {
    // Check if we have token_hash in URL (magic link callback)
    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get('token_hash');

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

  const handleLogin = async (event: Event) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
      },
    });
    if (error) {
      alert(error.message);
    } else {
      alert(
        'ログイン用メールを送信しました。メール内のURLをクリックしてログインしてください。'
      );
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });
    if (error) {
      alert(error.message);
    }
    setLoading(false);
  };

  const handleLineLogin = () => {
    const state = crypto.randomUUID(); // CSRF対策
    localStorage.removeItem('line_oauth_state');
    localStorage.setItem('line_oauth_state', state); // stateをセッションストレージに保存

    const scope = 'profile openid email';
    const responseType = 'code';

    const params = new URLSearchParams({
      response_type: responseType,
      client_id: import.meta.env.VITE_PUBLIC_LINE_CHANNEL_ID!,
      redirect_uri: import.meta.env.VITE_PUBLIC_LINE_REDIRECT_URI!,
      scope: scope,
      state: state,
    });

    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;

    window.location.href = lineAuthUrl;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  // Show verification state
  if (verifying) {
    return (
      <div>
        <h2>認証</h2>
        <p>マジックリンクの確認中...</p>
        <p>しばらくお待ちください。</p>
      </div>
    );
  }

  // Show auth error
  if (authError) {
    return (
      <div>
        <h2>認証エラー</h2>
        <p>✗ 認証に失敗しました</p>
        <p>{authError}</p>
        <button
          onClick={() => {
            setAuthError(null);
            window.history.replaceState({}, document.title, '/');
          }}
        >
          Return to login
        </button>
      </div>
    );
  }

  // Show auth success (briefly before session loads)
  if (authSuccess && !session) {
    return (
      <div>
        <h2>認証</h2>
        <p>認証に成功しました！</p>
        <p>アカウントを読み込み中...</p>
      </div>
    );
  }

  // If user is logged in, show welcome screen
  if (session) {
    return (
      <div>
        <h2>ようこそ</h2>
        <p>ログインしました: {session.user.email}</p>
        <button onClick={handleLogout}>ログアウト</button>
      </div>
    );
  }

  // Show login form
  return (
    <div className={styles.loginContainer}>
      <h2>ログイン・登録</h2>
      <form onSubmit={handleLogin} className={styles.loginForm}>
        <input
          type='email'
          placeholder='Your email'
          value={email}
          required={true}
          className={styles.loginInput}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <br />
        <button className={styles.loginButton} disabled={loading}>
          {loading ? (
            <span>読み込み中</span>
          ) : (
            <span>メールアドレスでログイン</span>
          )}
        </button>
      </form>
      <button
        className={`${styles.gsiMaterialButton} ${styles.loginButton}`}
        style='width:300'
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        <div className={styles.gsiMaterialButtonState}></div>
        <div className={styles.gsiMaterialButtonContentWrapper}>
          <div className={styles.gsiMaterialButtonIcon}>
            <svg
              version='1.1'
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 48 48'
              style='display: block;'
            >
              <path
                fill='#EA4335'
                d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'
              ></path>
              <path
                fill='#4285F4'
                d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'
              ></path>
              <path
                fill='#FBBC05'
                d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'
              ></path>
              <path
                fill='#34A853'
                d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'
              ></path>
              <path fill='none' d='M0 0h48v48H0z'></path>
            </svg>
          </div>
          <span className={styles.gsiMaterialButtonContents}>Googleで続行</span>
          <span style='display: none;'>Googleで続行</span>
        </div>
      </button>
      <button
        onClick={handleLineLogin}
        className={`${styles.loginButton} ${styles.lineButton}`}
        disabled={loading}
      >
        <img src={lineImageUrl} alt='LINE' />{' '}
        <span>LINEでログイン</span>
      </button>

      <h3>メールアドレスの取得目的について</h3>
      <p>
        本サービスでは、なりすましによる不正チケット取得を防止するために、メールアドレスによる認証を行なっております。
        また、チケットを取得した際やキャンセル待ちの通知を送信するために、メールアドレスを取得させていただきます。
        以上の目的以外でメールアドレスを使用することはありません。
        <br />
        以上の取得の目的に同意の上、お進みください。ご理解とご協力をお願いします。
      </p>
    </div>
  );
}
