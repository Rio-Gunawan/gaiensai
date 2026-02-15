import { navigate } from 'wouter-preact/use-browser-location';
import type { Session } from '../../../types/types';
import { useEffect } from 'preact/hooks';
import { supabase } from '../../../lib/supabase';

const Student = () => {
  useEffect(() => {
    const redirectBySession = (session: Session) => {
      if (session) {
        navigate('/students/dashboard');
      } else {
        navigate('/students/login');
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      redirectBySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectBySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
};

export default Student;
