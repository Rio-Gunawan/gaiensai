import { decodeTicketCode } from '@ticket-codec';
import { verifyCodeSignature } from '../../../supabase/functions/_shared/verifyCodeSignature.ts';
import { YEAR_BITS } from '../../../supabase/functions/_shared/ticketDataType.ts';

export type TicketDecodedSeed = {
  relationshipId: number;
  ticketTypeId: number;
  performanceId: number;
  scheduleId: number;
  serial: number;
};

export type TicketDecodedDisplaySeed = TicketDecodedSeed & {
  affiliation: string;
  year: string;
};

const getDecodeOptions = () => ({
  ticketSigningPrivateKeyMacBase64: import.meta.env
    .VITE_TICKET_SIGNING_PRIVATE_KEY_MAC_BASE64,
  ticketSigningPrivateKeyCipherBase64: import.meta.env
    .VITE_TICKET_SIGNING_PRIVATE_KEY_CIPHER_BASE64,
  base58Alphabet: import.meta.env.VITE_BASE58_ALPHABET,
});

type DecodedTicketRaw = Awaited<ReturnType<typeof decodeTicketCode>>;

export const decodeTicketCodeWithEnv = async (
  code: string,
): Promise<DecodedTicketRaw> => decodeTicketCode(code, getDecodeOptions());

export const toTicketDecodedSeed = (
  decoded: DecodedTicketRaw,
): TicketDecodedSeed | null => {
  if (!decoded) {
    return null;
  }

  return {
    relationshipId: decoded.relationship,
    ticketTypeId: decoded.type,
    performanceId: decoded.performance,
    scheduleId: decoded.schedule,
    serial: decoded.serial,
  };
};

export const toTicketDecodedDisplaySeed = (
  decoded: DecodedTicketRaw,
): TicketDecodedDisplaySeed | null => {
  if (!decoded) {
    return null;
  }

  const seed = toTicketDecodedSeed(decoded);

  if (!seed) {
    return null;
  }

  return {
    ...seed,
    affiliation: String(decoded.affiliation).padStart(4, '0'),
    year: String(decoded.year).padStart(2, '0'),
  };
};

export const verifyTicketSignature = async (
  code: string,
  signature: string,
): Promise<boolean> =>
  verifyCodeSignature(
    code,
    signature,
    import.meta.env.VITE_TICKET_SIGNING_PUBLIC_KEY_ED25519_BASE64,
  );

export const decodeAndVerifyTicket = async (
  code: string,
  signature: string,
) => {
  const [decodedRaw, signatureIsValid] = await Promise.all([
    decodeTicketCodeWithEnv(code),
    verifyTicketSignature(code, signature),
  ]);
  const isTicketThisYear =
    decodedRaw?.year === new Date().getFullYear() % 2 ** Number(YEAR_BITS);
  const decoded = toTicketDecodedDisplaySeed(decodedRaw);
  return { decodedRaw, signatureIsValid, decoded, isTicketThisYear };
};
