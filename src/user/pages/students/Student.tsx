import { navigate } from 'wouter-preact/use-browser-location';
import type { Session } from '../../../types/types';
import { useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';

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

  return null;
};

export default Student;
