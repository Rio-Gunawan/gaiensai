import 'jsr:@supabase/functions-js@2.90.1/edge-runtime.d.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type TicketDisplay = {
  code: string;
  signature: string;
  performanceName: string;
  performanceTitle: string | null;
  scheduleName: string;
  ticketTypeLabel: string;
  relationshipName: string;
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);

  if (!value) {
    throw new Error(`${key} is not configured`);
  }

  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { code, signature } = (await req.json()) as {
      code?: string;
      signature?: string;
    };

    if (!code || !signature) {
      return new Response(
        JSON.stringify({ error: 'code and signature are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, code, signature, ticket_type, relationship, status')
      .eq('code', code)
      .eq('signature', signature)
      .maybeSingle();

    if (ticketError || !ticket || ticket.status !== 'valid') {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: classTicket, error: classTicketError } = await supabase
      .from('class_tickets')
      .select('class_id, round_id')
      .eq('id', ticket.id)
      .maybeSingle();

    if (classTicketError || !classTicket) {
      return new Response(
        JSON.stringify({ error: 'Class ticket detail not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const [performanceRes, scheduleRes, ticketTypeRes, relationshipRes] =
      await Promise.all([
        supabase
          .from('class_performances')
          .select('class_name, title')
          .eq('id', classTicket.class_id)
          .maybeSingle(),
        supabase
          .from('class_performances_schedule')
          .select('round_name')
          .eq('id', classTicket.round_id)
          .maybeSingle(),
        supabase
          .from('ticket_types')
          .select('name')
          .eq('id', ticket.ticket_type)
          .maybeSingle(),
        supabase
          .from('relationships')
          .select('name')
          .eq('id', ticket.relationship)
          .maybeSingle(),
      ]);

    if (
      performanceRes.error ||
      scheduleRes.error ||
      ticketTypeRes.error ||
      relationshipRes.error ||
      !performanceRes.data ||
      !scheduleRes.data
    ) {
      return new Response(
        JSON.stringify({ error: 'Failed to resolve ticket details' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const payload: TicketDisplay = {
      code: ticket.code,
      signature: ticket.signature,
      performanceName: performanceRes.data.class_name,
      performanceTitle: performanceRes.data.title,
      scheduleName: scheduleRes.data.round_name,
      ticketTypeLabel: ticketTypeRes.data?.name ?? '-',
      relationshipName: relationshipRes.data?.name ?? '-',
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
