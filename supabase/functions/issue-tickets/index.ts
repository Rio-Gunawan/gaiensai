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
import { YEAR_BITS } from '@shared/ticketDataType.ts';

type IssueTicketsRequest = {
  ticketTypeId: number;
  relationshipId: number;
  performanceId: number;
  scheduleId: number;
  issueCount: number;
  turnstileToken: string;
  // If provided, the backend will (cancel old + issue new) transactionally.
  // Intended for "relationship change" reissue.
  cancelCode?: string;
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
  const turnstileToken = parsed.turnstileToken;
  const cancelCodeRaw = parsed.cancelCode;

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

  if (
    typeof turnstileToken !== 'string' ||
    turnstileToken.trim().length === 0
  ) {
    throw new HttpError(400, 'Turnstileトークンがありません。');
  }

  const cancelCode =
    typeof cancelCodeRaw === 'string' && cancelCodeRaw.trim().length > 0
      ? cancelCodeRaw.trim()
      : undefined;

  return {
    ticketTypeId,
    relationshipId,
    performanceId,
    scheduleId,
    issueCount,
    turnstileToken: turnstileToken.trim(),
    cancelCode,
  };
};

const verifyTurnstileToken = async (
  req: Request,
  token: string,
): Promise<void> => {
  const secret = getEnv('TURNSTILE_SECRET_KEY');
  const ipHeader =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for') ??
    '';
  const remoteIp = ipHeader.split(',')[0]?.trim();

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const verifyRes = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );

  if (!verifyRes.ok) {
    throw new HttpError(
      502,
      'Turnstile検証サーバーへの接続に失敗しました。時間をおいて再度お試しください。',
    );
  }

  const verifyPayload = (await verifyRes.json()) as {
    success?: boolean;
    'error-codes'?: string[];
  };

  if (!verifyPayload.success) {
    const codes = (verifyPayload['error-codes'] ?? []).join(', ');
    throw new HttpError(
      403,
      `Turnstile認証に失敗しました。${codes ? `(${codes})` : ''}`,
    );
  }
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

export const handleIssueTicketsRequest = async (
  req: Request,
): Promise<Response> => {
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
    await verifyTurnstileToken(req, body.turnstileToken);

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

    if (body.cancelCode && body.issueCount !== 1) {
      throw new HttpError(400, '差し替え発券は1枚ずつのみ対応しています。');
    }

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

    // For transactional "replace/reissue", validate the target ticket early and
    // adjust the per-user ticket limit check to account for the cancellation.
    let replaceTicketOffset = 0;
    if (body.cancelCode) {
      const { data: oldTicket, error: oldTicketError } = await adminClient
        .from('tickets')
        .select('id, user_id, status, ticket_type')
        .eq('code', body.cancelCode)
        .maybeSingle();

      if (oldTicketError || !oldTicket) {
        throw new HttpError(
          409,
          '差し替え対象のチケット情報の取得に失敗しました。時間をおいて再度お試しください。',
        );
      }

      if (oldTicket.user_id !== user.id) {
        throw new HttpError(403, '差し替え対象のチケットが不正です。');
      }

      if (oldTicket.status !== 'valid') {
        throw new HttpError(
          409,
          '差し替え対象のチケットが有効ではありません。',
        );
      }

      if (Number(oldTicket.ticket_type) !== body.ticketTypeId) {
        throw new HttpError(
          409,
          '差し替え対象のチケット情報が一致しません。ページを更新してからやり直してください。',
        );
      }

      if (body.ticketTypeId === 4) {
        if (body.performanceId !== 0 || body.scheduleId !== 0) {
          throw new HttpError(
            409,
            '差し替え対象のチケット情報が一致しません。ページを更新してからやり直してください。',
          );
        }
      } else {
        const { data: classTicket, error: classTicketError } = await adminClient
          .from('class_tickets')
          .select('class_id, round_id')
          .eq('id', oldTicket.id)
          .maybeSingle();

        if (classTicketError || !classTicket) {
          throw new HttpError(
            409,
            '差し替え対象のチケット情報の取得に失敗しました。時間をおいて再度お試しください。',
          );
        }

        if (
          Number(classTicket.class_id) !== body.performanceId ||
          Number(classTicket.round_id) !== body.scheduleId
        ) {
          throw new HttpError(
            409,
            '差し替え対象のチケット情報が一致しません。ページを更新してからやり直してください。',
          );
        }
      }

      replaceTicketOffset = 1;
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
    const effectiveExisting = Math.max(0, existing - replaceTicketOffset);

    if (effectiveExisting + body.issueCount > maxTicketsPerUser) {
      throw new HttpError(
        409,
        `チケット発行上限を超えています（既に ${existing} 枚）。1ユーザあたり最大 ${maxTicketsPerUser} 枚です。
        さらに必要な場合は、まだ発行可能枚数に余裕がある他の生徒に、招待券を分けてもらえないかと相談してください。`,
      );
    }

    // チケットコードのプレフィックスを生成（学年クラス番号 + チケット種別 + 間柄 + 公演ID + 回ID + 発行年をYEAR_BITSで割ったあまり）
    const issuedYear = new Date().getUTCFullYear() % 2 ** Number(YEAR_BITS);
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

    if (counterError) {
      throw new HttpError(
        500,
        'チケットコードのカウンターの更新に失敗しました。しばらく時間を置いてから、もう一度お試しください。:' +
          counterError.message,
      );
    }

    if (counterData === null) {
      throw new HttpError(
        500,
        '一時的にエラーが発生しました。時間をおいてもう一度お試しください。',
      );
    }
    const endSerial = counterData as number;
    let issuedTickets: Array<{ code: string; signature: string }>;

    if (!body.cancelCode) {
      issuedTickets = await issueWithRollback({
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
    } else {
      const startSerial = endSerial - body.issueCount + 1;
      let shouldRollbackCounter = true;

      try {
        const serial = startSerial; // issueCount is validated to be 1
        const ticketData = {
          affiliation,
          relationship: body.relationshipId,
          type: body.ticketTypeId,
          performance: body.performanceId,
          schedule: body.scheduleId,
          year: new Date().getUTCFullYear(),
          serial,
        };

        const code = await generateTicketCode(ticketData);
        const signature = await signCode(code);

        const { data, error } = await adminClient.rpc(
          'reissue_ticket_change_relationship_with_codes',
          {
            p_user_id: user.id,
            p_old_code: body.cancelCode,
            p_ticket_type_id: body.ticketTypeId,
            p_performance_id: body.performanceId,
            p_schedule_id: body.scheduleId,
            p_new_relationship_id: body.relationshipId,
            p_issue_count: body.issueCount,
            p_codes: [code],
            p_signatures: [signature],
          },
        );

        if (error) {
          throw new HttpError(409, error.message);
        }

        issuedTickets =
          (data as Array<{ code: string; signature: string }>) ?? [];
        shouldRollbackCounter = false;
      } finally {
        if (shouldRollbackCounter) {
          const { data: rollbackApplied, error: rollbackError } =
            await adminClient.rpc('rollback_ticket_code_counter', {
              p_prefix: basePrefix,
              p_decrement: body.issueCount,
              p_expected_last_value: endSerial,
            });

          if (rollbackError) {
            console.error('Failed to rollback ticket code counter', {
              userId: user.id,
              prefix: basePrefix,
              issueCount: body.issueCount,
              endSerial,
              rollbackError,
            });
          } else if (rollbackApplied !== true) {
            console.error(
              'Counter rollback was skipped because state changed',
              {
                userId: user.id,
                prefix: basePrefix,
                issueCount: body.issueCount,
                endSerial,
              },
            );
          }
        }
      }
    }

    console.log('Issued tickets successfully', {
      userId: user.id,
      ticketTypeId: body.ticketTypeId,
      relationshipId: body.relationshipId,
      performanceId: body.performanceId,
      scheduleId: body.scheduleId,
      issueCount: body.issueCount,
      cancelCode: body.cancelCode ?? null,
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
