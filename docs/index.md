---
title: Wiola Helper — Dokumentacja
layout: default
---

# Wiola Helper

> Wewnętrzne narzędzie do automatyzacji księgowości faktur Kreisel dla **EWI Store Ltd** i **EWI Pro Insulation Systems Ltd**.

Przetwarza faktury eksportowe Kreisla end-to-end:

```
PDF od Kreisla
   ↓ (parser tekstowy lub LLM-vision)
   ↓ (resolver HMRC: kontener→Magemar lub truck→MySQL)
   ↓ (kurs HMRC PLN→GBP)
   ↓ (3 dokumenty: Pro Bill, Pro Invoice, Store Bill)
QuickBooks Online ✓
```

---

## 📚 Spis dokumentacji

### Dla użytkownika końcowego (Wiola)
- **[Instrukcja dla Wioli](user-guide.html)** — codzienna praca, drag & drop, modale, błędy
- **[Aktualizacje aplikacji](updates.html)** — jak aktualizować, co to znaczy `🔄 Aktualizuj teraz`

### Dla właściciela / administratora (Patryk)
- **[Instalacja](installation.html)** — kompletny proces u Wioli krok po kroku, pendrive, OAuth
- **[Konfiguracja `.env`](env-config.html)** — wszystkie zmienne, sandbox vs production
- **[QBO integracja](qbo.html)** — OAuth flow, redirect URIs, payloady, App Assessment
- **[Pipeline](pipeline.html)** — co dzieje się dla każdej faktury
- **[Stany faktur](invoice-states.html)** — wszystkie statusy + odpowiadające modale
- **[Settings](settings.html)** — wszystkie preferencje + co robią
- **[Troubleshooting](troubleshooting.html)** — typowe problemy + rozwiązania
- **[Changelog](changelog.html)** — feature list, kiedy co dodaliśmy

### Dla deweloperów (przyszli)
- **[Architektura](architecture.html)** — komponenty, IPC, technology stack
- **[Development](development.html)** — `npm run dev`, hot reload, build
- **[Baza wiedzy MySQL](db.html)** — kluczowe tabele i kolumny

### Wymogi prawne (publiczne)
- **[End-User License Agreement (EULA)](eula.html)**
- **[Privacy Policy](privacy.html)**

---

## 🚀 Quick start

| Jesteś | Idź do |
|--------|--------|
| **Wiolą** — masz aplikację, chcesz pracować | [Instrukcja dla Wioli](user-guide.html) |
| **Patrykiem** — instalujesz u Wioli | [Instalacja](installation.html) |
| **Patrykiem** — dodajesz funkcję / debugujesz | [Architektura](architecture.html) + [Development](development.html) |
| **Intuit reviewer** — czytasz dla App Assessment | [QBO integracja](qbo.html) + [Privacy](privacy.html) + [EULA](eula.html) |
| **Future dev** — przejmujesz projekt | [Architektura](architecture.html) → [Pipeline](pipeline.html) → [Stany faktur](invoice-states.html) |

---

## 📞 Kontakt

**EWI Store Ltd**
Unit 1-2, King Georges Trading Estate
Davis Road, Chessington, KT9 1TT
United Kingdom

Email: [patrick.baran@ewistore.co.uk](mailto:patrick.baran@ewistore.co.uk)

Source code: [github.com/tryk016/wiola-helper](https://github.com/tryk016/wiola-helper)
