import { getLocalIP } from './ip.ts';
import {
  useTicket,
  logTicketScan,
  getEntryCount,
  getRecentScanLogs,
  updateScanLogCount,
  updateTicketCount,
  updateTicketUsedAndCount,
  deleteScanLogAndUpdateTicket,
} from './ticket.ts';
import { logOperation } from './operationLog.ts';

const ip = await getLocalIP();

logOperation('backend/server.ts:startup', 'ローカルサーバーが起動しました。');
logOperation('backend/server.ts:startup', 'Local: http://localhost:8000');

if (ip) {
  logOperation('backend/server.ts:startup', `LAN:   http://${ip}:8000`);
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
    const id = body.id.split('.')[0].replace('-', '');

    const result = useTicket(id, body.count ?? 1);

    logOperation(
      'backend/server.ts:api',
      'リクエストを受け付けました。チケットID: ',
      body.id,
      '検証結果: ',
      result,
      '人数:',
      body.count ?? 1,
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
    const { code, result, count = 1 } = body;

    if (code && result) {
      const logId = logTicketScan(code, result, count);
      logOperation(
        'backend/server.ts:api/log',
        'ログを記録しました。コード:',
        code,
        '結果:',
        result,
        '人数:',
        count ?? 1,
      );
      return new Response(JSON.stringify({ ok: true, logId }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify({ ok: false }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // 人数更新エンドポイント
  if (url.pathname === '/api/count' && req.method === 'POST') {
    const body = await req.json();
    const { logId, code, count } = body;

    if (logId && count !== undefined) {
      updateScanLogCount(logId, count);
      if (code) {
        updateTicketCount(code, count);
      }
      logOperation(
        'backend/server.ts:api/count',
        '人数を更新しました。ログID:',
        logId,
        'コード:',
        code,
        '人数:',
        count,
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  // 再入場確定エンドポイント（used_at と count を更新）
  if (url.pathname === '/api/reentry' && req.method === 'POST') {
    const body = await req.json();
    const { code, count = 1 } = body;

    if (code !== undefined) {
      updateTicketUsedAndCount(code, count);
      logOperation(
        'backend/server.ts:api/reentry',
        '再入場を確定しました。コード:',
        code,
        '人数:',
        count,
      );
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

  // 読み取り履歴削除エンドポイント
  if (url.pathname === '/api/records' && req.method === 'DELETE') {
    const body = await req.json();
    const { logId } = body;

    if (logId) {
      const result = deleteScanLogAndUpdateTicket(logId);
      logOperation(
        'backend/server.ts:api/records/delete',
        '読み取り履歴を削除しました。',
        result,
      );
      return new Response(JSON.stringify(result), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify({ ok: false }), {
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
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
