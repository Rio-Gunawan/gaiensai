import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import { navigate } from 'wouter-preact/use-browser-location';

import type { Session } from '../../../types/types';

const Dashboard = () => {
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    const verifySession = async (session: Session) => {
      if (!session) {
        navigate('/students/login');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to verify users profile:', error);
        navigate('/students/login');
        return;
      }

      if (!data) {
        navigate('/students/initial-registration');
        return;
      }

      setSession(session);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void verifySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSession(null);
        navigate('/students/login');
        return;
      }

      void verifySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return null;
  }

  return (
    <section>
      <h2>ダッシュボード</h2>
      <h3>ようこそ</h3>
      <p>ログインしました: {session.user.email}</p>
      <button onClick={handleLogout}>ログアウト</button>
    </section>
  );
};

export default Dashboard;
