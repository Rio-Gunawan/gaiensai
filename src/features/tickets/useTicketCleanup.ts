import { useEffect } from 'preact/hooks';
import { clearTicketDisplayCacheBefore } from './ticketDisplayCache';

const CLEANUP_THRESHOLD = 1775925349556;
const EXPIRATION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 1ヶ月 (30日間)

export const useTicketCleanup = () => {
  useEffect(() => {
    const now = Date.now();
    const expirationThreshold = now - EXPIRATION_PERIOD_MS;

    // 特定の閾値、または1ヶ月以上経過した古いキャッシュをクリーンアップする
    clearTicketDisplayCacheBefore(
      Math.max(CLEANUP_THRESHOLD, expirationThreshold),
    );
  }, []);
};
