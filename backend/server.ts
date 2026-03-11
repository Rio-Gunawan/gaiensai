import { useTicket } from './ticket.ts';

Deno.serve(async (req) => {
  // preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  const body = await req.json();
  const result = useTicket(body.id);

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
