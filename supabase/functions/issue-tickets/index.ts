/* eslint-disable no-console */

import '@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from '@supabase/supabase-js';

import { getCorsHeaders } from '@shared/cors.ts';
import { getEnv } from '@shared/getEnv.ts';
import HttpError from '@shared/HttpError.ts';
import {
  encodeBase58,
  generateTicketCode,
  signCode,
} from '@shared/generateTicketCode.ts';
import { issueWithRollback, type RpcClient } from './issueWithRollback.ts';

type IssueTicketsRequest = {
  ticketTypeId: number;
  relationshipId: number;
  performanceId: number;
  scheduleId: number;
  issueCount: number;
};

const padNumber = (value: number, length: number): string =>
  String(value).padStart(length, '0');

const parseRequestBody = (body: unknown): IssueTicketsRequest => {
  if (!body || typeof body !== 'object') {
    throw new HttpError(
      400,
      'リクエストボディが正しくありません。システム担当にお問い合わせください。',
    );
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
    throw new HttpError(
      400,
      'リクエストボディのフィールドはすべて整数でなければなりません。システム担当にお問い合わせください。',
    );
  }

  if (ticketTypeId < 1 || relationshipId < 1 || issueCount < 1) {
    throw new HttpError(
      400,
      'リクエストボディに無効な数値範囲が含まれています。システム担当にお問い合わせください。',
    );
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

const validatePerformanceAndSchedule = (
  body: IssueTicketsRequest,
  admissionOnlyTicketTypeIds: number[],
): void => {
  const admissionOnlySet = new Set(admissionOnlyTicketTypeIds);
  const isAdmissionOnly = admissionOnlySet.has(body.ticketTypeId);

  if (isAdmissionOnly) {
    if (body.performanceId !== 0 || body.scheduleId !== 0) {
      throw new HttpError(
        400,
        'リクエストが間違っています。システム担当にお問い合わせください。Admission-only ticket requires performanceId=0 and scheduleId=0',
      );
    }
    return;
  }

  if (body.performanceId < 1 || body.scheduleId < 1) {
    throw new HttpError(
      400,
      'リクエストが間違っています。システム担当にお問い合わせください。performanceId and scheduleId must be positive for this ticket type',
    );
  }
};

export const handleIssueTicketsRequest = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // CORSプリフライトリクエストへの対応
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
      throw new HttpError(
        401,
        '認証情報がありません。Bearerトークンを含むAuthorizationヘッダーが必要です。',
      );
    }

    const accessToken = authorization.slice('Bearer '.length).trim();

    if (!accessToken) {
      throw new HttpError(401, '認証情報がありません。');
    }

    const body = parseRequestBody(await req.json());

    const supabaseUrl = getEnv('SUPABASE_URL');
    const publishableKey = getEnv('PUBLISHABLE_KEY');
    const secretKey = getEnv('FOR_ISSUE_TICKETS_SUPABASE_SECRET_KEY');

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, secretKey, {
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
      throw new HttpError(
        401,
        'ログイン情報の確認に失敗しました。正しくログインされていますか?',
      );
    }

    const { data: userRow, error: userRowError } = await adminClient
      .from('users')
      .select('affiliation, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userRowError) {
      throw new HttpError(
        500,
        'ユーザーデータの取得に失敗しました。外苑祭総務にお問い合わせください。',
      );
    }

    if (!userRow || userRow.role !== 'student') {
      throw new HttpError(403, '生徒以外はチケットを発行できません。');
    }

    const affiliation = Number(userRow.affiliation ?? -1);

    if (
      !Number.isInteger(affiliation) ||
      affiliation < 1000 ||
      affiliation > 3999
    ) {
      throw new HttpError(
        400,
        'ユーザーデータの学年クラス番号が不正です。外苑祭総務にお問い合わせください。',
      );
    }

    const { data: admissionOnlyTicketTypes, error: admissionOnlyTypeError } =
      await adminClient
        .from('ticket_types')
        .select('id')
        .eq('name', '入場専用券');

    if (admissionOnlyTypeError) {
      throw new HttpError(
        500,
        '入場専用券情報の取得に失敗しました。外苑祭総務にお問い合わせください。',
      );
    }

    const admissionOnlyTicketTypeIds = (
      (admissionOnlyTicketTypes ?? []) as Array<{ id: number }>
    ).map((row) => Number(row.id));

    if (admissionOnlyTicketTypeIds.length === 0) {
      throw new HttpError(
        500,
        "ticket_types に name='入場専用券' のデータがありません。外苑祭総務にお問い合わせください。",
      );
    }

    validatePerformanceAndSchedule(body, admissionOnlyTicketTypeIds);

    // Check per-user max tickets before reserving serial numbers to avoid
    // incrementing the counter when the user would exceed their limit.
    const { data: configRow, error: configError } = await adminClient
      .from('configs')
      .select('max_tickets_per_user')
      .order('id', { ascending: true })
      .maybeSingle();

    if (configError) {
      throw new HttpError(
        500,
        '設定の取得に失敗しました。外苑祭総務にお問い合わせください。',
      );
    }

    if (!configRow || configRow.max_tickets_per_user === null) {
      throw new HttpError(
        500,
        'チケット発行上限の設定が見つかりません。外苑祭総務にお問い合わせください。',
      );
    }

    const maxTicketsPerUser = Number(configRow.max_tickets_per_user);

    if (body.issueCount > maxTicketsPerUser) {
      throw new HttpError(
        409,
        `1回の発行枚数がユーザ上限を超えています。最大 ${maxTicketsPerUser} 枚までです。
        さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。`,
      );
    }

    const { count: existingCount, error: existingCountError } =
      await adminClient
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'valid');

    if (existingCountError) {
      throw new HttpError(
        500,
        '既存チケット数の取得に失敗しました。外苑祭総務にお問い合わせください。',
      );
    }

    const existing = Number(existingCount ?? 0);

    if (existing + body.issueCount > maxTicketsPerUser) {
      throw new HttpError(
        409,
        `チケット発行上限を超えています（既に ${existing} 枚）。1ユーザあたり最大 ${maxTicketsPerUser} 枚です。
        さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。`,
      );
    }

    // チケットコードのプレフィックスを生成（学年クラス番号 + チケット種別 + 間柄 + 公演ID + 回ID + 発行年の下2桁）
    const issuedYear = new Date().getUTCFullYear() % 100;
    const concatenated = `${padNumber(affiliation, 4)}${padNumber(body.ticketTypeId, 1)}${padNumber(body.relationshipId, 1)}${padNumber(body.performanceId, 2)}${padNumber(body.scheduleId, 2)}${padNumber(issuedYear, 2)}`;
    const basePrefix = encodeBase58(BigInt(concatenated));

    // プレフィックスをキーとして発行枚数をデータベースに登録し、シリアル番号を取得
    const { data: counterData, error: counterError } = await adminClient.rpc(
      'increment_ticket_code_counter',
      {
        p_prefix: basePrefix,
        p_increment: body.issueCount,
      },
    );

    if (counterError?.message.includes('exceeded')) {
      throw new HttpError(
        409,
        '同一種類(公演クラス・回・間柄が同じチケット)のチケット発行可能最大枚数(15枚)を超えています。申し訳ありませんが、公演回を変えて発行してください。',
      );
    }

    if (counterError || counterData === null) {
      throw new HttpError(
        500,
        'チケットコードのカウンターの更新に失敗しました。外苑祭総務にお問い合わせください。',
      );
    }

    const endSerial = counterData as number;
    const issuedTickets = await issueWithRollback({
      adminClient: adminClient as unknown as RpcClient,
      userId: user.id,
      issueCount: body.issueCount,
      ticketTypeId: body.ticketTypeId,
      relationshipId: body.relationshipId,
      performanceId: body.performanceId,
      scheduleId: body.scheduleId,
      affiliation,
      issuedYear,
      basePrefix,
      endSerial,
      generateCode: generateTicketCode,
      signTicketCode: signCode,
    });

    console.log('Issued tickets successfully', {
      userId: user.id,
      ticketTypeId: body.ticketTypeId,
      relationshipId: body.relationshipId,
      performanceId: body.performanceId,
      scheduleId: body.scheduleId,
      issueCount: body.issueCount,
    });

    return new Response(
      JSON.stringify({
        issuedTickets,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const httpError = error instanceof HttpError ? error : null;
    const status = httpError?.status ?? 500;
    const message =
      error instanceof Error ? error.message : 'Unexpected server error';

    console.error('Error processing request:', { error, status, message });

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

if (import.meta.main) {
  Deno.serve(handleIssueTicketsRequest);
}
