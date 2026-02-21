import 'jsr:@supabase/functions-js@2.90.1/edge-runtime.d.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type IssueTicketsRequest = {
  ticketTypeId: number;
  relationshipId: number;
  performanceId: number;
  scheduleId: number;
  issueCount: number;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);

  if (!value) {
    throw new Error(`${key} is not configured`);
  }

  return value;
};

const getBase58Alphabet = (): string => {
  const alphabet = Deno.env.get('BASE58_ALPHABET');

  if (!alphabet) {
    throw new HttpError(500, 'BASE58_ALPHABET is not configured');
  }

  if (alphabet.length !== 58) {
    throw new HttpError(500, 'BASE58_ALPHABET must contain 58 characters');
  }

  return alphabet;
};

const toBase58FromBigInt = (value: bigint, alphabet: string): string => {
  if (value < 0n) {
    throw new Error('Negative values are not supported for base58 encoding');
  }

  if (value === 0n) {
    return alphabet[0];
  }

  let current = value;
  let encoded = '';

  while (current > 0n) {
    const remainder = Number(current % 58n);
    encoded = `${alphabet[remainder]}${encoded}`;
    current /= 58n;
  }

  return encoded;
};

const padNumber = (value: number, length: number): string =>
  String(value).padStart(length, '0');

const parseRequestBody = (body: unknown): IssueTicketsRequest => {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Invalid request body');
  }

  const parsed = body as Record<string, unknown>;

  const ticketTypeId = Number(parsed.ticketTypeId);
  const relationshipId = Number(parsed.relationshipId);
  const performanceId = Number(parsed.performanceId);
  const scheduleId = Number(parsed.scheduleId);
  const issueCount = Number(parsed.issueCount);

  if (
    !Number.isInteger(ticketTypeId) ||
    !Number.isInteger(relationshipId) ||
    !Number.isInteger(performanceId) ||
    !Number.isInteger(scheduleId) ||
    !Number.isInteger(issueCount)
  ) {
    throw new HttpError(400, 'Request includes non-integer fields');
  }

  if (
    ticketTypeId < 1 ||
    relationshipId < 1 ||
    performanceId < 1 ||
    scheduleId < 1 ||
    issueCount < 1
  ) {
    throw new HttpError(400, 'Request includes invalid numeric ranges');
  }

  if (ticketTypeId > 9 || relationshipId > 9) {
    throw new HttpError(400, 'ticketTypeId or relationshipId exceeds 1 digit');
  }

  if (performanceId > 99 || scheduleId > 99) {
    throw new HttpError(400, 'performanceId or scheduleId exceeds 2 digits');
  }

  if (issueCount > 100) {
    throw new HttpError(400, 'Cannot issue more than 100 tickets at a time');
  }

  return {
    ticketTypeId,
    relationshipId,
    performanceId,
    scheduleId,
    issueCount,
  };
};

const decodeBase64Flexible = (encoded: string): Uint8Array => {
  const normalized = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const signingKeyPromise = (() => {
  const privateKeyBase64 =
    Deno.env.get('TICKET_SIGNING_PRIVATE_KEY_PKCS8_BASE64') ??
    Deno.env.get('TICKET_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL');

  if (!privateKeyBase64) {
    throw new Error(
      'TICKET_SIGNING_PRIVATE_KEY_PKCS8_BASE64 is not configured',
    );
  }

  const privateKeyBytes = decodeBase64Flexible(privateKeyBase64);

  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(privateKeyBytes),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
})();

const signCode = async (code: string): Promise<string> => {
  const key = await signingKeyPromise;
  const payload = new TextEncoder().encode(code);
  const signature = await crypto.subtle.sign('Ed25519', key, payload);

  return encodeBase64Url(new Uint8Array(signature));
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
    const authorization = req.headers.get('Authorization') ?? '';

    if (!authorization.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing bearer token');
    }

    const accessToken = authorization.slice('Bearer '.length).trim();

    if (!accessToken) {
      throw new HttpError(401, 'Missing access token');
    }

    const body = parseRequestBody(await req.json());
    const base58Alphabet = getBase58Alphabet();

    const supabaseUrl = getEnv('SUPABASE_URL');
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('FOR_LINE_SUPABASE_SECRET_KEY');

    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      throw new HttpError(401, 'Authentication failed');
    }

    const { data: userRow, error: userRowError } = await adminClient
      .from('users')
      .select('affiliation, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userRowError) {
      throw new HttpError(500, 'Failed to load user profile');
    }

    if (!userRow || userRow.role !== 'student') {
      throw new HttpError(403, 'Only students can issue tickets');
    }

    const affiliation = Number(userRow.affiliation ?? -1);

    if (
      !Number.isInteger(affiliation) ||
      affiliation < 0 ||
      affiliation > 9999
    ) {
      throw new HttpError(400, 'Invalid affiliation value');
    }

    const issuedYear = new Date().getUTCFullYear() % 100;
    const concatenated = `${padNumber(affiliation, 4)}${padNumber(body.ticketTypeId, 1)}${padNumber(body.relationshipId, 1)}${padNumber(body.performanceId, 2)}${padNumber(body.scheduleId, 2)}${padNumber(issuedYear, 2)}`;
    const basePrefix = toBase58FromBigInt(BigInt(concatenated), base58Alphabet);

    const { data: counterData, error: counterError } = await adminClient.rpc(
      'increment_ticket_code_counter',
      {
        p_prefix: basePrefix,
        p_increment: body.issueCount,
      },
    );

    if (counterError || counterData === null) {
      throw new HttpError(500, 'Failed to increment ticket counter');
    }

    const endSerial = BigInt(counterData as number);
    const startSerial = endSerial - BigInt(body.issueCount) + 1n;

    const codes = Array.from({ length: body.issueCount }, (_, i) => {
      const serial = startSerial + BigInt(i);
      return `${basePrefix}${toBase58FromBigInt(serial, base58Alphabet)}`;
    });

    const signatures = await Promise.all(codes.map((code) => signCode(code)));

    const { data: issuedTickets, error: issueError } = await adminClient.rpc(
      'issue_class_tickets_with_codes',
      {
        p_user_id: user.id,
        p_ticket_type_id: body.ticketTypeId,
        p_relationship_id: body.relationshipId,
        p_performance_id: body.performanceId,
        p_schedule_id: body.scheduleId,
        p_issue_count: body.issueCount,
        p_codes: codes,
        p_signatures: signatures,
      },
    );

    if (issueError) {
      throw new HttpError(409, issueError.message);
    }

    return new Response(
      JSON.stringify({
        issuedTickets:
          (issuedTickets as Array<{ code: string; signature: string }>) ?? [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : 'Unexpected server error';

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
