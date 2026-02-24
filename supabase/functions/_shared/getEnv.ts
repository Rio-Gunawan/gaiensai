import HttpError from './HttpError.ts';

/**
 *  envファイルから情報を取得
 * @param key envファイルのkey
 * @returns envファイルから取得し結果
 * @throws {HttpError} 環境変数が設定されていない場合にスローされるエラー
 */
export const getEnv = (key: string): string => {
  const value = Deno.env.get(key);

  if (!value) {
    throw new HttpError(
      500,
      `${key} が設定されていません。外苑祭総務にお問い合わせください。総務の方は、環境変数 ${key} をsupabase上で適切に設定してください。`,
    );
  }

  return value;
};

export const getBase58Alphabet = (): string => {
  const alphabet = Deno.env.get('BASE58_ALPHABET');

  if (!alphabet) {
    throw new HttpError(
      500,
      'BASE58_ALPHABET が設定されていません。外苑祭総務にお問い合わせください。総務の方は、環境変数 BASE58_ALPHABET をsupabase上で適切に設定してください。',
    );
  }

  if (alphabet.length !== 58) {
    throw new HttpError(
      500,
      'BASE58_ALPHABET は58文字でなければなりません。外苑祭総務にお問い合わせください。総務の方は、環境変数 BASE58_ALPHABET をsupabase上で適切に設定してください。',
    );
  }

  return alphabet;
};
