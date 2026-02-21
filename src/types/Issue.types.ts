import type { AvailableSeatSelection } from './types';

export type Step = 1 | 2 | 3;

export type RelationshipRow = {
  id: number;
  name: string | null;
};

export type TicketTypeOption = {
  id: number;
  label: string;
  disabled: boolean;
};

export type SelectedPerformance = AvailableSeatSelection | null;
