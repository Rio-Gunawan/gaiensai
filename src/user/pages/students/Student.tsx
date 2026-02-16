import { navigate } from 'wouter-preact/use-browser-location';
import type { Session } from '../../../types/types';
import { useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';

import styles from '../../../styles/sub-pages.module.css';
import { Link } from 'wouter-preact';

const Student = () => {
  useEffect(() => {
    const redirectBySession = async (session: Session) => {
      if (session) {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          alert('ユーザープロフィールを取得するのに失敗しました。:' +  error);
          navigate('/students/login');
          return;
        }

        if (data) {
          navigate('/students/dashboard');
          return;
        }

        navigate('/students/initial-registration');
        return;
      }

      navigate('/students/login');
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void redirectBySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void redirectBySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <section>
      <h1 style={styles.pageTitle}>生徒用ページ</h1>
      <h2>読み込み中...</h2>
      <p>
        しばらく待ってもページが遷移しない場合は、
        <Link to='/students/login'>こちら</Link>
        から再度ログインをお試しください。
      </p>
      <p>
        すでにログイン済みなのにこのページから遷移しない場合は、
        <Link to='/students/dashboard'>こちら</Link>
        から直接ダッシュボードページにアクセスしてください。
      </p>
      <p>不明点がありましたら、お気軽に外苑祭総務へお問い合わせください。</p>
    </section>
  );
};

export default Student;
