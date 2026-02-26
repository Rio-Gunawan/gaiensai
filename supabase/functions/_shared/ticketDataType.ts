export interface TicketData {
  affiliation: number; // 11 bit
  relationship: number; // 3 bit
  type: number; // 4 bit
  performance: number; // 5 bit
  schedule: number; // 6 bit
  year: number; // 3 bit
  serial: number; // 4 bit
}

// チケットデータのビット割り当て（合計36ビット）
export const AFFILIATION_BITS = 11n;
export const RELATIONSHIP_BITS = 3n;
export const TYPE_BITS = 4n;
export const PERFORMANCE_BITS = 5n;
export const SCHEDULE_BITS = 6n;
export const YEAR_BITS = 3n;
export const SERIAL_BITS = 4n;

// 合計の確認
export const TOTAL_DATA_BITS = 36n;
