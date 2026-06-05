# Wiola Helper

Internal accounting automation for **EWI Store Ltd** + **EWI Pro Insulation Systems Ltd**.

Processes Kreisel (Poland) supplier invoices end-to-end:

```
Kreisel PDF → LLM parse → MySQL/Magemar resolve → HMRC FX → QBO (3 docs + attachment)
```

## Architecture

- **`system/`** — Node.js pipeline (parsers, resolvers, QBO client, payloads)
- **`wiola-helper/`** — Electron + React + TypeScript GUI
- **`docs/`** — Full documentation (rendered on GitHub Pages)

## Stack

Electron 33 · React 18 · TypeScript · Vite · Tailwind CSS · Anthropic Claude Sonnet 4.5 · Intuit QBO REST v3 · MySQL (read-only) · ExcelJS · pdf-parse v2

## Documentation

📚 **[Full documentation site](https://tryk016.github.io/wiola-helper/)** — start here.

Quick links:
- [Instalacja u Wioli](https://tryk016.github.io/wiola-helper/installation.html)
- [Instrukcja dla Wioli (end user)](https://tryk016.github.io/wiola-helper/user-guide.html)
- [Architektura](https://tryk016.github.io/wiola-helper/architecture.html)
- [Pipeline](https://tryk016.github.io/wiola-helper/pipeline.html)
- [Troubleshooting](https://tryk016.github.io/wiola-helper/troubleshooting.html)
- [Development](https://tryk016.github.io/wiola-helper/development.html)
- [Changelog](https://tryk016.github.io/wiola-helper/changelog.html)

## Status

Private internal tool. Source published publicly for QuickBooks Online App Assessment compliance.

## Legal

- [EULA](https://tryk016.github.io/wiola-helper/eula.html)
- [Privacy Policy](https://tryk016.github.io/wiola-helper/privacy.html)

## Contact

Patryk Baran · patrick.baran@ewistore.co.uk
