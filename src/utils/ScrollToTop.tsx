import { useEffect } from "preact/hooks";
import { useLocation } from "wouter-preact";


export const ScrollToTop = () => {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  return null;
};
