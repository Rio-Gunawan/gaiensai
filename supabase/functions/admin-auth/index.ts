/* eslint-disable no-console */

import '@supabase/functions-js/edge-runtime.d.ts';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { compare, hash } from 'bcryptjs';

import { getCorsHeaders } from '@shared/cors.ts';
import { getEnv } from '@shared/getEnv.ts';
import HttpError from '@shared/HttpError.ts';

const ADMIN_CONTROL_PANEL_SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const ADMIN_AUTH_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_AUTH_LOCK_DURATION_MS = 1000 * 60 * 10; // 10分

type AdminAuthRequest = {
  action?: unknown;
  password?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
  eventYear?: unknown;
  showLength?: unknown;
  maxTicketsPerUser?: unknown;
  juniorReleaseOpen?: unknown;
  ticketIssuingEnabled?: unknown;
  activeTicketTypeIds?: unknown;
  ticketIssueModes?: unknown;
};

type TicketIssueMode =
  | 'open'
  | 'only-own'
  | 'public-rehearsals'
  | 'auto'
  | 'off';

type TicketIssueModes = {
  classInvite: TicketIssueMode;
  rehearsalInvite: TicketIssueMode;
  gymInvite: TicketIssueMode;
  entryOnly: TicketIssueMode;
  sameDayClass: TicketIssueMode;
  sameDayGym: TicketIssueMode;
};

type AdminAuthBody =
  | { mode: 'login'; password: string }
  | { mode: 'verifySession' }
  | { mode: 'logoutSession' }
  | { mode: 'changePassword'; currentPassword: string; newPassword: string }
  | { mode: 'getSettings' }
  | {
      mode: 'updateTicketTypeSettings';
      activeTicketTypeIds: number[];
      ticketIssueModes: TicketIssueModes;
    }
  | {
      mode: 'updateSettings';
      eventYear: number;
      showLength: number;
      maxTicketsPerUser: number;
      juniorReleaseOpen: boolean;
      ticketIssuingEnabled: boolean;
    };

type AdminConfigRow = {
  id: number;
  admin_password: string;
};

type AdminSettingsRow = {
  id: number;
  event_year: number;
  show_length: number;
  max_tickets_per_user: number;
  junior_release_open: boolean;
  is_active: boolean;
};

type AdminSessionRow = {
  id: string;
  expires_at: string;
};

type AdminRateLimitRow = {
  ip_address: string;
  failed_attempts: number;
  locked_until: string | null;
};

type TicketIssueControlsRow = {
  class_invite_mode: TicketIssueMode;
  rehearsal_invite_mode: TicketIssueMode;
  gym_invite_mode: TicketIssueMode;
  entry_only_mode: TicketIssueMode;
  same_day_class_mode: TicketIssueMode;
  same_day_gym_mode: TicketIssueMode;
};

const ADMIN_SESSION_TOKEN_HEADER = 'x-admin-session-token';
const MAX_SESSION_TOKEN_LENGTH = 512;
const MAX_IP_ADDRESS_LENGTH = 128;
const MANAGED_TICKET_TYPE_IDS = [1, 2, 3, 4, 8, 9] as const;
const TICKET_ISSUE_MODE_VALUES = [
  'open',
  'only-own',
  'public-rehearsals',
  'auto',
  'off',
] as const;
const DEFAULT_TICKET_ISSUE_MODES: TicketIssueModes = {
  classInvite: 'open',
  rehearsalInvite: 'open',
  gymInvite: 'open',
  entryOnly: 'open',
  sameDayClass: 'open',
  sameDayGym: 'open',
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
};

const createRawToken = (): string => {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return `adm_${toHex(random)}`;
};

const readSessionToken = (req: Request): string | null => {
  const token = req.headers.get(ADMIN_SESSION_TOKEN_HEADER)?.trim() ?? '';
  if (!token) {
    return null;
  }

  if (token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new HttpError(400, 'セッショントークンが長すぎます。');
  }

  return token;
};

const getClientIp = (req: Request): string => {
  const fromForwardedFor = req.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const fromRealIp = req.headers.get('x-real-ip')?.trim();
  const fromCf = req.headers.get('cf-connecting-ip')?.trim();
  const candidate = fromForwardedFor || fromRealIp || fromCf || 'unknown';

  if (candidate.length > MAX_IP_ADDRESS_LENGTH) {
    return candidate.slice(0, MAX_IP_ADDRESS_LENGTH);
  }

  return candidate;
};

const normalizePassword = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${fieldName} は文字列で送信してください。`);
  }

  const trimmedPassword = value.trim();
  if (trimmedPassword.length === 0) {
    throw new HttpError(400, `${fieldName} を入力してください。`);
  }

  if (trimmedPassword.length > 256) {
    throw new HttpError(400, `${fieldName} が長すぎます。`);
  }

  return trimmedPassword;
};

const normalizeInteger = (
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${fieldName} は数値で送信してください。`);
  }

  if (!Number.isInteger(value)) {
    throw new HttpError(400, `${fieldName} は整数で送信してください。`);
  }

  if (value < min || value > max) {
    throw new HttpError(
      400,
      `${fieldName} は${min}〜${max}の範囲で指定してください。`,
    );
  }

  return value;
};

const isTicketIssueMode = (value: unknown): value is TicketIssueMode =>
  typeof value === 'string' &&
  (TICKET_ISSUE_MODE_VALUES as readonly string[]).includes(value);

const normalizeTicketIssueModes = (value: unknown): TicketIssueModes => {
  if (!value || typeof value !== 'object') {
    throw new HttpError(
      400,
      'ticketIssueModes はオブジェクトで送信してください。',
    );
  }

  const raw = value as Record<string, unknown>;
  if (
    !isTicketIssueMode(raw.classInvite) ||
    !isTicketIssueMode(raw.rehearsalInvite) ||
    !isTicketIssueMode(raw.gymInvite) ||
    !isTicketIssueMode(raw.entryOnly) ||
    !isTicketIssueMode(raw.sameDayClass) ||
    !isTicketIssueMode(raw.sameDayGym)
  ) {
    throw new HttpError(400, 'ticketIssueModes の値が不正です。');
  }

  return {
    classInvite: raw.classInvite,
    rehearsalInvite: raw.rehearsalInvite,
    gymInvite: raw.gymInvite,
    entryOnly: raw.entryOnly,
    sameDayClass: raw.sameDayClass,
    sameDayGym: raw.sameDayGym,
  };
};

const parseBody = (body: unknown): AdminAuthBody => {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'リクエストボディが不正です。');
  }

  const { action, password, currentPassword, newPassword } =
    body as AdminAuthRequest;

  if (action === 'verify') {
    return { mode: 'verifySession' };
  }

  if (action === 'logout') {
    return { mode: 'logoutSession' };
  }

  if (action === 'changePassword') {
    const normalizedCurrentPassword = normalizePassword(
      currentPassword,
      'currentPassword',
    );
    const normalizedNewPassword = normalizePassword(newPassword, 'newPassword');

    if (normalizedNewPassword.length < 8) {
      throw new HttpError(400, 'newPassword は8文字以上で設定してください。');
    }

    return {
      mode: 'changePassword',
      currentPassword: normalizedCurrentPassword,
      newPassword: normalizedNewPassword,
    };
  }

  if (action === 'getSettings') {
    return { mode: 'getSettings' };
  }

  if (action === 'updateSettings') {
    const {
      eventYear,
      showLength,
      maxTicketsPerUser,
      juniorReleaseOpen,
      ticketIssuingEnabled,
    } = body as AdminAuthRequest;

    if (typeof juniorReleaseOpen !== 'boolean') {
      throw new HttpError(
        400,
        'juniorReleaseOpen は真偽値で送信してください。',
      );
    }
    if (typeof ticketIssuingEnabled !== 'boolean') {
      throw new HttpError(
        400,
        'ticketIssuingEnabled は真偽値で送信してください。',
      );
    }

    return {
      mode: 'updateSettings',
      eventYear: normalizeInteger(eventYear, 'eventYear', 2020, 2100),
      showLength: normalizeInteger(showLength, 'showLength', 1, 300),
      maxTicketsPerUser: normalizeInteger(
        maxTicketsPerUser,
        'maxTicketsPerUser',
        1,
        100,
      ),
      juniorReleaseOpen,
      ticketIssuingEnabled,
    };
  }

  if (action === 'updateTicketTypeSettings') {
    const { activeTicketTypeIds, ticketIssueModes } = body as AdminAuthRequest;
    if (!Array.isArray(activeTicketTypeIds)) {
      throw new HttpError(
        400,
        'activeTicketTypeIds は数値配列で送信してください。',
      );
    }

    const normalizedIds = Array.from(
      new Set(
        activeTicketTypeIds.map((value) =>
          normalizeInteger(value, 'activeTicketTypeIds', 1, 1000),
        ),
      ),
    );

    for (const id of normalizedIds) {
      if (
        !MANAGED_TICKET_TYPE_IDS.includes(
          id as (typeof MANAGED_TICKET_TYPE_IDS)[number],
        )
      ) {
        throw new HttpError(400, `管理対象外の券種IDです: ${id}`);
      }
    }

    return {
      mode: 'updateTicketTypeSettings',
      activeTicketTypeIds: normalizedIds,
      ticketIssueModes: normalizeTicketIssueModes(ticketIssueModes),
    };
  }

  if (action === 'login' || typeof action === 'undefined') {
    const isLegacyChangePasswordRequest =
      typeof currentPassword !== 'undefined' ||
      typeof newPassword !== 'undefined';
    if (isLegacyChangePasswordRequest) {
      const normalizedCurrentPassword = normalizePassword(
        currentPassword,
        'currentPassword',
      );
      const normalizedNewPassword = normalizePassword(
        newPassword,
        'newPassword',
      );

      if (normalizedNewPassword.length < 8) {
        throw new HttpError(400, 'newPassword は8文字以上で設定してください。');
      }

      return {
        mode: 'changePassword',
        currentPassword: normalizedCurrentPassword,
        newPassword: normalizedNewPassword,
      };
    }

    return {
      mode: 'login',
      password: normalizePassword(password, 'password'),
    };
  }

  throw new HttpError(400, 'action が不正です。');
};

const fetchAdminConfig = async (adminClient: SupabaseClient) => {
  const { data, error } = await adminClient
    .from('configs')
    .select('id, admin_password')
    .limit(1);

  if (error) {
    throw error;
  }

  const config = data?.[0] as AdminConfigRow | undefined;
  if (!config || typeof config.id !== 'number') {
    throw new HttpError(500, 'configs.id が取得できませんでした。');
  }

  if (
    typeof config.admin_password !== 'string' ||
    config.admin_password.length === 0
  ) {
    throw new HttpError(500, '管理者パスワードが設定されていません。');
  }

  if (!isBcryptHash(config.admin_password)) {
    throw new HttpError(
      500,
      'configs.admin_password が bcrypt ハッシュ形式ではありません。',
    );
  }

  return {
    id: config.id,
    passwordHash: config.admin_password,
  };
};

const fetchAdminSettings = async (adminClient: SupabaseClient) => {
  const { data, error } = await adminClient
    .from('configs')
    .select(
      'id, event_year, show_length, max_tickets_per_user, junior_release_open, is_active',
    )
    .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0] as AdminSettingsRow | undefined;
  if (!row || typeof row.id !== 'number') {
    throw new HttpError(500, 'configs が取得できませんでした。');
  }

  return row;
};

const fetchTicketIssueControls = async (
  adminClient: SupabaseClient,
): Promise<TicketIssueModes> => {
  const { data, error } = await adminClient
    .from('ticket_issue_controls')
    .select(
      'class_invite_mode, rehearsal_invite_mode, gym_invite_mode, entry_only_mode, same_day_class_mode, same_day_gym_mode',
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as TicketIssueControlsRow | null;
  if (!row) {
    return DEFAULT_TICKET_ISSUE_MODES;
  }

  return {
    classInvite: row.class_invite_mode,
    rehearsalInvite: row.rehearsal_invite_mode,
    gymInvite: row.gym_invite_mode,
    entryOnly: row.entry_only_mode,
    sameDayClass: row.same_day_class_mode,
    sameDayGym: row.same_day_gym_mode,
  };
};

const isBcryptHash = (value: string) => /^\$2[aby]\$\d{2}\$.{53}$/.test(value);

const getRateLimitRow = async (
  adminClient: SupabaseClient,
  ipAddress: string,
): Promise<AdminRateLimitRow | null> => {
  const { data, error } = await adminClient
    .from('admin_auth_rate_limits')
    .select('ip_address, failed_attempts, locked_until')
    .eq('ip_address', ipAddress)
    .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0] as AdminRateLimitRow | undefined;
  return row ?? null;
};

const getRemainingLockSeconds = (lockedUntil: string): number => {
  const remainingMs = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(remainingMs / 1000));
};

const ensureIpIsNotLocked = (rateLimitRow: AdminRateLimitRow | null) => {
  if (!rateLimitRow?.locked_until) {
    return;
  }

  const lockExpiresAtMs = new Date(rateLimitRow.locked_until).getTime();
  if (Number.isNaN(lockExpiresAtMs) || lockExpiresAtMs <= Date.now()) {
    return;
  }

  const retryAfterSeconds = getRemainingLockSeconds(rateLimitRow.locked_until);
  throw new HttpError(
    429,
    `試行回数が上限に達しました。${retryAfterSeconds}秒後に再試行してください。`,
  );
};

const registerFailedAttempt = async (
  adminClient: SupabaseClient,
  ipAddress: string,
  rateLimitRow: AdminRateLimitRow | null,
) => {
  const now = new Date();
  const lockStillActive =
    typeof rateLimitRow?.locked_until === 'string' &&
    new Date(rateLimitRow.locked_until).getTime() > now.getTime();

  const baseFailedAttempts = lockStillActive
    ? 0
    : (rateLimitRow?.failed_attempts ?? 0);
  const nextFailedAttempts = baseFailedAttempts + 1;
  const shouldLock = nextFailedAttempts >= ADMIN_AUTH_MAX_FAILED_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + ADMIN_AUTH_LOCK_DURATION_MS).toISOString()
    : null;

  const { error } = await adminClient.from('admin_auth_rate_limits').upsert(
    {
      ip_address: ipAddress,
      failed_attempts: shouldLock ? 0 : nextFailedAttempts,
      last_failed_at: now.toISOString(),
      locked_until: lockedUntil,
    },
    { onConflict: 'ip_address' },
  );

  if (error) {
    throw error;
  }

  return {
    shouldLock,
    lockedUntil,
    remainingAttempts: shouldLock
      ? 0
      : ADMIN_AUTH_MAX_FAILED_ATTEMPTS - nextFailedAttempts,
  };
};

const clearFailedLoginAttempts = async (
  adminClient: SupabaseClient,
  ipAddress: string,
) => {
  const { error } = await adminClient
    .from('admin_auth_rate_limits')
    .delete()
    .eq('ip_address', ipAddress);

  if (error) {
    throw error;
  }
};

const createSession = async (adminClient: SupabaseClient) => {
  const token = createRawToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(
    Date.now() + ADMIN_CONTROL_PANEL_SESSION_DURATION_MS,
  ).toISOString();

  const { error } = await adminClient.from('admin_sessions').insert({
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw error;
  }

  return {
    token,
    expiresAt,
  };
};

const findActiveSession = async (
  adminClient: SupabaseClient,
  token: string,
): Promise<(AdminSessionRow & { tokenHash: string }) | null> => {
  const tokenHash = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await adminClient
    .from('admin_sessions')
    .select('id, expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .limit(1);

  if (error) {
    throw error;
  }

  const session = data?.[0] as AdminSessionRow | undefined;
  if (!session) {
    return null;
  }

  return { ...session, tokenHash };
};

const requireValidSession = async (
  adminClient: SupabaseClient,
  req: Request,
) => {
  const sessionToken = readSessionToken(req);
  if (!sessionToken) {
    throw new HttpError(401, 'セッションが無効です。再ログインしてください。');
  }

  const session = await findActiveSession(adminClient, sessionToken);
  if (!session) {
    throw new HttpError(401, 'セッションが無効です。再ログインしてください。');
  }

  return session;
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  try {
    const body = parseBody(await req.json());

    const supabaseUrl = getEnv('SUPABASE_URL');
    const secretKey = getEnv('FOR_ADMIN_SUPABASE_SECRET_KEY');

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (body.mode === 'verifySession') {
      const token = readSessionToken(req);
      if (!token) {
        return new Response(
          JSON.stringify({
            authenticated: false,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        );
      }

      const session = await findActiveSession(adminClient, token);
      if (!session) {
        return new Response(
          JSON.stringify({
            authenticated: false,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        );
      }

      await adminClient
        .from('admin_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({
          authenticated: true,
          expiresAt: session.expires_at,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (body.mode === 'logoutSession') {
      const token = readSessionToken(req);
      if (token) {
        const tokenHash = await hashToken(token);
        await adminClient
          .from('admin_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('token_hash', tokenHash);
      }

      return new Response(
        JSON.stringify({
          loggedOut: true,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (body.mode === 'getSettings') {
      const session = await requireValidSession(adminClient, req);
      const settings = await fetchAdminSettings(adminClient);
      const ticketIssueModes = await fetchTicketIssueControls(adminClient);

      const activeTicketTypeIds: number[] = [];
      if (ticketIssueModes.classInvite !== 'off') {
        activeTicketTypeIds.push(1);
      }
      if (ticketIssueModes.rehearsalInvite !== 'off') {
        activeTicketTypeIds.push(2);
      }
      if (ticketIssueModes.gymInvite !== 'off') {
        activeTicketTypeIds.push(3);
      }
      if (ticketIssueModes.entryOnly !== 'off') {
        activeTicketTypeIds.push(4);
      }
      if (ticketIssueModes.sameDayClass !== 'off') {
        activeTicketTypeIds.push(8);
      }
      if (ticketIssueModes.sameDayGym !== 'off') {
        activeTicketTypeIds.push(9);
      }

      await adminClient
        .from('admin_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({
          settings: {
            eventYear: settings.event_year,
            showLength: settings.show_length,
            maxTicketsPerUser: settings.max_tickets_per_user,
            juniorReleaseOpen: settings.junior_release_open,
            ticketIssuingEnabled: settings.is_active,
            activeTicketTypeIds,
            ticketIssueModes,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (body.mode === 'updateSettings') {
      const session = await requireValidSession(adminClient, req);
      const currentSettings = await fetchAdminSettings(adminClient);

      const { error: updateError } = await adminClient
        .from('configs')
        .update({
          event_year: body.eventYear,
          show_length: body.showLength,
          max_tickets_per_user: body.maxTicketsPerUser,
          junior_release_open: body.juniorReleaseOpen,
          is_active: body.ticketIssuingEnabled,
        })
        .eq('id', currentSettings.id);

      if (updateError) {
        throw updateError;
      }

      await adminClient
        .from('admin_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({
          updated: true,
          settings: {
            eventYear: body.eventYear,
            showLength: body.showLength,
            maxTicketsPerUser: body.maxTicketsPerUser,
            juniorReleaseOpen: body.juniorReleaseOpen,
            ticketIssuingEnabled: body.ticketIssuingEnabled,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (body.mode === 'updateTicketTypeSettings') {
      const session = await requireValidSession(adminClient, req);

      const { error: ticketIssueModeUpdateError } = await adminClient
        .from('ticket_issue_controls')
        .upsert(
          {
            id: 1,
            class_invite_mode: body.ticketIssueModes.classInvite,
            rehearsal_invite_mode: body.ticketIssueModes.rehearsalInvite,
            gym_invite_mode: body.ticketIssueModes.gymInvite,
            entry_only_mode: body.ticketIssueModes.entryOnly,
            same_day_class_mode: body.ticketIssueModes.sameDayClass,
            same_day_gym_mode: body.ticketIssueModes.sameDayGym,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (ticketIssueModeUpdateError) {
        throw ticketIssueModeUpdateError;
      }

      await adminClient
        .from('admin_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({
          updated: true,
          activeTicketTypeIds: body.activeTicketTypeIds,
          ticketIssueModes: body.ticketIssueModes,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const config = await fetchAdminConfig(adminClient);

    if (body.mode === 'changePassword') {
      const clientIp = getClientIp(req);
      const currentRateLimitRow = await getRateLimitRow(adminClient, clientIp);
      ensureIpIsNotLocked(currentRateLimitRow);

      const session = await requireValidSession(adminClient, req);

      const currentPasswordMatched = await compare(
        body.currentPassword,
        config.passwordHash,
      );
      if (!currentPasswordMatched) {
        const rateLimitResult = await registerFailedAttempt(
          adminClient,
          clientIp,
          currentRateLimitRow,
        );
        if (rateLimitResult.shouldLock && rateLimitResult.lockedUntil) {
          const retryAfterSeconds = getRemainingLockSeconds(
            rateLimitResult.lockedUntil,
          );
          throw new HttpError(
            429,
            `試行回数が上限に達しました。${retryAfterSeconds}秒後に再試行してください。`,
          );
        }

        throw new HttpError(401, '現在の管理者パスワードが正しくありません。');
      }

      await clearFailedLoginAttempts(adminClient, clientIp);

      const isSameAsCurrent = await compare(
        body.newPassword,
        config.passwordHash,
      );
      if (isSameAsCurrent) {
        throw new HttpError(
          400,
          '新しいパスワードは現在のパスワードと異なる値を指定してください。',
        );
      }

      const newPasswordHash = await hash(body.newPassword, 12);
      const { error: updateError } = await adminClient
        .from('configs')
        .update({ admin_password: newPasswordHash })
        .eq('id', config.id);

      if (updateError) {
        throw updateError;
      }

      await adminClient
        .from('admin_sessions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({
          changed: true,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const clientIp = getClientIp(req);
    const currentRateLimitRow = await getRateLimitRow(adminClient, clientIp);
    ensureIpIsNotLocked(currentRateLimitRow);

    const authenticated = await compare(body.password, config.passwordHash);
    if (!authenticated) {
      const rateLimitResult = await registerFailedAttempt(
        adminClient,
        clientIp,
        currentRateLimitRow,
      );
      if (rateLimitResult.shouldLock && rateLimitResult.lockedUntil) {
        const retryAfterSeconds = getRemainingLockSeconds(
          rateLimitResult.lockedUntil,
        );
        throw new HttpError(
          429,
          `試行回数が上限に達しました。${retryAfterSeconds}秒後に再試行してください。`,
        );
      }

      return new Response(
        JSON.stringify({
          authenticated: false,
          remainingAttempts: rateLimitResult.remainingAttempts,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    await clearFailedLoginAttempts(adminClient, clientIp);

    const session = await createSession(adminClient);

    return new Response(
      JSON.stringify({
        authenticated: true,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
        sessionDurationMs: ADMIN_CONTROL_PANEL_SESSION_DURATION_MS,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error(error);

    const isHttpError = error instanceof HttpError;
    return new Response(
      JSON.stringify({
        error: isHttpError
          ? error.message
          : '認証に失敗しました。通信状況と設定を確認してください。',
      }),
      {
        status: isHttpError ? error.status : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
