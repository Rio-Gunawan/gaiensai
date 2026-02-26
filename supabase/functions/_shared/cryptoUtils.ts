export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

export const encodeBase64Url = (input: Uint8Array): string => {
  let binary = '';
  for (const value of input) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

export const decodeBase64Url = (input: string): Uint8Array => {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

export const decodeBase64 = (base64: string): Uint8Array => {
  const normalized = base64.trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

export const importHmacKey = async (rawKey: Uint8Array): Promise<CryptoKey> =>
  await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

export const generateMAC10 = async (
  data36: bigint,
  key: CryptoKey,
): Promise<bigint> => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, data36, false);

  const signature = await crypto.subtle.sign('HMAC', key, buffer);
  const hashView = new DataView(signature);

  return BigInt((hashView.getUint16(0, false) >> 6) & 0x3ff);
};

export const feistelFunction = async (
  rightHalf: bigint,
  round: number,
  key: CryptoKey,
): Promise<bigint> => {
  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);

  view.setUint8(0, round);
  view.setUint32(1, Number(rightHalf), false);

  const signature = await crypto.subtle.sign('HMAC', key, buffer);
  const hashView = new DataView(signature);

  return BigInt((hashView.getUint32(0, false) >>> 9) & 0x7fffff);
};
