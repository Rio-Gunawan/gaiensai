/* eslint-disable no-console */
import { getLocalIP } from './ip.ts';
import {
  useTicket,
  logTicketScan,
  getEntryCount,
  getRecentScanLogs,
} from './ticket.ts';

const ip = await getLocalIP();

console.log('ローカルサーバーが起動しました。');
console.log('Local: http://localhost:8000');

if (ip) {
  console.log(`LAN:   http://${ip}:8000`);
}

function contentType(path: string) {
  if (path.endsWith('.html')) {
    return 'text/html';
  }
  if (path.endsWith('.js')) {
    return 'application/javascript';
  }
  if (path.endsWith('.css')) {
    return 'text/css';
  }
  if (path.endsWith('.json')) {
    return 'application/json';
  }
  if (path.endsWith('.png')) {
    return 'image/png';
  }
  if (path.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return 'text/plain';
}

Deno.serve(async (req) => {
  // preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);

  // API
  if (url.pathname === '/api' && req.method === 'POST') {
    const body = await req.json();
    const result = useTicket(body.id);

    console.log(
      'リクエストを受け付けました。チケットID: ',
      body.id,
      '検証結果: ',
      result,
    );

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // ログ記録エンドポイント
  if (url.pathname === '/api/log' && req.method === 'POST') {
    const body = await req.json();
    const { code, result } = body;

    if (code && result) {
      logTicketScan(code, result);
      console.log('ログを記録しました。コード:', code, '結果:', result);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // 統計情報エンドポイント（入場者数）
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const count = getEntryCount();
    return new Response(JSON.stringify({ entryCount: count }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // 読み取り履歴エンドポイント
  if (url.pathname === '/api/records' && req.method === 'GET') {
    const records = getRecentScanLogs();
    return new Response(JSON.stringify({ records }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // 静的ファイル
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = './dist' + path;

  try {
    const file = await Deno.readFile(filePath);
    return new Response(file, {
      headers: {
        'Content-Type': contentType(filePath),
      },
    });
  } catch {
    // SPA fallback
    const index = await Deno.readFile('./dist/index.html');
    return new Response(index, {
      headers: {
        'Content-Type': contentType('/index.html'),
      },
    });
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
