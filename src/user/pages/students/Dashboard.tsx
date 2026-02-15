import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';
import { navigate } from 'wouter-preact/use-browser-location';

import type { Session, UserData } from '../../../types/types';
import NormalSection from '../../../components/ui/NormalSection';

import subPageStyles from '../../../styles/sub-pages.module.css';
import sharedStyles from '../../../styles/shared.module.css';
import styles from './Dashboard.module.css';
import { Link } from 'wouter-preact';
import { IoMdAdd } from 'react-icons/io';

const Dashboard = () => {
  const [session, setSession] = useState<Session>(null);
  const [userData, setUserData] = useState<UserData>(null);

  useEffect(() => {
    const verifySession = async (session: Session) => {
      if (!session) {
        navigate('/students/login');
        return;
      }

      const { data, error }: { data: UserData; error: unknown } = await supabase
        .from('users')
        .select('email, name, affiliation')
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

      setUserData(data);

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

  if (!session || !userData) {
    return null;
  }

  return (
    <>
      <h1 className={subPageStyles.pageTitle}>ダッシュボード</h1>
      <section>
        <h2 className={sharedStyles.normalH2}>
          {userData.affiliation} {userData.name} 様
        </h2>
        <Link to='/students/issue' class={styles.buttonLink}>
          <IoMdAdd />
          新規チケット発行
        </Link>
      </section>
      <NormalSection>
        <h2>自分が使うチケット</h2>
        <p>ここにチケット一覧が表示されます。</p>
      </NormalSection>
      <NormalSection>
        <h2>発券したチケット</h2>
        <p>ここにチケット一覧が表示されます。</p>
      </NormalSection>
      <NormalSection>
        <h2>公演空き状況</h2>
        <p>ここに公演空き状況が表示されます。</p>
      </NormalSection>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>ログアウト</button>
      </section>
    </>
  );
};

export default Dashboard;
