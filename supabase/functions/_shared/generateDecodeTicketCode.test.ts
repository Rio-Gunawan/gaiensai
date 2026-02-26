/* eslint-disable no-console */
import { YEAR_BITS } from './ticketDataType.ts';

type TicketData = {
  affiliation: number;
  relationship: number;
  type: number;
  performance: number;
  schedule: number;
  year: number;
  serial: number;
};

type QRPayload = {
  code: string;
  exp: number;
};

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
};

const assertTicketDataEqual = (
  actual: TicketData | null,
  expected: TicketData,
  message: string,
) => {
  if (!actual) {
    throw new Error(`${message}\nactual is null`);
  }
  if (
    actual.affiliation !== expected.affiliation ||
    actual.relationship !== expected.relationship ||
    actual.type !== expected.type ||
    actual.performance !== expected.performance ||
    actual.schedule !== expected.schedule ||
    actual.year % Number(YEAR_BITS) !== expected.year % Number(YEAR_BITS) ||
    actual.serial !== expected.serial
  ) {
    throw new Error(
      `${message}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`,
    );
  }
};

const createTestEnv = async () => {
  const macKey = crypto.getRandomValues(new Uint8Array(32));
  const cipherKey = crypto.getRandomValues(new Uint8Array(32));
  const edKeyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );

  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', edKeyPair.privateKey),
  );
  const spki = new Uint8Array(
    await crypto.subtle.exportKey('spki', edKeyPair.publicKey),
  );

  const publicKeySpkiBase64 = toBase64(spki);

  Deno.env.set('BASE58_ALPHABET', BASE58_ALPHABET);
  Deno.env.set('TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64', toBase64(macKey));
  Deno.env.set('TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64', toBase64(cipherKey));
  Deno.env.set('TICKET_SIGNING_PRIVATE_KEY_Ed25519_BASE64', toBase64(pkcs8));

  const { generateTicketCode, signCode } = await import('./generateTicketCode.ts');
  const { decodeTicketCode } = await import('./decodeTicketCode.ts');
  const { verifyCodeSignature } = await import('./verifyCodeSignature.ts');

  return {
    generateTicketCode,
    decodeTicketCode,
    signCode,
    verifyCodeSignature,
    publicKeySpkiBase64,
  };
};

let setupCache: Awaited<ReturnType<typeof createTestEnv>> | null = null;

const setupTestEnv = async () => {
  if (setupCache) {
    return setupCache;
  }

  setupCache = await createTestEnv();
  return setupCache;
};

const createQR = async (
  payload: QRPayload,
  signCode: (code: string) => Promise<string>,
): Promise<string> => {
  const payloadText = JSON.stringify(payload);
  const signature = await signCode(payloadText);

  return `${payloadText}.${signature}`;
};

const restoreQR = async (
  token: string,
  publicKeySpkiBase64: string,
  verifyCodeSignature: (
    code: string,
    signature: string,
    publicKeySpkiBase64: string,
  ) => Promise<boolean>,
  now = Date.now(),
): Promise<QRPayload> => {
  if (!token) {
    throw new Error('empty token');
  }

  const delimiter = token.lastIndexOf('.');
  if (delimiter <= 0 || delimiter === token.length - 1) {
    throw new Error('malformed token');
  }

  const payloadText = token.slice(0, delimiter);
  const signatureText = token.slice(delimiter + 1);

  let payload: QRPayload;
  try {
    payload = JSON.parse(payloadText) as QRPayload;
  } catch {
    throw new Error('invalid payload');
  }

  const ok = await verifyCodeSignature(
    payloadText,
    signatureText,
    publicKeySpkiBase64,
  );

  if (!ok) {
    throw new Error('invalid signature');
  }

  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('expired token');
  }

  return payload;
};

const isValidQR = async (
  token: string,
  publicKeySpkiBase64: string,
  verifyCodeSignature: (
    code: string,
    signature: string,
    publicKeySpkiBase64: string,
  ) => Promise<boolean>,
  now = Date.now(),
): Promise<boolean> => {
  try {
    await restoreQR(token, publicKeySpkiBase64, verifyCodeSignature, now);
    return true;
  } catch {
    return false;
  }
};

Deno.test({
  name: 'generateTicketCode -> decodeTicketCode round-trip keeps original data',
  permissions: { env: true },
  fn: async () => {
    const { generateTicketCode, decodeTicketCode } = await setupTestEnv();

    const cases: TicketData[] = [
      {
        affiliation: 1101,
        relationship: 1,
        type: 1,
        performance: 1,
        schedule: 1,
        year: 2025,
        serial: 1,
      },
      {
        affiliation: 2411,
        relationship: 2,
        type: 9,
        performance: 11,
        schedule: 54,
        year: 2020,
        serial: 15,
      },
      {
        affiliation: 4864,
        relationship: 7,
        type: 15,
        performance: 31,
        schedule: 63,
        year: 2080,
        serial: 15,
      },
    ];

    for (const source of cases) {
      const code = await generateTicketCode(source);
      const decoded = await decodeTicketCode(code);
      console.debug(`Source data: ${JSON.stringify(source)}`);
      console.debug(`Decoded data: ${JSON.stringify(decoded)}`);
      assertTicketDataEqual(
        decoded,
        source,
        `round-trip mismatch for code=${code}`,
      );
    }
  },
});

Deno.test({
  name: 'generateTicketCode throws error for out-of-range values',
  permissions: { env: true },
  fn: async () => {
    const { generateTicketCode } = await setupTestEnv();

    const outOfRangeCases: TicketData[] = [
      {
        affiliation: 1901,
        relationship: 1,
        type: 1,
        performance: 1,
        schedule: 1,
        year: 2026,
        serial: 1,
      },
      {
        affiliation: 1101,
        relationship: 8,
        type: 1,
        performance: 1,
        schedule: 1,
        year: 2026,
        serial: 1,
      },
      {
        affiliation: 1101,
        relationship: 1,
        type: 16,
        performance: 1,
        schedule: 1,
        year: 2026,
        serial: 1,
      },
      {
        affiliation: 1101,
        relationship: 1,
        type: 1,
        performance: 32,
        schedule: 1,
        year: 2026,
        serial: 1,
      },
      {
        affiliation: 1101,
        relationship: 1,
        type: 1,
        performance: 1,
        schedule: 64,
        year: 2026,
        serial: 1,
      },
      {
        affiliation: 1101,
        relationship: 1,
        type: 1,
        performance: 1,
        schedule: 1,
        year: 2026,
        serial: 16,
      },
    ];

    for (const source of outOfRangeCases) {
      let thrown: unknown;
      try {
        await generateTicketCode(source);
      } catch (error) {
        thrown = error;
        console.error(`Expected error for input: ${JSON.stringify(source)}`);
        console.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!(thrown instanceof Error)) {
        throw new Error(
          `Expected generateTicketCode to throw for input=${JSON.stringify(source)}`,
        );
      }
    }
  },
});

Deno.test({
  name: 'QR signature check: tampered payload fails restore',
  permissions: { env: true },
  fn: async () => {
    const { signCode, verifyCodeSignature, publicKeySpkiBase64 } =
      await setupTestEnv();

    const validPayload = JSON.stringify({ code: 'ABC123', exp: Date.now() + 60_000 });
    const validSignature = await signCode(validPayload);
    const tampered = `${validPayload.slice(0, -1)}X.${validSignature}`;

    let thrown: unknown;
    try {
      await restoreQR(tampered, publicKeySpkiBase64, verifyCodeSignature);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Error)) {
      throw new Error('Expected tampered QR to throw');
    }
  },
});

Deno.test({
  name: 'QR signature check: empty token throws',
  permissions: { env: true },
  fn: async () => {
    const { verifyCodeSignature, publicKeySpkiBase64 } = await setupTestEnv();

    let thrown: unknown;
    try {
      await restoreQR('', publicKeySpkiBase64, verifyCodeSignature);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Error) || thrown.message !== 'empty token') {
      throw new Error(`Expected empty token error, got: ${String(thrown)}`);
    }
  },
});

Deno.test({
  name: 'QR signature check: valid signature passes and tampered fails',
  permissions: { env: true },
  fn: async () => {
    const { signCode, verifyCodeSignature, publicKeySpkiBase64 } =
      await setupTestEnv();

    const validPayload = JSON.stringify({ code: 'ABC123', exp: Date.now() + 60_000 });
    const validSignature = await signCode(validPayload);

    const valid = await verifyCodeSignature(
      validPayload,
      validSignature,
      publicKeySpkiBase64,
    );
    if (!valid) {
      throw new Error('Expected valid signature to pass');
    }

    const tamperedPayload = `${validPayload}x`;
    const tampered = await verifyCodeSignature(
      tamperedPayload,
      validSignature,
      publicKeySpkiBase64,
    );
    if (tampered) {
      throw new Error('Expected tampered payload to fail signature check');
    }
  },
});

Deno.test({
  name: 'QR signature check: expired QR is invalid',
  permissions: { env: true },
  fn: async () => {
    const { signCode, verifyCodeSignature, publicKeySpkiBase64 } =
      await setupTestEnv();

    const expired = await createQR(
      { code: 'ABC123', exp: Date.now() - 1 },
      signCode,
    );

    const isValid = await isValidQR(
      expired,
      publicKeySpkiBase64,
      verifyCodeSignature,
    );

    if (isValid) {
      throw new Error('Expected expired QR to be invalid');
    }
  },
});
