import { useEffect, useState } from 'preact/hooks';
import { Link, Route, Switch, useLocation } from 'wouter-preact';
import { navigate } from 'wouter-preact/use-browser-location';
import { supabase } from '../../../lib/supabase';

import type { Session, UserData } from '../../../types/types';

import NotFound from '../../../shared/NotFound';
import Dashboard from './Dashboard';
import InitialRegistration from './InitialRegistration';
import Issue from './Issue';

import styles from '../../../styles/sub-pages.module.css';

type AuthState = Session | undefined;

const Students = () => {
  const [location] = useLocation();
  const [session, setSession] = useState<AuthState>(undefined);
  const [userData, setUserData] = useState<UserData | undefined>(undefined);

  const loadUserProfile = async (userId: string) => {
    const { data, error }: { data: UserData; error: unknown } = await supabase
      .from('users')
      .select('email, name, affiliation')
      .eq('id', userId)
      .maybeSingle();

    return { data, error };
  };

  useEffect(() => {
    const loadProfile = async (nextSession: Session) => {
      setSession(nextSession);

      if (!nextSession) {
        setUserData(null);
        navigate('/students/login');
        return;
      }

      const { data, error } = await loadUserProfile(nextSession.user.id);

      if (error) {
        alert('ユーザープロフィールを取得するのに失敗しました。:' + error);
        setSession(null);
        setUserData(null);
        navigate('/students/login');
        return;
      }

      setUserData(data);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void loadProfile(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadProfile(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // register_student直後にusersの行が即時にselectで見えないタイミングがあるため
  const handleRegistered = async (): Promise<boolean> => {
    if (!session) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      const { data, error } = await loadUserProfile(session.user.id);

      if (!error && data) {
        setUserData(data);
        return true;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 200);
      });
    }

    return false;
  };

  useEffect(() => {
    if (session === undefined || userData === undefined) {
      return;
    }

    if (!session) {
      return;
    }

    if (!userData && location !== '/students/initial-registration') {
      navigate('/students/initial-registration');
      return;
    }

    if (
      userData &&
      (location === '/students' ||
        location === '/students/initial-registration' ||
        location === '/students/')
    ) {
      navigate('/students/dashboard');
    }
  }, [location, session, userData]);

  if (session === undefined || (session && userData === undefined)) {
    return (
      <section>
        <h1 style={styles.pageTitle}>生徒用ページ</h1>
        <h2>読み込み中...</h2>
        <p>
          しばらく待ってもページが遷移しない場合は、
          <Link to='/students/login'>ログインページ</Link>
          <Link to='/students/dashboard'>ダッシュボード</Link>
          のいずれかに直接アクセスしてみてください。
        </p>
        <p>不明点がありましたら、お気軽に外苑祭総務へお問い合わせください。</p>
      </section>
    );
  }

  if (!session) {
    return null;
  }

  if (!userData) {
    return (
      <Switch>
        <Route path='/students/initial-registration'>
          {() => <InitialRegistration onRegistered={handleRegistered} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    );
  }

  const registeredUserData = userData;

  return (
    <Switch>
      <Route path='/students/dashboard'>
        {() => <Dashboard userData={registeredUserData} />}
      </Route>
      <Route path='/students'>
        {() => <Dashboard userData={registeredUserData} />}
      </Route>
      <Route path='/students/issue' component={Issue} />
      <Route component={NotFound} />
    </Switch>
  );
};

export default Students;
