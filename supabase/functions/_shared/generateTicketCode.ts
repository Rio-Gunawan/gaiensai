import { encodeAffiliation } from './convertAffiliation.ts';
import { getBase58Alphabet, getEnv } from './getEnv.ts';
import {
  decodeBase64,
  encodeBase64Url,
  feistelFunction,
  generateMAC10,
  importHmacKey,
  toArrayBuffer,
} from './cryptoUtils.ts';
import {
  AFFILIATION_BITS,
  PERFORMANCE_BITS,
  RELATIONSHIP_BITS,
  SCHEDULE_BITS,
  SERIAL_BITS,
  TYPE_BITS,
  YEAR_BITS,
  type TicketData,
} from './ticketDataType.ts';

// ---------------------------------------------------------
// チケットコード生成関数
// ---------------------------------------------------------

// ---------------------------------------------------------
// 2. ビットパッキング (同期処理・変更なし)
// ---------------------------------------------------------
function assertBitRange(name: string, value: number, bits: bigint): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }

  const max = (1n << bits) - 1n;
  const valueAsBigInt = BigInt(value);

  if (valueAsBigInt < 0n || valueAsBigInt > max) {
    throw new Error(`${name} out of range (0..${max.toString()})`);
  }
}

function packData(data: TicketData): bigint {
  const convertedAffiliation = encodeAffiliation(data.affiliation); // 11 bit
  assertBitRange('convertedAffiliation', convertedAffiliation, AFFILIATION_BITS);
  assertBitRange('relationship', data.relationship, RELATIONSHIP_BITS);
  assertBitRange('type', data.type, TYPE_BITS);
  assertBitRange('performance', data.performance, PERFORMANCE_BITS);
  assertBitRange('schedule', data.schedule, SCHEDULE_BITS);
  assertBitRange('year', data.year, YEAR_BITS);
  assertBitRange('serial', data.serial, SERIAL_BITS);

  let packed = 0n;
  packed = (packed << AFFILIATION_BITS) | BigInt(convertedAffiliation);
  packed = (packed << RELATIONSHIP_BITS) | BigInt(data.relationship);
  packed = (packed << TYPE_BITS) | BigInt(data.type);
  packed = (packed << PERFORMANCE_BITS) | BigInt(data.performance);
  packed = (packed << SCHEDULE_BITS) | BigInt(data.schedule);
  packed = (packed << YEAR_BITS) | BigInt(data.year);
  packed = (packed << SERIAL_BITS) | BigInt(data.serial);
  return packed;
}

// ---------------------------------------------------------
// 3. Web Crypto API の準備 (非同期)
// ---------------------------------------------------------
const RAW_MAC_KEY = decodeBase64(
  getEnv('TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64'),
);
const RAW_CIPHER_KEY = decodeBase64(
  getEnv('TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64'),
);

const ENCRYPTION_ROUNDS = 8;

async function encryptFeistel46(
  data46: bigint,
  key: CryptoKey,
): Promise<bigint> {
  let L = data46 >> 23n;
  let R = data46 & 0x7fffffn;
  for (let i = 0; i < ENCRYPTION_ROUNDS; i++) {
    const nextL = R;
    const nextR = L ^ (await feistelFunction(R, i, key)); // await が必要
    L = nextL;
    R = nextR;
  }
  return (L << 23n) | R;
}

// ---------------------------------------------------------
// 5. Base58 エンコード
// ---------------------------------------------------------
/**
 * Base58エンコード関数
 * @param num - エンコードする数値 (bigint)
 * @returns Base58エンコードされた文字列
 */

const BASE58_ALPHABET = getBase58Alphabet();
const BASE58_BASE = 58n;

export function encodeBase58(num: bigint): string {
  if (num < 0n) {
    throw new Error('負の数はBase58に変換できません。');
  }
  if (num === 0n) {
    return BASE58_ALPHABET[0];
  }

  let encoded = '';
  let temp = num;
  while (temp > 0n) {
    encoded = BASE58_ALPHABET[Number(temp % BASE58_BASE)] + encoded;
    temp /= BASE58_BASE;
  }
  return encoded;
}

// ---------------------------------------------------------
// 6. メインAPI (非同期化)
// ---------------------------------------------------------

/**
 * チケットコードを生成するメイン関数
 * @param data - チケットコードに含めるデータ
 * @returns 生成されたチケットコード (Base58エンコードされた文字列)
 */
export async function generateTicketCode(data: TicketData): Promise<string> {
  const macKey = await importHmacKey(RAW_MAC_KEY);
  const cipherKey = await importHmacKey(RAW_CIPHER_KEY);

  data.year = data.year % Number(YEAR_BITS); // 年は下3bitのみ使用

  const data36 = packData(data);
  const mac10 = await generateMAC10(data36, macKey);
  const payload46 = (data36 << 10n) | mac10;

  const encrypted46 = await encryptFeistel46(payload46, cipherKey);
  return encodeBase58(encrypted46);
}

// ---------------------------------------------------------
// 7. Ed25519署名関数 (非同期化)
// ---------------------------------------------------------

// Ed25519署名用秘密鍵をデコードする関数
const decodePrivateKeyBase64 = (encoded: string): Uint8Array => {
  const normalized = encoded.trim();
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

// Ed25519署名用の CryptoKey を生成する関数
const signingKeyPromise = (() => {
  const privateKeyBase64 = getEnv('TICKET_SIGNING_PRIVATE_KEY_Ed25519_BASE64');
  const privateKeyBytes = decodePrivateKeyBase64(privateKeyBase64);

  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(privateKeyBytes),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
})();

/**
 * チケットコードに対してEd25519署名を生成する関数
 * @param code 署名前のチケットコード
 * @returns チケットコードの署名
 */
export const signCode = async (code: string): Promise<string> => {
  const key = await signingKeyPromise;
  const payload = new TextEncoder().encode(code);
  const signature = await crypto.subtle.sign('Ed25519', key, payload);

  return encodeBase64Url(new Uint8Array(signature));
};
