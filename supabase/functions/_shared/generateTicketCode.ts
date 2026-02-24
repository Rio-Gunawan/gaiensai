import { encodeAffiliation } from './convertAffiliation.ts';
import { getBase58Alphabet, getEnv } from './getEnv.ts';

// ---------------------------------------------------------
// チケットコード生成関数
// ---------------------------------------------------------

// ---------------------------------------------------------
// 1. 定数・型定義
// ---------------------------------------------------------

export type TicketData = {
  affiliation: number; // 11 bit
  relationship: number; // 3 bit
  type: number; // 4 bit
  performance: number; // 5 bit
  schedule: number; // 6 bit
  year: number; // 3 bit
  serial: number; // 4 bit
};

// ---------------------------------------------------------
// 2. ビットパッキング (同期処理・変更なし)
// ---------------------------------------------------------
function packData(data: TicketData): bigint {
  const convertedAffiliation = encodeAffiliation(data.affiliation); // 11 bit
  let packed = 0n;
  // オーバーフローを防ぐためにマスク処理を行う。
  packed = (packed << 11n) | BigInt(convertedAffiliation & 0x7ff);
  packed = (packed << 3n) | BigInt(data.relationship & 0x7);
  packed = (packed << 4n) | BigInt(data.type & 0xf);
  packed = (packed << 5n) | BigInt(data.performance & 0x1f);
  packed = (packed << 6n) | BigInt(data.schedule & 0x3f);
  packed = (packed << 3n) | BigInt(data.year & 0x7);
  packed = (packed << 4n) | BigInt(data.serial & 0xf);
  return packed;
}

// ---------------------------------------------------------
// 3. Web Crypto API の準備 (非同期)
// ---------------------------------------------------------
const decodeBase64 = (base64: string): Uint8Array => {
  const normalized = base64.trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const RAW_MAC_KEY = decodeBase64(getEnv('TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64'));
const RAW_CIPHER_KEY = decodeBase64(
  getEnv('TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64'),
);

// HMAC用の CryptoKey オブジェクトを生成する関数
async function importHmacKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer, // .buffer を明示し、型を固定する
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// ---------------------------------------------------------
// 4. 暗号化・MAC生成ロジック (DataView を使用)
// ---------------------------------------------------------

async function generateMAC10(data36: bigint, key: CryptoKey): Promise<bigint> {
  // 8バイト(64bit)の箱を用意
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  // Node の writeBigUInt64BE と同じ (false = Big-Endian)
  view.setBigUint64(0, data36, false);

  // HMAC生成 (Web Crypto API)
  const signature = await crypto.subtle.sign('HMAC', key, buffer);
  const hashView = new DataView(signature);

  // Node の readUInt16BE(0) と同じ
  return BigInt((hashView.getUint16(0, false) >> 6) & 0x3ff); // 先頭10bit
}

async function feistelFunction(
  rightHalf: bigint,
  round: number,
  key: CryptoKey,
): Promise<bigint> {
  // ラウンド数(1byte) + rightHalf(4byte) = 5バイトの箱を用意
  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);

  view.setUint8(0, round);
  view.setUint32(1, Number(rightHalf), false); // Big-Endian

  const signature = await crypto.subtle.sign('HMAC', key, buffer);
  const hashView = new DataView(signature);

  // Node の readUInt32BE(0) と同じ
  return BigInt((hashView.getUint32(0, false) >>> 9) & 0x7fffff); // 先頭23bit
}

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

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

// Base64URLエンコード関数
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
