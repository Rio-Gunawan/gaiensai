/* eslint-disable no-console */
// https://zenn.dev/kota113/articles/79a75dac7236c0 を参照してください。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// JWTペイロードをデコードするヘルパー
function decodeJwtPayload(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT');
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(payload);
  return JSON.parse(decoded);
}

/**
 *  envファイルから情報を取得
 * @param key envファイルのkey
 * @returns envファイルから取得し結果
 */
const getFromEnv = (key: string): string => {
  const value: string | undefined = Deno.env.get(key);
  if (value === undefined) {
    throw new Error(key + 'がenvファイルに設定されていません。');
  }
  return value;
};

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }
  try {
    const { code } = await req.json();
    // 1. 認証コードをアクセストークンと交換
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code', code);
    tokenParams.append('redirect_uri', getFromEnv('LINE_REDIRECT_URI'));
    tokenParams.append('client_id', getFromEnv('LINE_CHANNEL_ID'));
    tokenParams.append('client_secret', getFromEnv('LINE_CHANNEL_SECRET'));
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams,
    });
    const lineTokens = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(lineTokens.error_description);
    }

    // 2. IDトークンからユーザー情報を取得
    const { email: lineEmail, sub: lineUserId } = decodeJwtPayload(
      lineTokens.id_token,
    );
    let email = lineEmail;
    if (!lineEmail) {
      email = lineUserId + '@gaiensai.aoko.ed.jp';
    }

    email = email.toLowerCase();

    // 3. Supabase Adminクライアントでユーザーを検索または作成
    const supabaseAdmin = createClient(
      getFromEnv('SUPABASE_URL'),
      getFromEnv('FOR_LINE_SUPABASE_SECRET_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    // 事前準備で作成したRPC関数を呼び出してユーザーIDを検索
    const { data: userId, error: rpcError } = await supabaseAdmin.rpc(
      'get_user_by_email',
      {
        user_email: email,
      },
    );
    if (rpcError) {
      throw rpcError;
    }
    if (!userId) {
      // ユーザーが存在しない場合、新規作成
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        email_confirm: true,
        app_metadata: {
          provider: 'line',
          line_id: lineUserId,
        },
      });
      if (createError) {
        throw createError;
      }
    } else {
      const { error: updateUserError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          app_metadata: {
            provider: 'line',
            line_id: lineUserId,
          },
        });
      if (updateUserError) {
        throw updateUserError;
      }
    }

    // 4. 該当ユーザーのmagic linkを発行
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        email: email,
        type: 'magiclink',
      });
    if (linkError) {
      return new Response(`Error generating magic link: ${linkError.message}`, {
        status: 500,
      });
    }
    const { hashed_token } = linkData.properties;
    if (!hashed_token) {
      return new Response('Failed to retrieve token from magic link', {
        status: 500,
      });
    }
    // 5. magic linkを使ってサインイン
    const { data: verifyData, error: verifyError } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: hashed_token,
        type: 'email',
      });
    if (verifyError || !verifyData.session) {
      return new Response(
        `Error verifying OTP: ${verifyError?.message || 'No session created'}`,
        {
          status: 500,
        },
      );
    }
    const session = verifyData.session;
    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (e) {
    console.log(e);
    return new Response(
      JSON.stringify({
        error: e,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
