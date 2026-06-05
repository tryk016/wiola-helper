---
title: Aktualizacje aplikacji
layout: default
---

# Aktualizacje Wiola Helper

## 🔄 Najprostszy sposób — z aplikacji

**1.** Otwórz Wiola Helper.

**2.** Klik **Ustawienia** (zębatka w prawym dolnym rogu).

**3.** Sekcja **🔄 Aktualizacje**.

**4.** Klik **"Sprawdź aktualizacje"**.

**5.** Co się może pojawić:

### Status 1: ✅ Masz najnowszą wersję
```
Twoja wersja:        a4d7083
Wersja na GitHub:    a4d7083
✓ Masz najnowszą wersję
```
Nic nie robisz.

### Status 2: 📦 Dostępna nowa wersja
```
Twoja wersja:        a4d7083
Wersja na GitHub:    7bad8c8

Najnowsza zmiana: Confirm-transport gate: MySQL suggestion + manual...

📦 Dostępna nowa wersja!
[⬇ Aktualizuj teraz]
```

**6.** Klik **"Aktualizuj teraz"**.

**7.** Confirm dialog: "Aplikacja zamknie się i sama uruchomi się ponownie. Trwa 2-3 minuty. Kontynuować?"

**8.** Klik **OK**.

**9.** Aplikacja zamyka się.

**10.** **Czekasz ~2 minuty.** W tym czasie nic nie widać (cicho leci w tle: download najnowszego kodu z GitHub, npm install jeśli zmieniły się zależności, Vite build, rebuild skrótów).

**11.** Wiola Helper sama otwiera się ponownie. Już ma najnowszy kod.

**12.** Możesz kontynuować pracę.

---

## ❓ Co jeśli aplikacja nie wraca po ~5 minutach

Coś poszło nie tak w tle. Spróbuj:

1. Sprawdź czy `electron.exe` jest w Task Manager → Procesy. Jeśli wisi — End Task
2. Klik 2× **"Wiola Helper"** na pulpicie
3. Jeśli otwiera się — sprawdź Settings → Aktualizacje → "Sprawdź aktualizacje" → powinieneś już mieć najnowszą wersję

Jeśli aplikacja w ogóle się nie otwiera:
- Mail do Patryka z opisem
- Albo: pobierz [update_wiola.cmd](https://raw.githubusercontent.com/tryk016/wiola-helper/main/update_wiola.cmd), uruchom prawym → "Uruchom"

---

## 🛠 Sposób manualny — bezpośrednio z PowerShell

Tylko gdy aplikacja nie chce się otworzyć w ogóle.

```powershell
cd C:\kreisel
.\update_wiola.cmd
```

Jeśli `update_wiola.cmd` nie istnieje — pobierz najnowszy:

1. Wejdź na https://github.com/tryk016/wiola-helper
2. Klik na **`update_wiola.cmd`**
3. Klik **"Raw"** lub **Ctrl+S** → zapisz na pulpit
4. Prawym → "Uruchom"

Skrypt:
- Pobierze najnowszy kod z GitHub
- Zrobi backup `.env` + `magemar.xlsx` (na wypadek gdyby coś usunął)
- Skopiuje nowe pliki
- Odbuduje aplikację (npm install + Vite build)
- Odtworzy skróty na pulpicie

---

## Co się zachowuje przy aktualizacji

✓ Zachowane:
- `C:\kreisel\system\.env` (twoje credentials)
- `C:\kreisel\magemar.xlsx` (dzisiejszy Magemar)
- `C:\kreisel\nodejs\` (Node.js, raz pobrany)
- `%APPDATA%\Wiola Helper\state\` (kolejka, historia, pending, preferencje)
- Skróty na pulpicie i w Menu Start

✗ Zastępowane:
- Pliki źródłowe (`*.js`, `*.ts`, `*.tsx`, `package.json`, …)
- `dist/`, `dist-electron/` (rebuilowane od zera)
- `.version` (nowy SHA)

Jeśli ktoś zmienił `package.json` (nowe zależności) — `npm install` poleci ~30s dodatkowo. Inaczej skip.

---

## Wersjonowanie

Wiola Helper nie ma "semver" jak typowe aplikacje. Trzymamy commit SHA jako wersję, bo:

1. Nie publikujemy ich do publicznych storów (App Store / Play Store)
2. Update jest in-place, nie ma "downgrade" path
3. Tracking po commit pozwala precyzyjnie wskazać który feature/fix masz

`Twoja wersja: a4d7083` = pierwsze 7 znaków SHA commitu na main z którego zbudowano.

Możesz zobaczyć co to za commit:
```
https://github.com/tryk016/wiola-helper/commit/a4d7083
```

---

## Pod spodem (dla zainteresowanych)

`Aktualizuj teraz` flow:

```
[Wiola klika "Aktualizuj teraz"]
         ↓
[Electron pisze tymczasowy plik VBS do %TEMP%\wiola_update_<ts>.vbs]
         ↓
[Spawn wscript.exe (GUI subsystem, no console) z tym VBS]
         ↓
[VBS uruchamia PowerShell z -WindowStyle Hidden, window state 0]
         ↓
[PowerShell update_wiola.ps1 leci w tle:
   • Backup .env + magemar do %TEMP%
   • Download ZIP z GitHub main branch
   • Extract do TEMP, skopiuj source files (preserve list)
   • SHA hash check package.json — jeśli zmienione, npm install
   • Vite build (rebuild dist + dist-electron)
   • Odbuduj skróty (Desktop + Start Menu)
   • Zapisz nowy SHA do C:\kreisel\.version
   • Start-Process electron.exe ← relaunch]
         ↓
[Aplikacja otwiera się sama z nowym kodem]
```

Brak czarnej konsoli (wscript.exe + PowerShell -WindowStyle Hidden). Brak admin (wszystko user-level w `C:\kreisel\`).

Cały scenariusz odporny na wcześniejszy zamkniecie aplikacji w trakcie (backup `.env` i `magemar` zostają w `%TEMP%`).
