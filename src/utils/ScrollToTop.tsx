import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

export const ScrollToTop = () => {
  const { path } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [path]);

  return null;
};
