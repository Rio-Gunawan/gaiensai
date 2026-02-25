import { issueWithRollback } from './issueWithRollback.ts';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

Deno.test('issue fails then counter rollback RPC is called', async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const adminClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });

      if (fn === 'issue_class_tickets_with_codes') {
        return {
          data: null,
          error: { message: 'forced issue failure' },
        };
      }

      if (fn === 'rollback_ticket_code_counter') {
        return {
          data: true,
          error: null,
        };
      }

      throw new Error(`unexpected rpc: ${fn}`);
    },
  };

  let thrown: unknown;

  try {
    await issueWithRollback({
      adminClient,
      userId: '00000000-0000-0000-0000-000000000001',
      issueCount: 2,
      ticketTypeId: 1,
      relationshipId: 1,
      performanceId: 1,
      scheduleId: 1,
      affiliation: 1234,
      issuedYear: 26,
      basePrefix: 'prefix123',
      endSerial: 8,
      generateCode: async (ticketData) => `CODE-${ticketData.serial}`,
      signTicketCode: async (code) => `SIG-${code}`,
    });
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, 'Expected error to be thrown');
  assert(
    (thrown as Error).message === 'forced issue failure',
    'Expected issue error message to be propagated',
  );

  const rollbackCall = rpcCalls.find(
    (call) => call.fn === 'rollback_ticket_code_counter',
  );
  assert(rollbackCall, 'Expected rollback RPC to be called');
  if (!rollbackCall) {
    return;
  }
  assert(
    rollbackCall.args.p_prefix === 'prefix123',
    'Expected rollback prefix to match',
  );
  assert(
    rollbackCall.args.p_decrement === 2,
    'Expected rollback decrement to match issueCount',
  );
  assert(
    rollbackCall.args.p_expected_last_value === 8,
    'Expected rollback expected_last_value to match endSerial',
  );
});
