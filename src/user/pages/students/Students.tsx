import { useEffect, useState } from 'preact/hooks';
import { Link, Route, Switch, useLocation } from 'wouter-preact';
import { navigate } from 'wouter-preact/use-browser-location';
import { supabase } from '../../../lib/supabase';

import type { Session, UserData } from '../../../types/types';

import NotFound from '../../../shared/NotFound';
import Dashboard from './Dashboard';
import InitialRegistration from './InitialRegistration';
import Issue from './Issue';
import IssueResult from './IssueResult';
import {
  readCachedStudentProfile,
  writeCachedStudentProfile,
} from './offlineCache';

import styles from '../../../styles/sub-pages.module.css';

type AuthState = Session | undefined;

const Students = () => {
  const [location] = useLocation();
  const [session, setSession] = useState<AuthState>(undefined);
  const [userData, setUserData] = useState<UserData | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  const formatErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  };

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
      setProfileError(null);

      if (!nextSession) {
        setUserData(null);
        navigate('/students/login');
        return;
      }

      const { data, error } = await loadUserProfile(nextSession.user.id);

      if (error) {
        const cachedProfile = readCachedStudentProfile(nextSession.user.id);
        if (cachedProfile) {
          setUserData(cachedProfile);
          return;
        }

        setProfileError(formatErrorMessage(error));
        return;
      }

      setUserData(data);
      if (data) {
        writeCachedStudentProfile(nextSession.user.id, data);
      }
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
        writeCachedStudentProfile(session.user.id, data);
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

    if (profileError) {
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
  }, [location, profileError, session, userData]);

  const retryLoadProfile = async () => {
    if (!session) {
      return;
    }

    setProfileError(null);
    const { data, error } = await loadUserProfile(session.user.id);

    if (error) {
      const cachedProfile = readCachedStudentProfile(session.user.id);
      if (cachedProfile) {
        setUserData(cachedProfile);
        return;
      }

      setProfileError(formatErrorMessage(error));
      return;
    }

    setUserData(data);
    if (data) {
      writeCachedStudentProfile(session.user.id, data);
    }
  };

  if (session === undefined || (session && userData === undefined && !profileError)) {
    return (
      <section>
        <h1 style={styles.pageTitle}>生徒用ページ</h1>
        <h2>読み込み中...</h2>
        <p>
          しばらく待ってもページが遷移しない場合は、
          <Link to='/students/login'>ログインページ</Link>または
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

  if (profileError && userData === undefined) {
    return (
      <section>
        <h1 style={styles.pageTitle}>生徒用ページ</h1>
        <h2>プロフィールを読み込めませんでした</h2>
        <p>オフライン状態、または通信エラーの可能性があります。</p>
        <p>通信状態を確認して、再読み込みをお試しください。</p>
        <button type='button' onClick={() => void retryLoadProfile()}>
          再試行
        </button>
        <p>詳細: {profileError}</p>
      </section>
    );
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
      <Route path='/students/issue/result' component={IssueResult} />
      <Route path='/students/issue' component={Issue} />
      <Route path='/students/dashboard'>
        {() => <Dashboard userData={registeredUserData} />}
      </Route>
      <Route path='/students'>
        {() => <Dashboard userData={registeredUserData} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
};

export default Students;
