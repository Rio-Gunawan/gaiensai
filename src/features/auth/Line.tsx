import { useEffect } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { supabase } from '../../lib/supabase';

export const LineCallback = () => {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const search = location.includes('?')
        ? location.split('?')[1]
        : window.location.search.replace(/^\?/, '');
      const params = new URLSearchParams(search);
      const code = params.get('code');
      const state = params.get('state');

      // stateを検証してCSRF攻撃を防ぐ
      const storedState = sessionStorage.getItem('line_oauth_state');
      sessionStorage.removeItem('line_oauth_state');
      if (!code || !state || state !== storedState) {
        // エラー処理
        setLocation('/students?error=invalid_state');
        return;
      }

      try {
        // 認証コードをEdge Functionに渡す
        const { data, error } = await supabase.functions.invoke(
          'line-auth',
          {
            body: { code },
          }
        );

        if (error) {
          throw error;
        }

        // 返されたトークンでセッションを設定
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });

        // ログイン後、ホームページなどにリダイレクト
        setLocation('/students');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('LINE Auth Callback Error:', error as Error);
        setLocation(`/students?error=${encodeURIComponent((error as Error).message)}`);
      }
    };

    // 実行は一度で十分 — locationがコールバックURLのときのみ処理
    handleAuthCallback();
  }, [location, setLocation]);

  return <div>LINE認証中...</div>;
};
