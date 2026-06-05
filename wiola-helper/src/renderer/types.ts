export type InvoiceStatus =
  | 'waiting'
  | 'parsing'
  | 'processing'
  | 'done'
  | 'failed'
  | 'ambiguous'
  | 'unknown_sku'
  | 'delay'
  | 'missing_transport'
  | 'awaiting_transport_confirm';

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
  issue_date?: string;
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
  suggested_transport?: {
    found: boolean;
    pod_id?: number;
    branch_id?: number;
    truck_reg_number?: string | null;
    is_placeholder?: boolean;
    is_container?: boolean;
    delivered?: boolean;
    delivery_date?: string | null;
    invoice_date?: string | null;
  };
}

export interface Health {
  magemar: { ok: boolean; age_hours: number; path: string };
  qbo: { pro: string; store: string; env: string };
}
