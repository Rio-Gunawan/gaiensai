import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import { navigate } from 'wouter-preact/use-browser-location';

import type { Session } from '../../../types/types';

const Dashboard = () => {
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/students/login');
        return;
      }

      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSession(null);
        navigate('/students/login');
        return;
      }

      setSession(session);
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
