import { useCallback } from 'preact/hooks';
import type { TicketCardStatus } from './IssuedTicketCardList';
import {
  decodeTicketCodeWithEnv,
  toTicketDecodedDisplaySeed,
} from './ticketCodeDecode';
import {
  readTicketDisplayCache,
  writeTicketDisplayCache,
} from './ticketDisplayCache';

export interface TicketStorageMetadata {
  performanceName: string;
  performanceTitle: string | null;
  scheduleName: string;
  scheduleDate: string;
  scheduleTime: string;
  scheduleEndTime: string;
  ticketTypeLabel: string;
  relationshipName: string;
  relationshipId: number;
}

export const useTicketStorage = () => {
  const saveTicketToCache = useCallback(
    async (
      code: string,
      signature: string,
      metadata: TicketStorageMetadata,
      status: TicketCardStatus = 'valid',
    ) => {
      try {
        const decodedRaw = await decodeTicketCodeWithEnv(code);
        const decoded = toTicketDecodedDisplaySeed(decodedRaw);

        const existing = readTicketDisplayCache<{ lastOpenedAt?: number }>(
          code,
        );

        const ticketCacheEntry = {
          code,
          signature,
          serial: decoded?.serial,
          affiliation: decoded?.affiliation ?? '-',
          performanceId: decoded?.performanceId ?? 0,
          scheduleId: decoded?.scheduleId ?? 0,
          ticketTypeId: decoded?.ticketTypeId ?? 0,
          year: decoded?.year ?? '',
          performanceName: metadata.performanceName,
          performanceTitle: metadata.performanceTitle,
          scheduleName: metadata.scheduleName,
          scheduleDate: metadata.scheduleDate,
          scheduleTime: metadata.scheduleTime,
          scheduleEndTime: metadata.scheduleEndTime,
          ticketTypeLabel: metadata.ticketTypeLabel,
          relationshipName: metadata.relationshipName,
          relationshipId: decoded?.relationshipId ?? metadata.relationshipId,
          status,
          lastOpenedAt: existing?.lastOpenedAt ?? Date.now(),
        };
        writeTicketDisplayCache(code, ticketCacheEntry);
      } catch (error) {
        // キャッシュ書き込みの失敗は致命的ではないため無視
      }
    },
    [],
  );

  return { saveTicketToCache };
};
