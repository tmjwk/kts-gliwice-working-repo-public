# KTS Gliwice — strona testowa (wdrożenie statyczne)

Testowa, publiczna wersja robocza strony klubu **KTS Gliwice** na GitHub
Pages. Służy ocenie kierunku projektowego (zarząd klubu) i testowi
automatyzacji wyników ligowych. **Nie jest wersją finalną** — treści
placeholderowe są celowe. Na czas testów strona jest nieindeksowalna
(`robots.txt` + meta noindex — do usunięcia przy premierze).

## Jak to działa (automatyzacja)

1. **GitHub Actions** (`.github/workflows/sync-dane.yml`) uruchamia się wg
   harmonogramu (**co 2 h**) lub ręcznie: zakładka *Actions* →
   „Sync danych ligowych” → *Run workflow*.
2. Skrypt `scripts/sync_statyczny.ts` (bun, bez bazy danych) pobiera
   4 strony ligowe z ligi.slzts.pl, parsuje **tabele + terminarze + stany
   drużyn** i zapisuje `dane.json`.
3. Jeśli dane się zmieniły — automatyczny commit; GitHub Pages przebudowuje
   stronę. Puste przebiegi nie tworzą commitów.
4. Odwiedzający wczytuje `dane.json` z CDN — natychmiast, bez serwera.

**PZTS (1. liga, KTS Gliwice I):** pzts.pl jest za Cloudflare — runner
Actions nie odczyta tej strony. Mecze 1. ligi aktualizuje się **raz na
kolejkę**: *Run workflow* → wklej JSON w pole `pzts_mecze` (wyeksportowany
z warsztatu projektowego). Bez wklejki zachowywany jest ostatni znany stan.

## Struktura repo

    index.html                      ← strona (szkielet projektowy + dane live)
    css/style.css · js/app.js       ← design 60-30-10 (błękit #0057B8, pomarańcz tylko CTA)
    dane.json                       ← dane ligowe (generowane automatycznie — NIE edytować ręcznie)
    scripts/sync_statyczny.ts       ← synchronizacja (ŚZTS: pełny automat)
    scripts/szts-core.ts            ← rdzeń: fetch + parser ŚZTS
    .github/workflows/sync-dane.yml ← harmonogram (co 2 h) + uruchomienie ręczne

## Nowy sezon (odporność sezonowa)

- `scripts/sync_statyczny.ts` → sekcja KONFIGURACJA SEZONU: nazwy drużyn,
  ligi, adresy (nowa drużyna = nowy wpis; rozwiązanie drużyny = usunięcie).
- Kod drużyny PZTS (dziś 960) zmienia się przy awansie — odkrywanie jest
  zautomatyzowane w warsztacie projektowym (mapa herb-ID).

## Znane ograniczenia (uczciwie)

- **„?” w nazwach przeciwników** — wada serwera ligi.slzts.pl (gubi polskie
  znaki w danych drużyn). Nazwy drużyn KTS Gliwice są czyste.
- **Walkovery** — mecze z niestandardowym werdyktem mogą być pominięte
  przez parser (weryfikacja przy pierwszym takim przypadku).
- Częstotliwość: 48 zapytań/dobę do ligi.slzts.pl (co 2 h × 4 strony) —
  celowo grzeczna; zmiana = jedna cyfra w cron (`*/1`, `*/4`, `*/6`).

## Prawa i źródła danych

Wyniki i tabele: [pzts.pl](https://pzts.pl) (1. liga) +
[ligi.slzts.pl](https://ligi.slzts.pl) (ligi 2–4, amatorzy). Strona klubowa,
użycie niekomercyjne, atrybucja w sekcjach wyników.
