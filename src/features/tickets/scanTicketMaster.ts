import { supabase } from '../../lib/supabase';
import type { TicketDecodedDisplaySeed } from './ticketCodeDecode';

const SCAN_TICKET_MASTER_CACHE_KEY = 'scan-ticket-master:v1';
const SCAN_TICKET_MASTER_CACHE_TTL_MS = 5 * 60 * 1000;

type ScanPerformance = {
  id: number;
  class_name: string;
  title: string | null;
};

type ScanSchedule = {
  id: number;
  round_name: string;
  start_at: string | null;
};

type ScanNamedMaster = {
  id: number;
  name: string;
};

export type ScanTicketMaster = {
  performances: ScanPerformance[];
  schedules: ScanSchedule[];
  ticketTypes: ScanNamedMaster[];
  relationships: ScanNamedMaster[];
  showLengthMinutes: number;
  fetchedAt: number;
};

export type ResolvedScanTicketDisplay = {
  performanceName: string;
  performanceTitle: string | null;
  scheduleName: string;
  scheduleDate: string;
  scheduleTime: string;
  scheduleEndTime: string;
  ticketTypeLabel: string;
  relationshipName: string;
};

let inMemoryMaster: ScanTicketMaster | null = null;

const isFresh = (fetchedAt: number): boolean =>
  Date.now() - fetchedAt <= SCAN_TICKET_MASTER_CACHE_TTL_MS;

const readCache = (): ScanTicketMaster | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SCAN_TICKET_MASTER_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ScanTicketMaster;
    if (!parsed || !Array.isArray(parsed.performances)) {
      return null;
    }
    if (!isFresh(Number(parsed.fetchedAt ?? 0))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (master: ScanTicketMaster): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      SCAN_TICKET_MASTER_CACHE_KEY,
      JSON.stringify(master),
    );
  } catch {
    // ignore cache write errors
  }
};

const fetchMasterFromSupabase = async (): Promise<ScanTicketMaster> => {
  const [
    performancesRes,
    schedulesRes,
    ticketTypesRes,
    relationshipsRes,
    configRes,
  ] = await Promise.all([
    supabase
      .from('class_performances')
      .select('id, class_name, title')
      .order('id', { ascending: true }),
    supabase
      .from('performances_schedule')
      .select('id, round_name, start_at')
      .order('id', { ascending: true }),
    supabase
      .from('ticket_types')
      .select('id, name')
      .order('id', { ascending: true }),
    supabase
      .from('relationships')
      .select('id, name')
      .order('id', { ascending: true }),
    supabase
      .from('configs')
      .select('show_length')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    performancesRes.error ||
    schedulesRes.error ||
    ticketTypesRes.error ||
    relationshipsRes.error ||
    configRes.error
  ) {
    throw new Error('failed_to_fetch_scan_ticket_master');
  }

  return {
    performances: (performancesRes.data ?? []) as ScanPerformance[],
    schedules: (schedulesRes.data ?? []) as ScanSchedule[],
    ticketTypes: (ticketTypesRes.data ?? []) as ScanNamedMaster[],
    relationships: (relationshipsRes.data ?? []) as ScanNamedMaster[],
    showLengthMinutes: Number(configRes.data?.show_length ?? 0),
    fetchedAt: Date.now(),
  };
};

export const preloadScanTicketMaster = async (): Promise<ScanTicketMaster> => {
  if (inMemoryMaster && isFresh(inMemoryMaster.fetchedAt)) {
    return inMemoryMaster;
  }

  const cached = readCache();
  if (cached) {
    inMemoryMaster = cached;
    return cached;
  }

  const fetched = await fetchMasterFromSupabase();
  inMemoryMaster = fetched;
  writeCache(fetched);
  return fetched;
};

export const resolveScanTicketDisplay = (
  decoded: TicketDecodedDisplaySeed,
  master: ScanTicketMaster,
): ResolvedScanTicketDisplay => {
  const isAdmissionOnly = decoded.performanceId === 0 && decoded.scheduleId === 0;

  const performance = master.performances.find(
    (item) => item.id === decoded.performanceId,
  );
  const schedule = master.schedules.find((item) => item.id === decoded.scheduleId);
  const ticketType = master.ticketTypes.find(
    (item) => item.id === decoded.ticketTypeId,
  );
  const relationship = master.relationships.find(
    (item) => item.id === decoded.relationshipId,
  );

  if (isAdmissionOnly) {
    return {
      performanceName: '入場専用券',
      performanceTitle: null,
      scheduleName: '',
      scheduleDate: '',
      scheduleTime: '',
      scheduleEndTime: '',
      ticketTypeLabel: ticketType?.name ?? '-',
      relationshipName: relationship?.name ?? '-',
    };
  }

  const startAt = schedule?.start_at ? new Date(schedule.start_at) : null;
  const showLengthMinutes = Number(master.showLengthMinutes);
  const endAt =
    startAt && Number.isFinite(showLengthMinutes)
      ? new Date(startAt.getTime() + showLengthMinutes * 60 * 1000)
      : null;

  return {
    performanceName: performance?.class_name ?? '-',
    performanceTitle: performance?.title ?? null,
    scheduleName: schedule?.round_name ?? '-',
    scheduleDate: startAt
      ? startAt.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      : '-',
    scheduleTime: startAt
      ? startAt.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-',
    scheduleEndTime: endAt
      ? endAt.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-',
    ticketTypeLabel: ticketType?.name ?? '-',
    relationshipName: relationship?.name ?? '-',
  };
};
