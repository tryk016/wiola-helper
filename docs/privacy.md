---
title: Privacy Policy
layout: default
---

# Privacy Policy

**Application:** Wiola Helper
**Effective Date:** 2026-06-05
**Operated by:** EWI Store Ltd

## 1. Scope

Wiola Helper is an internal accounting automation tool used by authorized employees of **EWI Store Ltd** and **EWI Pro Insulation Systems Ltd** to process supplier invoices. This Privacy Policy describes what data the Application handles, how it is processed, and your rights.

The Application is **not offered to the public** and does not collect data from third-party end users.

## 2. Data the Application Processes

### 2.1. Invoice data
Kreisel supplier invoices are read by the Application to extract structured fields:
- Invoice number, issue date, container reference
- Line items (product description, quantity, unit price, total)
- Supplier and buyer details (VAT numbers, addresses)

### 2.2. QuickBooks Online (QBO) data
Under user authorization, the Application connects to two QBO companies (EWI Pro Insulation Systems Ltd and EWI Store Ltd) and:
- **Reads:** vendors, customers, items, accounts, tax codes, invoice numbering
- **Writes:** Bills, Invoices, and attached PDFs (corresponding to processed supplier invoices)

### 2.3. Container shipping data
The Application reads a manually-downloaded Excel snapshot from a freight forwarder (Magemar / CMA CGM) to determine the actual UK port arrival date of containers, which determines the HMRC exchange rate month.

### 2.4. Authentication tokens
- **QBO OAuth refresh tokens** — stored locally in the user's `.env` file
- **Anthropic API key** — stored locally
- **MySQL credentials** (read-only access to internal warehouse DB) — stored locally

## 3. Data Transmission to Third Parties

### 3.1. QuickBooks Online (Intuit)
Invoice data, vendor/customer details, line items, monetary amounts, and PDF attachments are transmitted to QuickBooks Online via Intuit's official REST API for the sole purpose of creating Bills and Invoices in the user-authorized companies.

Intuit's data handling is governed by their [Privacy Statement](https://www.intuit.com/privacy/statement/).

### 3.2. Anthropic (LLM parser)
Kreisel invoice PDFs are sent to Anthropic's Claude API for structured data extraction (OCR + parsing). Anthropic's API does not train models on submitted data.

Anthropic's data handling: [https://www.anthropic.com/legal/privacy](https://www.anthropic.com/legal/privacy)

### 3.3. HMRC exchange rate API
The Application queries the UK Government's HM Revenue & Customs public exchange rate API for monthly PLN→GBP rates. Only a year-month parameter is sent; no invoice data leaves the device for this lookup.

### 3.4. No other third parties
The Application does **not** transmit data to advertising networks, analytics providers, social media services, or any party not strictly required for the accounting automation task.

## 4. Data Retention

- **OAuth tokens:** retained until the user revokes authorization (~100 days auto-rotation)
- **Local invoice cache (queue/history):** retained for operational reference; the user can clear at any time via the application UI
- **QBO documents:** retained according to QBO's own data retention policies (governed by Intuit)

## 5. Local Data Storage

All data processed by the Application is stored on the user's local Windows device:

- Credentials: `C:\kreisel\system\.env`
- Working folders: `C:\kreisel\inbox\`, `\gotowe\`, `\bledy\`, `\wstrzymane\`
- Application state: `%APPDATA%\Wiola Helper\` (queue, pending, history, preferences)

No data is uploaded to any cloud storage operated by the developer.

## 6. Data Security

- Tokens and API keys are stored in plain `.env` files on the user's machine; users are responsible for filesystem security
- Network traffic to QBO and Anthropic is over HTTPS (TLS 1.2+)
- The Application does not expose any inbound network ports
- Users are advised not to share `.env` files via email or unsecured channels

## 7. User Rights (GDPR / UK GDPR)

Since the Application processes internal company data (invoices for EWI's own accounting), data subject rights are exercised within the relevant company's standard processes. For questions, contact the EWI Store Ltd Data Protection Officer.

## 8. Children's Privacy

The Application is not directed to or used by children. It is an internal accounting tool used solely by authorized employees.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. Updates will be reflected in the "Effective Date" above. Continued use of the Application after such updates constitutes acceptance of the revised policy.

## 10. Contact

For privacy-related questions:

**EWI Store Ltd**
Unit 1-2, King Georges Trading Estate
Davis Road, Chessington, KT9 1TT
United Kingdom

Email: patrick.baran@ewistore.co.uk

---

*This is an internal-use application; this Privacy Policy is published publicly to satisfy QuickBooks Online App Assessment requirements only.*
