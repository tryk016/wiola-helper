# Wiola Helper

Internal accounting automation for **EWI Store Ltd**.

Processes Kreisel (Poland) supplier invoices end-to-end:

```
Kreisel PDF → LLM parse → HMRC FX rate → QBO Bills + Invoices → attachments
```

## Architecture

- **`system/`** — Node.js pipeline (parsers, resolvers, QBO client, payloads)
- **`wiola-helper/`** — Electron + React + TypeScript GUI

## Stack

- Electron 33, React 18, TypeScript, Vite, Tailwind CSS
- Anthropic Claude (Sonnet) for invoice parsing
- Intuit QBO REST API v3
- MySQL (read-only) for shipping data
- ExcelJS for Magemar manifest parsing

## Status

Private internal tool. Not distributed.

## Legal

- [EULA](docs/eula.md)
- [Privacy Policy](docs/privacy.md)

## Contact

Patryk Baran · patrick.baran@ewistore.co.uk
