# ⚠ REPO ROBOCZE — nie jest to finalna wersja witryny

To repozytorium służy **wspólnej pracy** (właściciel + asystent AI)
oraz **prezentacji kierunku dla zarządu klubu**. Ostateczna, publiczna
wersja strony KTS Gliwice zostanie wdrożona do **osobnego
repozytorium**. Poniższa treść opisuje bieżącą wersję testową.

---

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
3. **PZTS (1. liga) — też automat:** ten sam skrypt pobiera tabelę i
   terminarz 1. ligi z pzts.pl **przez czytnik r.jina.ai** (usługa
   headless-browser, która omija Cloudflare). Przy okazji liczy stan KTS I
   z tabeli ligowej (miejsce + punkty).
4. Jeśli dane się zmieniły — automatyczny commit; GitHub Pages przebudowuje
   stronę. Puste przebiegi nie tworzą commitów.
5. Odwiedzający wczytuje `dane.json` z CDN — natychmiast, bez serwera.

**Awaryjnie (PZTS):** gdyby czytnik nie odpowiedział, automat zachowuje
ostatni znany stan, a wyniki można wgrać ręcznie: *Run workflow* → wklej
JSON w pole `pzts_mecze`. Opcjonalny sekret `JINA_API_KEY` (darmowy klucz
z jina.ai) zabezpiecza na wypadek blokady anonimowego ruchu z IP runnera.

**Tryb nocny:** przełącznik 🌙/☀️ w nagłówku; wybór zapamiętywany w
przeglądarce, domyślnie wg ustawień systemu.

## Struktura repo

    index.html                      ← strona (szkielet projektowy + dane live)
    galeria.html                    ← GALERIA (podstrona; zdjęcia ładują się tylko tu)
    galeria.json                    ← indeks albumów (tytuły, daty, listy zdjęć)
    galeria/                        ← zdjęcia albumów (prototyp: bez optymalizacji)
    css/style.css · js/app.js       ← design 60-30-10 (błękit #0057B8, pomarańcz tylko CTA) + tryb nocny
    js/galeria.js                   ← logika galerii (filtry roku, lightbox, swipe)
    wersja.json                     ← numer wersji strony (widoczny w stopce)
    dane.json                       ← dane ligowe (generowane automatycznie — NIE edytować ręcznie)
    scripts/sync_statyczny.ts       ← synchronizacja (ŚZTS + PZTS-przez-czytnik)
    scripts/szts-core.ts             ← rdzeń: fetch + parser ŚZTS
    .github/workflows/sync-dane.yml ← harmonogram (co 2 h) + uruchomienie ręczne
    .github/workflows/rollback.yml  ← COFANIE wersji strony (patrz niżej)
    .github/workflows/keepalive.yml ← ochrona przed wygasnięciem cronów (patrz niżej)

## Wersjonowanie i cofanie zmian (rollback)

Każde wdrożenie kodu strony dostaje **tag `vX.Y.Z`** (lista: *Code* →
*Tags*). Bieżąca wersja widnieje w stopce strony i w `wersja.json`.

**Cofnięcie strony o wersję wstecz** (jeśli coś pójdzie nie tak):

1. Zakładka *Actions* → **„Rollback strony (cofnij wersję)”** → *Run workflow*.
2. Uruchom z PUSTYM polem „wersja” → cofa ostatnią zmianę kodu strony
   (dane ligowe `dane.json` zostają nietknięte — cron i tak je odświeża).
3. Albo: wpisz konkretną wersję (np. `1.0.0`) → przywraca pliki strony
   z taga `v1.0.0`.
4. Pages przebuduje się automatycznie — w stopce sprawdź numer wersji.

## Nowy sezon (odporność sezonowa)

- `scripts/sync_statyczny.ts` → sekcja KONFIGURACJA SEZONU: nazwy drużyn,
  ligi, adresy (nowa drużyna = nowy wpis; rozwiązanie drużyny = usunięcie).
- Kod drużyny PZTS (dziś 960) zmienia się przy awansie — odkrywanie jest
  zautomatyzowane w warsztacie projektowym (mapa herb-ID).

## Dlaczego crony nie umrą w wakacje (keepalive)

**Zasada GitHuba:** w repo publicznym zaplanowane workflowy (`schedule`)
są automatycznie wyłączane, gdy przez **60 dni nie ma żadnego commita**
w repo. Przebiegi cronów NIE liczą się jako aktywność — tylko commity.

Przez sezon nie ma problemu: sync commituje `dane.json` przy każdej
zmianie wyników (własne commity bota z `GITHUB_TOKEN` liczą się jako
aktywność). Dziura zaczyna się w wakacje: liga nie gra → brak zmian →
brak commitów → licznik tyka.

**Rozwiązanie:** `.github/workflows/keepalive.yml` — raz w tygodniu
sprawdza wiek ostatniego commita i po **40 dniach** bezczynności wypycha
**pusty commit** (nie dotyka plików). Licznik wraca do zera; w praktyce
workflow wykona się 1–2 razy w roku (lato). Zero sekretów, zero kont
zewnętrznych — wbudowany `GITHUB_TOKEN`. To standard rynkowy
(akcja `gautamkrishnar/keepalive-workflow` robi dokładnie to samo).

**Gdyby cron mimo wszystko wygasł** (np. ktoś usunął keepalive):
GitHub wysyła maila z linkiem „Enable workflow”, albo włącz ręcznie:
zakładka *Actions* → dany workflow → przycisk **Enable workflow**.
Podbicie czegokolwiek do repo (np. tego pliku) nie włączy go samo.

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
