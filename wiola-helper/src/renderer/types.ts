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
  | 'awaiting_transport_confirm'
  | 'ready';

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
  delay_from?: number;   // unix ms — when the anti-automation delay started
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
  // Editable draft (status 'ready'); upload re-derives the 3 docs from it.
  scan?: {
    k: {
      lines: Array<{
        ewi_sku: string;
        qty_kreisel: number;
        qty_ewi: number;
        unit_pln: number;
        total_pln: number;
        raw_desc?: string;
        is_pallet?: boolean;
        is_sample?: boolean;
        is_pigment?: boolean;
      }>;
      [key: string]: unknown;
    };
    hmrc_rate: number;
    hmrc_month: string;
    edited?: boolean;
  };
  ewipro_pdf_path?: string;
}

export interface Health {
  magemar: { ok: boolean; age_hours: number; path: string };
  qbo: { pro: string; store: string; env: string };
}

// A Pro product in the Pro → Store export picker (system/qbo_items_sync.js).
export interface ProductRow {
  id: string;
  name: string;
  fullName: string;
  sku: string;
  type: string;
  description: string;
  parentName: string | null;
  inStore: boolean;
}

export interface ProductExportResult {
  id: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  storeId?: string;
  message?: string;
}
