# Eksport produktów EWI Pro → EWI Store (design)

Data: 2026-09-30 · zatwierdzone przez Patryka w rozmowie.

## Cel

Produkty (QBO Items) istnieją w EWI Pro. Wiola Helper ma pozwolić wybrać je z listy
i założyć w EWI Store jednym kliknięciem.

## Ekran „📦 Produkty Pro → Store”

- Przycisk w stopce obok Historia / Log / Ustawienia, pełnoekranowy widok jak Historia.
- Po otwarciu: pobranie aktywnych produktów z EWI Pro i EWI Store (paginacja po 1000).
- Tabela: ☐ | Nazwa | SKU | Typ | Opis | Status (`Nowy` / `Już jest w Store` — wyszarzony, bez checkboxa).
- Wyszukiwarka, przełącznik „tylko brakujące w Store” (domyślnie włączony),
  „Zaznacz wszystkie” / „Odznacz wszystkie” (na widocznych wierszach), licznik „zaznaczono X z Y”.
- „Wyślij do EWI Store (X)” → potwierdzenie → zakładanie po kolei; przy każdym wierszu ✓ / ✗ z komunikatem QBO; podsumowanie.

## Co kopiujemy

- `Name`, `Sku`, `Description`, `PurchaseDesc`, `Type` (`Inventory` → `NonInventory`, bez stanów magazynowych).
- Konta + VAT: jak przy auto-create faktur — z podobnego produktu w Store (ta sama rodzina nazwy),
  inaczej dominująca para kont w Store (`pickItemTemplate` wydzielony z `createMissingItem`).
- Kategoria: jeśli w Store istnieje kategoria o tej samej pełnej nazwie co w Pro → produkt trafia do niej; inaczej bez kategorii.
- Bez cen. Pomijamy nieaktywne, `Category`, `Group`.

## Zasady bezpieczeństwa

- Tylko tworzenie nowych Items w Store. Nigdy update / delete istniejących.
- Porównanie po nazwie (bez wielkości liter i nadmiarowych spacji). Lista Store pobierana na starcie eksportu,
  każdy założony produkt dopisywany do zbioru → brak duplikatów także w obrębie jednej paczki.
  Błąd QBO 6240 (Duplicate Name) traktowany jako „już jest”.
- Błąd pojedynczego produktu nie przerywa reszty.

## Budowa

- `system/qbo_items_sync.js` — czysty Node: `listItems`, `compareCatalogs`, `buildStoreItemBody`, `exportToStore`.
  Klienci QBO i `pickTemplate` wstrzykiwani → testowalne bez sieci (`qbo_items_sync.test.js`, `node --test`).
- `wiola-helper/src/main/index.ts` — IPC `products:list`, `products:export`, event `products:progress`.
- `wiola-helper/src/renderer/components/ProductsView.tsx` + przycisk w `App.tsx`.
