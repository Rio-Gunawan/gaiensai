import { useEffect } from 'preact/hooks';
import { useEventConfig } from './useEventConfig';

export function useTitle(title: string) {
  const { config } = useEventConfig();
  const eventTitle = `${config?.name || '外苑祭'}${config?.year ? `${config.year}` : ''} 公式サイト`;
  const fullTitle = title ? `${title} | ${eventTitle}` : `${eventTitle}`;
  useEffect(() => {
    const prevTitle = document.title;
    document.title = fullTitle;
    // アンマウント時に元のタイトルに戻す（任意）
    return () => (document.title = prevTitle);
  }, [title]);
}
