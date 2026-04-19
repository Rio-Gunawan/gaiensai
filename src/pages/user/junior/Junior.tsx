import { useEffect, useState } from 'preact/hooks';
import { Route, Router, useLocation } from 'preact-iso';
import { supabase } from '../../../lib/supabase';

import type { Session, UserData } from '../../../types/types';

import JuniorMyPage from './JuniorMyPage';

import JuniorLayout from '../../../layout/JuniorLayout';
import {
  readCachedJuniorProfile,
  writeCachedJuniorProfile,
} from './offlineCache';

import styles from '../../../styles/sub-pages.module.css';
import NotFound from '../../../shared/NotFound';
import Login from './Login';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useTitle } from '../../../hooks/useTitle';

type AuthState = Session | undefined;
const JUNIOR_AFFILIATION_THRESHOLD = 100000;

const Junior = () => {
  const { path, route } = useLocation();
  const [session, setSession] = useState<AuthState>(undefined);
  const [userData, setUserData] = useState<UserData | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useTitle('中学生用ページ');

  const formatErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  };

  const loadUserProfile = async (userId: string) => {
    const { data, error }: { data: UserData; error: unknown } = await supabase
      .from('users')
      .select('email, affiliation')
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
        route('/junior/login');
        return;
      }

      const { data, error } = await loadUserProfile(nextSession.user.id);

      if (error) {
        const cachedProfile = readCachedJuniorProfile(nextSession.user.id);
        if (cachedProfile) {
          setUserData(cachedProfile);
          return;
        }

        setProfileError(formatErrorMessage(error));
        return;
      }

      setUserData(data);
      if (data) {
        writeCachedJuniorProfile(nextSession.user.id, data);
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

    if (userData && userData.affiliation < JUNIOR_AFFILIATION_THRESHOLD) {
      route('/students');
      return;
    }

    if (userData && (path === '/junior' || path === '/junior/login' || path === '/junior/')) {
      route('/junior/mypage');
    }
  }, [path, profileError, route, session, userData]);

  const retryLoadProfile = async () => {
    if (!session) {
      return;
    }

    setProfileError(null);
    const { data, error } = await loadUserProfile(session.user.id);

    if (error) {
      const cachedProfile = readCachedJuniorProfile(session.user.id);
      if (cachedProfile) {
        setUserData(cachedProfile);
        return;
      }

      setProfileError(formatErrorMessage(error));
      return;
    }

    setUserData(data);
    if (data) {
      writeCachedJuniorProfile(session.user.id, data);
    }
  };

  if (
    session === undefined ||
    (session && userData === undefined && !profileError)
  ) {
    return (
      <section>
        <h1 className={styles.pageTitle}>中学生用ページ</h1>
        <LoadingSpinner />
        <p>
          しばらく待ってもページが遷移しない場合は、
          <a href='/junior/login'>ログインページ</a>または
          <a href='/junior/mypage'>マイページ</a>
          のいずれかに直接アクセスしてみてください。
        </p>
        <p>不明点がありましたら、お気軽に外苑祭総務へお問い合わせください。</p>
      </section>
    );
  }

  if (!session) {
    return (
      <JuniorLayout>
        <Login />
      </JuniorLayout>
    );
  }

  if (profileError && userData === undefined) {
    return (
      <section>
        <h1 className={styles.pageTitle}>中学生用ページ</h1>
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
      <JuniorLayout>
        <section>
          <h1 className={styles.pageTitle}>中学生用ページ</h1>
          <h2>利用者情報が見つかりませんでした</h2>
          <p>アカウント情報の確認が必要です。外苑祭総務へご連絡ください。</p>
        </section>
      </JuniorLayout>
    );
  }

  const registeredUserData = userData;

  return (
    <JuniorLayout>
      <Router>
        <Route
          path='/mypage'
          component={() => <JuniorMyPage userData={registeredUserData} />}
        />
        <Route
          path='/'
          component={() => <JuniorMyPage userData={registeredUserData} />}
        />
        <Route default component={NotFound} />
      </Router>
    </JuniorLayout>
  );
};

export default Junior;
