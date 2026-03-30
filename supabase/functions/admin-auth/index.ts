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
};

type AdminAuthBody =
  | { mode: 'login'; password: string }
  | { mode: 'verifySession' }
  | { mode: 'logoutSession' }
  | { mode: 'changePassword'; currentPassword: string; newPassword: string };

type AdminConfigRow = {
  id: number;
  admin_password: string;
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

const ADMIN_SESSION_TOKEN_HEADER = 'x-admin-session-token';
const MAX_SESSION_TOKEN_LENGTH = 512;
const MAX_IP_ADDRESS_LENGTH = 128;

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

const parseBody = (
  body: unknown,
): AdminAuthBody => {
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
      throw new HttpError(
        400,
        'newPassword は8文字以上で設定してください。',
      );
    }

    return {
      mode: 'changePassword',
      currentPassword: normalizedCurrentPassword,
      newPassword: normalizedNewPassword,
    };
  }

  if (action === 'login' || typeof action === 'undefined') {
    const isLegacyChangePasswordRequest =
      typeof currentPassword !== 'undefined' || typeof newPassword !== 'undefined';
    if (isLegacyChangePasswordRequest) {
      const normalizedCurrentPassword = normalizePassword(
        currentPassword,
        'currentPassword',
      );
      const normalizedNewPassword = normalizePassword(newPassword, 'newPassword');

      if (normalizedNewPassword.length < 8) {
        throw new HttpError(
          400,
          'newPassword は8文字以上で設定してください。',
        );
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

  const baseFailedAttempts = lockStillActive ? 0 : rateLimitRow?.failed_attempts ?? 0;
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

    const config = await fetchAdminConfig(adminClient);

    if (body.mode === 'changePassword') {
      const clientIp = getClientIp(req);
      const currentRateLimitRow = await getRateLimitRow(adminClient, clientIp);
      ensureIpIsNotLocked(currentRateLimitRow);

      const sessionToken = readSessionToken(req);
      if (!sessionToken) {
        throw new HttpError(401, 'セッションが無効です。再ログインしてください。');
      }

      const session = await findActiveSession(adminClient, sessionToken);
      if (!session) {
        throw new HttpError(401, 'セッションが無効です。再ログインしてください。');
      }

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

        throw new HttpError(
          401,
          '現在の管理者パスワードが正しくありません。',
        );
      }

      await clearFailedLoginAttempts(adminClient, clientIp);

      const isSameAsCurrent = await compare(body.newPassword, config.passwordHash);
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
