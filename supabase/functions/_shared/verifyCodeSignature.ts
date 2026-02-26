import { decodeBase64, decodeBase64Url, toArrayBuffer } from './cryptoUtils.ts';

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
