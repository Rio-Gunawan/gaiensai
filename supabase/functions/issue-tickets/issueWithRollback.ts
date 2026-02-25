/* eslint-disable no-console */
import type { TicketData } from '../_shared/generateTicketCode.ts';
import HttpError from '../_shared/HttpError.ts';

type RpcError = { message: string } | null;
type RpcResult = { data: unknown; error: RpcError };

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type IssueWithRollbackInput = {
  adminClient: RpcClient;
  userId: string;
  issueCount: number;
  ticketTypeId: number;
  relationshipId: number;
  performanceId: number;
  scheduleId: number;
  affiliation: number;
  issuedYear: number;
  basePrefix: string;
  endSerial: number;
  generateCode: (ticketData: TicketData) => Promise<string>;
  signTicketCode: (code: string) => Promise<string>;
};

export const issueWithRollback = async ({
  adminClient,
  userId,
  issueCount,
  ticketTypeId,
  relationshipId,
  performanceId,
  scheduleId,
  affiliation,
  issuedYear,
  basePrefix,
  endSerial,
  generateCode,
  signTicketCode,
}: IssueWithRollbackInput): Promise<Array<{ code: string; signature: string }>> => {
  const startSerial = endSerial - issueCount + 1;
  let shouldRollbackCounter = true;

  try {
    const codes = await Promise.all(
      Array.from({ length: issueCount }, (_, i) => {
        const serial = startSerial + i;
        const ticketData: TicketData = {
          affiliation,
          relationship: relationshipId,
          type: ticketTypeId,
          performance: performanceId,
          schedule: scheduleId,
          year: issuedYear,
          serial,
        };
        return generateCode(ticketData);
      }),
    );

    const signatures = await Promise.all(codes.map((code) => signTicketCode(code)));

    const { data: issuedTickets, error: issueError } = await adminClient.rpc(
      'issue_class_tickets_with_codes',
      {
        p_user_id: userId,
        p_ticket_type_id: ticketTypeId,
        p_relationship_id: relationshipId,
        p_performance_id: performanceId,
        p_schedule_id: scheduleId,
        p_issue_count: issueCount,
        p_codes: codes,
        p_signatures: signatures,
      },
    );

    if (issueError) {
      throw new HttpError(409, issueError.message);
    }

    shouldRollbackCounter = false;
    return (issuedTickets as Array<{ code: string; signature: string }>) ?? [];
  } finally {
    if (shouldRollbackCounter) {
      const { data: rollbackApplied, error: rollbackError } =
        await adminClient.rpc('rollback_ticket_code_counter', {
          p_prefix: basePrefix,
          p_decrement: issueCount,
          p_expected_last_value: endSerial,
        });

      if (rollbackError) {
        console.error('Failed to rollback ticket code counter', {
          userId,
          prefix: basePrefix,
          issueCount,
          endSerial,
          rollbackError,
        });
      } else if (rollbackApplied !== true) {
        console.error('Counter rollback was skipped because state changed', {
          userId,
          prefix: basePrefix,
          issueCount,
          endSerial,
        });
      }
    }
  }
};
