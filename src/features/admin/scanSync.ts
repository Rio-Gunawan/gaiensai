export const SCAN_SERVER_URL_STORAGE_KEY = 'scan_server_url';

export type ScanRecord = {
  id: number;
  ticket_code: string;
  scanned_at: string;
  result: string;
  count: number;
};

export const scanResultLabels: Record<string, string> = {
  success: '成功',
  duplicate: '重複',
  reentry: '再入場',
  failed: 'エラー',
  unverified: '署名検証エラー',
  wrongYear: '年度確認エラー',
};

export function normalizeServerUrl(localServerUrl: string) {
  let url = localServerUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '');
}

export function buildScanApiUrl(localServerUrl: string) {
  return normalizeServerUrl(localServerUrl) + '/api';
}

export function clampCount(next: number) {
  return next < 1 ? 1 : next;
}

export async function fetchScanRecordsFromServer(
  localServerUrl: string,
  options?: { all?: boolean },
) {
  const recordsUrl =
    buildScanApiUrl(localServerUrl) +
    '/records' +
    (options?.all ? '?all=1' : '');
  const res = await fetch(recordsUrl);
  const data = await res.json();
  return Array.isArray(data.records) ? (data.records as ScanRecord[]) : [];
}

export async function fetchEntryCountFromServer(localServerUrl: string) {
  const res = await fetch(buildScanApiUrl(localServerUrl) + '/stats');
  const data = await res.json();
  return typeof data.entryCount === 'number' ? data.entryCount : 0;
}

export async function updateRecordCountOnServer(
  localServerUrl: string,
  logId: number,
  code: string,
  count: number,
) {
  await fetch(buildScanApiUrl(localServerUrl) + '/count', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      logId,
      code,
      count,
    }),
  });
}

export async function updateReentryCountOnServer(
  localServerUrl: string,
  code: string,
  count: number,
) {
  await fetch(buildScanApiUrl(localServerUrl) + '/reentry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      count,
    }),
  });
}

export async function deleteScanRecordOnServer(
  localServerUrl: string,
  logId: number,
) {
  await fetch(buildScanApiUrl(localServerUrl) + '/records', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      logId,
    }),
  });
}

export async function logTicketToServer(
  localServerUrl: string,
  code: string,
  result: string,
  count: number,
) {
  const res = await fetch(buildScanApiUrl(localServerUrl) + '/log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code.replace('-', ''),
      result,
      count,
    }),
  });

  const data = await res.json();
  return typeof data?.logId === 'number' ? data.logId : null;
}
