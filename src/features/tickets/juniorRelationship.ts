const JUNIOR_TICKET_TYPE_IDS = new Set([5, 6, 7]);

const JUNIOR_RELATIONSHIP_NAME_MAP: Record<number, string> = {
  0: '中学生',
  1: '保護者',
  2: '中学生と保護者',
};

export const isJuniorTicketTypeId = (ticketTypeId: number): boolean =>
  JUNIOR_TICKET_TYPE_IDS.has(ticketTypeId);

export const resolveJuniorRelationshipName = (
  ticketTypeId: number,
  relationshipId: number,
): string | null => {
  if (!isJuniorTicketTypeId(ticketTypeId)) {
    return null;
  }

  return JUNIOR_RELATIONSHIP_NAME_MAP[relationshipId] ?? null;
};
