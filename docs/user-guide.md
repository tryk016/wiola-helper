---
title: Instrukcja dla Wioli
layout: default
---

# Instrukcja użytkowania Wiola Helper

> Dla użytkownika końcowego. Wszystko po polsku, krok po kroku.

---

## 🎯 Co Wiola Helper robi za Ciebie

Bierze faktury PDF od Kreisla i automatycznie tworzy z nich **3 dokumenty w QuickBooks Online**:

1. **EWI Pro: Bill** od Kreisla (w PLN, z załącznikiem PDF)
2. **EWI Pro: Invoice** dla EWI Store (w GBP)
3. **EWI Store: Bill** od EWI Pro (w GBP)

Zamiast wprowadzać ręcznie każde z tych po kolei (~15 min/faktura), przeciągasz PDFy do okna i klikasz "Wyślij wszystkie".

---

## 🌅 Twoja codzienna rutyna

### 1. Rano: pobierz Magemar.xlsx

Wchodzisz na SharePoint → folder Magemar → najnowszy `magemar.xlsx` → **zapisz do `C:\kreisel\magemar.xlsx`** (nadpisuje starą).

To plik z aktualnymi datami przybycia (ATA) kontenerów do UK — Wiola Helper potrzebuje go żeby wiedzieć w którym miesiącu HMRC zaksięgować faktury.

Status w prawym górnym rogu aplikacji pokaże:
- ✓ `1h temu` → świeży Magemar, OK
- ✓ `28h temu` → trochę stary, ale działa
- ⚠ `52h temu` → ZAMENI Magemar dziś

### 2. Otwórz Wiola Helper

Dwuklik **"Wiola Helper"** na pulpicie. Otwiera się okno.

### 3. Pobierz faktury z maila

Pobierasz faktury z Kreisla (mail od Kreisla, z załącznikami `FSE-XXX.pdf`) na komputer (Downloads).

### 4. Przeciągnij PDFy do okna

Zaznaczasz wszystkie PDFy (Ctrl+A w folderze), przeciągasz na obszar z napisem **"Przeciągnij faktury Kreisla tutaj"**.

Pojawiają się w **kolejce** poniżej. Każda z ikonką ⏳ `Oczekuje`.

### 5. Klik "Wyślij wszystkie"

Zielony przycisk po prawej. Faktury zaczynają się przetwarzać:

```
FSE-138/2026/EXP   ✅ Gotowe
FSE-139/2026/EXP   ⚙️  Procesuję  ████████░░ 60%
FSE-140/2026/EXP   ⏳ Oczekuje
FSE-141/2026/EXP   ⏳ Oczekuje
...
```

**Pierwsza faktura idzie od razu.** Kolejne mają **opóźnienie 4-10 min między sobą** (random) — żeby w QBO nie wyglądało jakby automat wprowadzał (audyt ESM by zauważył 20 faktur w 30 sekund).

W tym czasie możesz robić cokolwiek — Wiola Helper sam się przemiela.

### 6. Sprawdź "Gotowe"

Po zakończeniu każda faktura ma ✅ `Gotowe` i automatycznie **znika z kolejki po 30s** (przenosi się do **📋 Historii**).

Możesz teraz wejść do QBO i sprawdzić że Bills/Invoices są wprowadzone.

---

## 🚨 Co robić gdy coś przerywa pipeline

### 🚛 "Potwierdź transport — klik" (niebieskie)

Pojawia się gdy **PDF faktury nie ma numeru kontenera** ani auta. To często dla truck deliveries.

**Modal otwiera się sam.** Pokazuje:
- Co Wiola Helper znalazł w MySQL (POD numer, branch, truck_reg, czy dostarczone)
- Pole **Numer kontenera lub auta** (czasem z auto-prefillem)
- Pole **Miesiąc HMRC** (opcjonalne)

**Co wpisać?**

| Sytuacja | Co robisz |
|----------|-----------|
| MySQL pokazuje prawdziwy numer (np. `TRHU5877732 ✓ kontener`) | Klik **Procesuj dalej** — zostanie auto-wybrane |
| MySQL pokazuje placeholder (np. `196/2026/EXP ⚠ placeholder`) | Wpisz prawdziwy numer auta jeśli znasz, lub zostaw puste |
| Wiesz miesiąc HMRC ale nie znasz numeru | Wpisz miesiąc (np. `2026-05`), pole numeru zostaw puste, klik Procesuj |
| Nie znasz nic | Klik **Anuluj** — faktura zostaje w kolejce, wrócisz później |
| Coś się posypało, nie chcesz dalej procesować | Klik **Nie procesuj — zatrzymaj batch** (zatrzyma kolejne faktury, zachowując numerację) |

Po **Procesuj dalej** pipeline natychmiast kontynuuje od tej samej faktury. Następna w batchu rusza automatycznie. **NIE klikasz "Wyślij wszystkie" jeszcze raz.**

### ⚠️ "Nieznany produkt" (żółte)

LLM nie zmapował jednej z pozycji do EWI Pro Item. Modal otwiera się automatycznie:

```
Linia 3:
qty 96   cena 22,40 PLN   razem 2 150,40 PLN
Opis z faktury Kreisla:
„EWIPRO TYNK SUPER PREMIUM ZGM-150 25KG"

Albo wpisz nazwę EWI Pro Item własnoręcznie:
[ EWI-150 25KG          ]  [Użyj]

☑ Zapamiętaj to mapowanie — następnym razem nie zapyta
[Pomiń całą fakturę]
```

Wpisz dokładną nazwę z QBO Items list. **Zaznacz "Zapamiętaj"** — następnym razem LLM sam ją złapie.

Jeśli nie wiesz co to → **Pomiń całą fakturę** (idzie do bledów, batch się zatrzymuje, kontaktujesz Patryka).

### ⏸ "Granica miesiąca" (pomarańczowe — w sekcji Oczekujące)

Pojawia się **POD kolejką**, w osobnej sekcji **"⏸ Oczekujące"**. Dwa scenariusze:

**A) Kontener jeszcze nie dotarł do UK** (Magemar nie pokazuje ATA, transit byłby blisko końca miesiąca):
```
FSE-145/2026/EXP   czeka 2 dni
Możliwe HMRC: 2026-05 lub 2026-06
```
Klik na fakturę → modal z **dwoma kolorowymi przyciskami**. Jeśli wiesz na pewno (np. masz kontakt z Magemarem) → klik miesiąc. Jeśli nie → zostaw, jutro pobierzesz świeży Magemar i kliknij **🔍 Sprawdź teraz** — system sam wybierze.

**B) Truck nie dostarczył jeszcze do magazynu**:
```
FSE-196/2026/EXP   czeka 1 dni
POD #8637 jest w MySQL — nr auta: placeholder...
Brak daty dostawy. Truck jeszcze nie dostarczony.
```
Klik → modal **bez sugerowanych miesięcy**, z polem **"Wpisz miesiąc HMRC ręcznie"** (YYYY-MM). Gdy magazyn oznaczy dostawę → **🔍 Sprawdź teraz** automatycznie pociągnie delivery_date.

### ❌ "Błąd" (czerwone)

Coś poszło nie tak. Najedź na fakturę → pojawi się **🔄** zielone (retry) i **✕** czerwone (delete).

Klik **🔄** → faktura wraca do ⏳ `Oczekuje`. Klik "Wyślij wszystkie" → próba ponowna.

W sidebar po prawej zobaczysz konkretny błąd:
- `QBO 400: Required parameter Line.Amount missing` → daj znać Patrykowi
- `Resolver: no_data` → faktura nie ma kontenera ani daty wystawienia
- `LLM timeout 120s` → spróbuj ponownie, jeśli się powtarza → log Patrykowi

### 🔄 "Czekam (anti-bot)" (fioletowe)

Random delay między kolejnymi POST QBO. NIE klikaj retry — to jest **prawidłowe zachowanie**.

Pasek pokazuje countdown `MM:SS`. Jeśli musisz pilnie:
- Klik **"Wyślij teraz"** obok countdown'a → pomija delay dla tej jednej faktury

Domyślnie: 4-10 min losowe. Patryk może to zmienić w Settings (lub wyłączyć ustawiając 0/0).

---

## 📂 Sekcje aplikacji

| Sekcja | Co tu jest |
|--------|-----------|
| **Przeciągnij faktury…** (góra) | Drop zone + button "lub kliknij aby wybrać pliki" |
| **📋 W kolejce** | Aktywnie procesowane / oczekujące |
| **⏸ Oczekujące** (pod kolejką) | Wstrzymane na granicy miesiąca / czekające na MySQL/Magemar |
| **Sidebar** (prawa strona) | Szczegóły wybranej faktury: status, kwoty PLN/GBP, linie, HMRC info, błąd jeśli jest |
| **📋 Historia** (stopka) | Wszystkie zakończone faktury — przeszukiwalne, sortowane po dacie/numerze/kwocie |
| **📝 Log** (stopka) | Tail z `log.txt` (techniczny — głównie dla debugowania) |
| **⚙️ Ustawienia** (stopka) | Środowisko QBO, OAuth login, preferencje, aktualizacje, kontakt |
| **🔄 v0.1.0** (stopka) | Aktualna wersja (commit SHA) |

---

## 📊 Pasek statusu (góra)

```
Wiola Helper                          Magemar: ✓ 1h temu   QBO: 🟢 PRODUCTION
Kreisel → EWI Pro → EWI Store
```

- **Magemar**: ✓ świeży / ⚠ stary (>48h)
- **QBO**: 🟢 PRODUCTION (realne) lub 🔴 SANDBOX (testowe) — nie zmieniaj bez konsultacji z Patrykiem!

---

## 🎓 Pro-tipy

### Kolejność faktur nie ma znaczenia
Wiola Helper **sam sortuje po numerze Kreisla** (FSE-001, FSE-002, ...) przed przetwarzaniem. Możesz przeciągnąć w dowolnej kolejności.

### Duplikaty są automatycznie wykrywane
Jeśli przeciągniesz fakturę, którą już procesowałaś (jest w Historii) → modal "Duplikaty" zapyta:
- **Pomiń wszystkie** (default) — zignoruj
- **Wymuś wszystkie** — wprowadź jeszcze raz (np. po edycie po stronie Kreisla)

### Tryb dry-run (testowy)
Ustawienia → Preferencje → **Tryb domyślny** = `Dry-run (tylko podgląd)`.

W tym trybie pipeline robi WSZYSTKO oprócz finalnego POST QBO — widzisz w sidebar co BY poszło. Dobry sposób żeby sprawdzić nową fakturę bez ryzyka.

### Otwórz folder z logami
Ustawienia → 🆘 Pomoc → **"Otwórz folder z logami"** → wyskakuje Explorer z `log.txt` zaznaczonym. Załączasz do maila do Patryka.

### Aktualizacje
Ustawienia → 🔄 Aktualizacje → **"Sprawdź aktualizacje"** → jeśli jest nowa → **"Aktualizuj teraz"**.

Aplikacja zamknie się, w tle pobierze nową wersję (~2 min), sama uruchomi się ponownie. Nic nie klikasz — pendrive niepotrzebny.

---

## ❓ FAQ

**Q: Co jeśli komputer się wyłączy w trakcie procesowania?**
A: Po starcie aplikacji faktury z "Procesuję"/"Parsuję" automatycznie dostają ❌ Błąd z message "Aplikacja zrestartowana…" — klik 🔄 retry, batch rusza dalej od miejsca gdzie skończył.

**Q: Wyświetliłam się jako "0.00 PLN" na linii Import — to dobrze?**
A: Tak. QBO API wymaga liczby, ale faktyczna kwota faktury jest rozdzielona na Item lines poniżej. Księgowa to widziała w QBO przed automatyzacją tak samo.

**Q: Mogę zmienić godziny opóźnienia 4-10 min?**
A: Tak — Ustawienia → Preferencje → Min/Max minut. **NIE ustawiaj na 0/0 w trybie production** chyba że masz konkretny powód.

**Q: Co jeśli ktoś ma dostęp do mojego komputera?**
A: `.env` z kluczami QBO leży w `C:\kreisel\system\.env` jako zwykły tekst. Tokeny QBO wygasają po 100 dniach bezczynności. Jeśli ktoś niepowołany dostał `.env` — zmień refresh tokens (Settings → "Zaloguj ponownie" dla Pro i Store).

**Q: Co jeśli faktura ma zniżkę / rabat / inny PRODUCT?**
A: Wiola Helper polega na liście znanych SKU. Jeśli LLM nie zmapuje → "Nieznany produkt" modal — wpisujesz nazwę z QBO. Jeśli to nowy SKU którego nie ma w QBO → Patryk musi dodać do QBO Items pierwszy.

**Q: Gdzie szukać błędów technicznych?**
A: `C:\kreisel\log.txt` — pełny log wszystkich operacji.

---

## 📞 Wsparcie

Wszelkie pytania, problemy, dziwne komunikaty:

**Patryk Baran**
patrick.baran@ewistore.co.uk

W Settings → 🆘 Pomoc i wsparcie jest mailto-link gotowy. Załącz log z folderu (przycisk obok).
