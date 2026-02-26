import { decodeBase64Url } from './base64Url.ts';
import { toArrayBuffer } from './arrayBuffer.ts';

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

const importEd25519PublicKey = async (
  spkiBase64: string,
): Promise<CryptoKey> => {
  const publicKeyBytes = decodeBase64(spkiBase64);

  return await crypto.subtle.importKey(
    'spki',
    toArrayBuffer(publicKeyBytes),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
};

export const verifyCodeSignature = async (
  code: string,
  signature: string,
  publicKeySpkiBase64: string,
): Promise<boolean> => {
  try {
    const key = await importEd25519PublicKey(publicKeySpkiBase64);
    const payload = new TextEncoder().encode(code);
    const signatureBytes = decodeBase64Url(signature);

    return await crypto.subtle.verify(
      'Ed25519',
      key,
      toArrayBuffer(signatureBytes),
      payload,
    );
  } catch {
    return false;
  }
};
