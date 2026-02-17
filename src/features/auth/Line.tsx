import { useEffect } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { supabase } from '../../lib/supabase';

const LineCallback = () => {
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
      const storedState = localStorage.getItem('line_oauth_state');
      localStorage.removeItem('line_oauth_state');
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
        alert('LINE認証で、情報は取得できましたが、ログイン・登録に失敗しました。エラーメッセージ:' +  (error as Error).message);
        setLocation(`/students?error=${encodeURIComponent((error as Error).message)}`);
      }
    };

    // 実行は一度で十分 — locationがコールバックURLのときのみ処理
    handleAuthCallback();
  }, [location, setLocation]);

  return <section>LINE認証中...</section>;
};

export default LineCallback;
