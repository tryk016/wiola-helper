export type InvoiceStatus =
  | 'waiting'
  | 'parsing'
  | 'processing'
  | 'done'
  | 'failed'
  | 'ambiguous'
  | 'unknown_sku'
  | 'delay'
  | 'missing_transport';

export interface ParsedLine {
  ewi_sku: string;
  qty: number;
  unit_pln: number;
  total_pln: number;
  amount_gbp?: number;
  rate_gbp?: number;
  raw_desc?: string;
  is_pallet?: boolean;
  is_sample?: boolean;
  is_pigment?: boolean;
}

export interface Invoice {
  id: string;
  file: string;
  fileName?: string;
  kreisel_ref?: string;
  status: InvoiceStatus;
  progress?: number;
  amount_pln?: number;
  amount_gbp?: number;
  invoice_no?: string;
  lines?: number;
  parsed_lines?: ParsedLine[];
  hmrc_month?: string;
  hmrc_rate?: number;
  hmrc_month_options?: string[];
  days_waiting?: number;
  completed_at?: number;
  container?: string;
  error?: string;
  delay_until?: number;  // unix ms — when the anti-automation delay ends
  pending_message?: string;
}

export interface Health {
  magemar: { ok: boolean; age_hours: number; path: string };
  qbo: { pro: string; store: string; env: string };
}
