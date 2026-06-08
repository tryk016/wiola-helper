// Bridge to existing pipeline modules.
// Dev mode: C:\kreisel\system\
// Installed app: process.resourcesPath\kreisel-system\

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function getSystemPath(): string {
  // 1. Electron's resourcesPath (electron-builder NSIS installer)
  try {
    const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      const installed = path.join(resourcesPath, 'kreisel-system');
      if (existsSync(installed)) return installed;
    }
  } catch {}

  // 2. Portable layout: <portable>/system (sibling of wiola-helper)
  try {
    const exeDir = path.dirname(process.execPath);
    const portableSibling = path.join(exeDir, '..', 'system');
    if (existsSync(path.join(portableSibling, 'parse_kreisel_llm.js'))) {
      return portableSibling;
    }
    // Also try ../../system in case nested
    const portableUp = path.join(exeDir, '..', '..', 'system');
    if (existsSync(path.join(portableUp, 'parse_kreisel_llm.js'))) {
      return portableUp;
    }
  } catch {}

  // 3. Dev fallback (Patryk's machine)
  if (existsSync('C:/kreisel/system/parse_kreisel_llm.js')) return 'C:/kreisel/system';

  // 4. Hard fallback
  return 'C:/kreisel/system';
}

const SYSTEM_PATH = getSystemPath();
console.log('[wiola-helper] system path:', SYSTEM_PATH);

export const parseKreiselWithLlm = require(`${SYSTEM_PATH}/parse_kreisel_llm.js`).parseKreiselWithLlm as
  (pdfPath: string) => Promise<unknown>;

// Cheap text-only kreisel_ref extraction (no LLM); null if PDF is a scan.
export const quickKreiselRef = require(`${SYSTEM_PATH}/parse_kreisel_llm.js`).quickKreiselRef as
  (pdfPath: string) => Promise<string | null>;

export const resolveImport = require(`${SYSTEM_PATH}/resolve_import.js`).resolveImport as
  (refOrParsed: unknown) => Promise<unknown>;

export const lookupPodTransport = require(`${SYSTEM_PATH}/resolve_import.js`).lookupPodTransport as
  (kreiselRef: string) => Promise<{
    found: boolean;
    pod_id?: number;
    branch_id?: number;
    truck_reg_number?: string | null;
    is_placeholder?: boolean;
    is_container?: boolean;
    delivered?: boolean;
    delivery_date?: string | null;
    invoice_date?: string | null;
  }>;

export const getRate = require(`${SYSTEM_PATH}/hmrc_rate.js`).getRate as
  (month: string, currency: string) => Promise<{ rate: number; year: number; month: number }>;

export const qboClient = require(`${SYSTEM_PATH}/qbo_client.js`);
export const qboPayloads = require(`${SYSTEM_PATH}/qbo_payloads.js`);
export const magemarLookup = require(`${SYSTEM_PATH}/magemar_lookup.js`);

// PLN→GBP line math (same formulas the QBO Invoice build uses) — for live
// recompute of an edited draft without hitting QBO.
const _math = require(`${SYSTEM_PATH}/math.js`);
export const buildSaleLines = _math.buildSaleLines as (
  input: { lines: Array<{ ewi_sku: string; qty_kreisel: number; qty_ewi: number; unit_pln: number; total_pln: number; is_pallet?: boolean; is_sample?: boolean; is_pigment?: boolean }> },
  hmrcRate: number,
) => Array<{ ewi_sku: string; qty: number; rate_gbp: number; amount_gbp: number; total_pln_line: number; is_pigment: boolean; is_sample: boolean }>;
export const roundHalfUp = _math.roundHalfUp as (n: number, dp: number) => number;

export const systemPath = SYSTEM_PATH;
