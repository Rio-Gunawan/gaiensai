export const ISSUE_RESULT_STORAGE_KEY = 'students_issue_result';

export type IssuedTicketResult = {
  code: string;
  signature: string;
};

export type IssueResultPayload = {
  performanceName: string;
  performanceTitle: string;
  scheduleName: string;
  ticketTypeLabel: string;
  relationshipName: string;
  issuedTickets: IssuedTicketResult[];
};
