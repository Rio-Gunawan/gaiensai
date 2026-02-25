import { decodeTicketCode } from '@ticket-codec';

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
