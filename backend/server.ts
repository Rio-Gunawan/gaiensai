/* eslint-disable no-console */
import { getLocalIP } from './ip.ts';
import { useTicket } from './ticket.ts';

const ip = await getLocalIP();

console.log('ローカルサーバーが起動しました。');
console.log('Local: http://localhost:8000');

if (ip) {
  console.log(`LAN:   http://${ip}:8000`);
}


Deno.serve(async (req) => {
  // preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  const body = await req.json();
  const result = useTicket(body.id);

  console.log('リクエストを受け付けました。チケットID: ', body.id, '検証結果: ', result);

  return new Response(JSON.stringify(result), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
