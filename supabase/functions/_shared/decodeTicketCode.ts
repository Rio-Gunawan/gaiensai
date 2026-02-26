import { decodeAffiliation } from "./convertAffiliation.ts";
import type { TicketData } from "./ticketDataType.ts";

// ---------------------------------------------------------
// チケットコードデコード関数
// ---------------------------------------------------------

function unpackData(packed: bigint): TicketData {
  return {
    serial: Number(packed & 0xfn),
    year: Number((packed >> 4n) & 0x7n),
    schedule: Number((packed >> 7n) & 0x3fn),
    performance: Number((packed >> 13n) & 0x1fn),
    type: Number((packed >> 18n) & 0xfn),
    relationship: Number((packed >> 22n) & 0x7n),
    affiliation: decodeAffiliation(Number((packed >> 25n) & 0x7ffn)),
  };
}

type DecodeOptions = {
  ticketSigningPrivateKeyMacBase64?: string;
  ticketSigningPrivateKeyCipherBase64?: string;
  base58Alphabet?: string;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function resolveKeys(options?: DecodeOptions) {
  const readRuntimeEnv = (key: string): string | undefined => {
    const deno = (globalThis as { Deno?: { env?: { get: (k: string) => string | undefined } } }).Deno;
    if (deno?.env) {
      return deno.env.get(key);
    }

    const meta = import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    };
    if (meta.env) {
      return meta.env[key];
    }

    return undefined;
  };

  const macBase64 =
    options?.ticketSigningPrivateKeyMacBase64 ??
    readRuntimeEnv('TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64') ??
    readRuntimeEnv('VITE_TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64');
  const cipherBase64 =
    options?.ticketSigningPrivateKeyCipherBase64 ??
    readRuntimeEnv('TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64') ??
    readRuntimeEnv('VITE_TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64');
  const alphabet =
    options?.base58Alphabet ??
    readRuntimeEnv('BASE58_ALPHABET') ??
    readRuntimeEnv('VITE_BASE58_ALPHABET');

  // If caller provided options (frontend), validate presence and give a helpful error
  if (!macBase64 || !cipherBase64 || !alphabet) {
    throw new Error(
      'Missing decode keys. Set TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64, TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64, BASE58_ALPHABET (or VITE_ prefixed variants on frontend).',
    );
  }

  const RAW_MAC_KEY = base64ToUint8Array(macBase64);
  const RAW_CIPHER_KEY = base64ToUint8Array(cipherBase64);

  return { RAW_MAC_KEY, RAW_CIPHER_KEY, alphabet } as const;
}

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

async function decryptFeistel46(
  cipher46: bigint,
  key: CryptoKey,
): Promise<bigint> {
  let L = cipher46 >> 23n;
  let R = cipher46 & 0x7fffffn;
  for (let i = ENCRYPTION_ROUNDS - 1; i >= 0; i--) {
    const prevR = L;
    const prevL = R ^ (await feistelFunction(L, i, key)); // await が必要
    L = prevL;
    R = prevR;
  }
  return (L << 23n) | R;
}

const BASE58_BASE = 58n;

function decodeBase58(str: string, alphabet: string): bigint | null {
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    const charIndex = alphabet.indexOf(str[i]);
    if (charIndex === -1) {
      return null;
    }
    num = num * BASE58_BASE + BigInt(charIndex);
  }
  return num;
}

export async function decodeTicketCode(
  code: string,
  options?: DecodeOptions,
): Promise<TicketData | null> {
  if (code.length < 1 || code.length > 8) {
    return null;
  }

  const {
    RAW_MAC_KEY: macKeyRaw,
    RAW_CIPHER_KEY: cipherKeyRaw,
    alphabet,
  } = await resolveKeys(options);

  const encrypted46 = decodeBase58(code, alphabet);
  if (encrypted46 === null) {
    return null;
  }

  const macKey = await importHmacKey(macKeyRaw);
  const cipherKey = await importHmacKey(cipherKeyRaw);

  const payload46 = await decryptFeistel46(encrypted46, cipherKey);
  const data36 = payload46 >> 10n;
  const mac10 = payload46 & 0x3ffn;

  const expectedMac10 = await generateMAC10(data36, macKey);
  if (mac10 !== expectedMac10) {
    return null;
  } // 署名エラー（偽造）

  return unpackData(data36);
}
