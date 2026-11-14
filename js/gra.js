/* js/gra.js — 1.29.2: GRA „PONG” — pobierana PRZY KAŻDYM WEJŚCIU,
   przez MIRROR w repo strony (repo gry github.com/tmjwk/pong zostaje
   PRYWATNE — GitHub Actions w nim kopiuje game/ → gra/ w repo strony
   przy każdym pushu; sekret TOKEN_STRONY, szyfrowany, tylko Actions).

   Właściciel 05.11: „grę przy każdym ładowaniu site musisz pobierać
   bo jest w trakcie rozwoju i nie może być częścią stała kodu strony”.

   JAK TO DZIAŁA (od 1.29.2):
   - gra ŻYJE w prywatnym repo tmjwk/pong; push do game/ odpala
     workflow, który publikuje mirror do katalogu gra/ w repo strony
     (+ gra/.mirror.json: skąd i kiedy mirror powstał);
   - gra.html (ta podstrona) jest tylko PRZEKAŹNIKIEM: przy każdym
     otwarciu pyta API GitHuba o SHA ostatniego commita w gra/
     (publiczne repo, CORS, bez tokenu), a potem pobiera plik gry
     z raw.githubusercontent.com/<repo>/<SHA>/gra/…;
   - adres z SHA jest NIEZMIENNY per wersja gry — cache CDN nie
     przeszkadza (każda nowa wersja = nowy adres). ODKRYCIE 1.29.2:
     CDN raw IGNORUJE parametry ?bust= (test: x-cache HIT przy dwóch
     różnych wartościach), więc dawne obejście z 1.29.0 nie działało;
     SHA-adres to gwarancja dokładnie najświeższej wersji;
   - gdy API padnie (np. limit 60/h na IP) — fallback na gałąź main
     (może być do ~5 min wstecz za CDN — lepiej niż nic);
   - ścieżki względne z HTML-a gry (src/href/poster/srcset, url() w
     stylach) przepisywane na ABSOLUTNE adresy raw z tego samego SHA,
     do dokumentu wstawiany jest <base> — także zasoby dociągane
     później przez JS gry rozwiązują się do właściwej wersji;
   - gotowy dokument trafia do iframe srcdoc (gra działa w pełni:
     skrypty, canvas, dźwięk, localStorage z rekordami);
   - gdy nic nie da się pobrać — czytelny ekran „chwilowo
     niedostępna” z przyciskiem ponownej próby.

   1.29.4 — WERSJA GRY WIDOCZNA NA STRONIE: chip „wersja gry: vX.Y.Z”
   przy tytule planszy (+ dopisek w stopce). Odczytywana z nagłówka
   pobranego pliku gry („Wersja: X.Y.Z (…)”) — czyli z tego, co gra
   NAPRAWDĘ deklaruje w pliku, który właśnie gra gość. Właściciel
   06.11: „podniosłem grę do v0.3.1 (…) wyświetlaj wersję gry na
   stronie gdzie ją prezentujesz”. Gdy plik nie ma znacznika wersji,
   chip pokazuje skrót SHA mirroru (kierunek zawsze prawdziwy).

   1.29.6 — OFICJALNY PROTOKÓŁ WERSJI GRY v0.3.2 (właściciel wbudował
   go w grę specjalnie dla tej strony — patrz gra/version.json):
   - źródła wersji wg kolei: gra/version.json (zawsze obok pliku gry),
     <meta name="game-version">, <html data-version>, stary komentarz
     „Wersja: X.Y.Z”, a gdy nic — skrót SHA mirroru;
   - działająca gra SAMA potwierdza wersję postMessage
     {type:'pong:version'} (auto po starcie; na żądanie strona wysyła
     {type:'pong:get-version'}) — chip pokazuje to, co gra NAPRAWDĘ
     uruchomiła, nie tylko deklarację z pliku;
   - {type:'pong:exit'} (gracz wcisnął EXIT/Esc w grze): strona chowa
     planszę i pokazuje panel „Gra zakończona” z przyciskem
     „Zagraj ponownie” — twardy EXIT z gry nie zostawia pustej ramki.

   1.29.7 — GRA W TYM SAMYM OKNIE + EXIT = „WSTECZ” (właściciel 07.11:
   „otwieranie gry PONG w nowym oknie nie ma sensu bo na iphone to nie
   działa — otwieraj w tym samym oknie, a ja zaprogramuję przycisk
   EXIT w grze jako back”):
   - stopka: href="gra.html" BEZ target=_blank (wszystkie podstrony);
   - ramka gry jest srcdoc = SAME-ORIGIN z gra.html, więc gra v0.3.3+
     przy EXIT może sama cofnąć nawigację (top.history.back());
   - panel „Gra zakończona” (pong:exit) zostaje jako FALLBACK: starsze
     wersje gry oraz wejście bezpośrednie na gra.html bez historii;
     pokazuje się z opóźnieniem 350 ms, żeby nie migać, gdy gra sama
     cofa nawigację.

   1.29.8 — EXIT = „WSTECZ” PO STRONIE + WERSJA TYLKO W GRZE (właściciel
   07.11: „sprawdzanie wersji gry coś nie działa więc prawdopodobnie
   lepiej niech tylko w grze widać wersję?”; wskazówka agenta gry:
   wyjście ma wracać dokładnie tam, skąd wszedł):
   - pong:exit → po 250 ms history.back() (bfcache przywraca stronę
     co do piksela, ze stanem i przewinięciem); gdy gra sama cofnie
     nawigację (v0.3.5+: top.history.back() w ramce same-origin),
     pagehide anuluje nasz „wstecz” — bez podwójnego cofania;
     panel „Gra zakończona” (po 700 ms) zostaje fallbackiem dla
     wejścia bez historii;
   - KONIEC POKAZYWANIA WERSJI GRY NA STRONIE: chip #gra-wersja
     i dopisek w stopce zdjęte (diagnoza: na GitHubie wciąż v0.3.3 —
     najnowsza OPUBLIKOWANA; gra nieopublikowanych wersji nie pokaże).
     Wersję gra ma na korcie od v0.3.1 — jedno źródło prawdy.
     Protokół wersji (version.json / meta / postMessage pong:version)
     zdjęty ze strony: strona go ignoruje, gra może nadal używać.

   1.29.9 — OBRONA PRZED SAMONAPRAWĄ GRY (gra v0.3.5+: EXIT w iframe
   wysyła ping pong:exit, a po 600 ms bez reakcji SAMA robi
   top.location.replace(ENTRY || "/")). Problem zweryfikowany E2E
   07.11 na żywej stronie: w naszym osadzeniu (iframe srcdoc)
   document.referrer = "" i ?back= nie dociera → ENTRY="" → cel
   samonaprawy = "/" = root tmjwk.github.io = 404/github.com. Przy
   wejściu wprost na gra.html (nowa karta, bez historii) EXIT WYRZUCAŁ
   gościa ze strony klubu na github.com. Naprawa po stronie strony:
   - brak historii (history.length <= 1): NIE czekamy na back() —
     natychmiast rozbrajamy grę (ramka.srcdoc = "" zastępuje dokument
     gry pustym → jej timer 600 ms ginie razem z dokumentem) i
     pokazujemy panel „Gra zakończona” — gość zostaje w klubie;
   - back() w drodze: jeśli do 450 ms nie było pagehide, rozbrajamy
     grę (timer samonaprawy umiera), back() kończy się, kiedy się
     skończy — bez wyścigu z 600 ms gry; panel (700 ms) zostaje
     fallbackiem, gdyby back() jednak nic nie zrobił.
   Rozbrojenie przez srcdoc="" (a nie remove()) zachowuje ramkę w
   DOM — „Zagraj ponownie” dalej działa (zaladujGre ustawia srcdoc
   od nowa). poczekamy na protokół ACK z gry (propozycja dla v0.3.7 —
   patrz tmjwk/pong docs/dialog_ze_strona.md, runda 1): wtedy
   samonaprawa będzie gaszona po cichu po stronie gry.

   1.33.0 — LISTY MECZÓW: CHRONOLOGIA / WG DRUŻYN (zgłoszenie
   właściciela 10.11: „Niech listy ‹Najbliższe mecze — wszystkie
   drużyny› i ‹Ostatnie mecze — wszystkie drużyny› mają opcje
   listowania wg chronologi i wg drużyna. Wybierz odpowiednie
   sortowanie domyślne dla każdej z list.”). Każdy z dwóch kafelków
   dostaje pigułkowy przełącznik („Chronologicznie” / „Wg drużyn”),
   wybór zapamiętywany OSOBNO dla każdej listy (localStorage
   „kts-widoki-meczy”, wraca po powrocie na stronę). DOMYŚLNIE
   chronologicznie na OBU listach — uzasadnienie: „Najbliższe” =
   najbliższe pierwsze (gość pyta „kiedy najbliższy mecz?”,
   niezależnie od drużyny), „Ostatnie” = najświeższe pierwsze (gość
   pyta „co było wczoraj?”) — do 1.32.2 „Ostatnie” były ZAWSZE wg
   drużyn, teraz grupowanie jest drugą opcją. Zasady grupowania
   (wspólne, jak 1.20.0): drużyny w kolejności sezonu (dane.zespoly
   = 1. liga → … → amatorzy), w grupie: najbliższe rosnąco, ostatnie
   malejąco; derby naszych drużyn → grupa wyżej notowanej (raz).
   Technicznie (js/app.js + index.html + css/style.css): stan
   WIDOKI_MECZY + grupyWgDruzyn()/htmlGrupMeczy() (wspólne dla obu
   list), renderMecze() rysuje płaską <ul> albo sekcje .mecz-grupa,
   podpinWidokiMeczy() w start() (przyciski żyją mimo przerysowań
   pętli świeżości), kontenery #najblizsze-mecze/#ostatnie-mecze-lista
   jako div-y, pigułki .mecz-widoki (aktywna = granat, aria-pressed).

   1.32.2 — PLANSZA NIE WYSTAJE NA NISKICH OKNACH (kontynuacja
   zgłoszenia 10.11: „gra jak największa w oknie, ale nie wystawała
   poza ekran”). Weryfikacja v1.32.0 po wdrożeniu (7 widoków,
   verify_v1321_rozmiary.mjs): 6/7 OK, ale telefon w POZIOMIE
   (926×428) — scena z min-height:20rem (320px) + nagłówek (69px) +
   pasek (64px) + stopka (72px) + padding (20px) = 545px > 428px
   viewportu → strona przewijana, dolne ~25px planszy i cała stopka
   pod zakładką. Naprawa (css/style.css, gra bez zmian):
   - podłoga wysokości sceny adaptacyjna: min-height:
     min(20rem, calc(100dvh - 15rem)) — na niskich oknach nie
     więcej niż zostaje po chrome; na normalnych min() wybiera
     20rem (zero zmian); fallback bez dvh = 20rem (status quo);
   - @media (max-height: 30rem): stopka kompaktowa znika — plansza
     dostaje ~4.5rem więcej (telefon w poziomie: kort ~489×275
     zamiast ~392×220); atrybucja/wersja wracają w pionie;
   - :fullscreen i .fs-fake bez zmian (min-height:0 i tak wygrywa).
   Skutek: cała strona (nagłówek+pasek+plansza[+stopka]) mieści się
   w każdym oknie bez przewijania; kort maksymalny w tej scenie.

   1.32.1 — WATCHDOG NOWEJ WERSJI STRONY TAKŻE NA gra.html (zgłoszenie
   właściciela 10.11: „na stronie nie wyskoczył komunikat o tym, że
   pojawiła się nowa wersja strony. dlaczego?”). Diagnoza — trzy
   przyczyny: (1) toast celowo NIE pokazuje się po odświeżeniu karty
   po deployu — gość ma już nowy kod (cisza zamierzona od v1.28.4;
   aktualna wersja widać w stopce); (2) NA gra.html wersja strony
   była sprawdzana TYLKO przy wejściu (pokazWersje) — karta
   zostawiona otwarta nigdy się nie dowiadywała o deploju (na
   index.html app.js sprawdza okresowo w sprawdzDane, 1-10 min, i
   po powrocie do karty); (3) CDN github.io trzyma wersja.json do
   10 min (max-age=600) i IGNORUJE parametry ?x= (test 09.11:
   unikalne parametry → ten sam HIT z Age) — toast na otwartej
   karcie potrafi się pojawić dopiero ~10-20 min po deployu; to
   ograniczenie CDN dotyczy tak samo app.js (bez cache-bustu).
   Naprawa (2): cwykajNowaWersjeStrony() — w tym samym takcie 90 s
   co watchdog wersji GRY + natychmiast po powrocie do karty; toast
   raz na wersję (stronaToastWersja — kolejny deploy znów da toast),
   stopka aktualizowana przy okazji, toast z wejścia zapisany
   (bez dubla po 90 s), przy kolizji z toastem GRY podniesiony
   wyżej (lustrzanie do zglosNowaGre). Uchwyt
   window._ktsSprawdzWersjeStrony — testy/debug (konwencja
   _ktsSprawdzDane z app.js). Punkty (1) i (3) zostają zamierzone.

   1.32.0 — PLANSZA JAK NAJWIĘKSZA W OKNIE (zgłoszenie właściciela
   10.11: „gra na podstronie jest za wąska — ma być jak największa
   w oknie zależnie od rozdzielczości, ale nie wystawać poza ekran”).
   Root cause (pomiar żywy, pomiar_v1320.mjs): ramka gry siedziała na
   INTRINSYCZNYCH 150 px wysokości — .gra-scena iframe {height:100%}
   nie rozwiązywało się, bo łańcuch wysokości body(min-height:100vh,
   auto) → .gra-main(flex) → .gra-planszownik(flex) → .gra-scena(flex,
   height:auto) nie daje OKREŚLONEJ wysokości dla procentów dzieci;
   kort w ramce dopasowywał się do 150 px → 160×90 na środku wielkiej
   ciemnej sceny (stąd wrażenie „za wąska”). W :fullscreen i .fs-fake
   działało — tam wysokość sceny jest sztywna (100dvh/fixed), więc
   procent się rozwiązywał.
   Naprawa (css/style.css, całość po stronie strony — gra bez zmian):
   - .gra-scena { position:relative } + .gra-scena iframe
     { position:absolute; inset:0 } — wypełnienie sceny BEZ procentów,
     działa w każdym trybie (okno / :fullscreen / .fs-fake);
   - max-width sceny 68.75rem → 72rem — równe krawędzie z .gra-pasek/
     .container (pasek nad planszą i plansza w jednej linii) + większy
     kort na szerokich ekranach.
   Skutek: kort adaptacyjny gry (374–500 cykli, 4:3…16:9 — v0.3.0)
   wypełnia scenę w całości w każdym oknie — scena zajmuje całą
   przestrzeń między nagłówkiem, paskiem i stopką (elastyczny flex,
   audyt VLM — stopka zawsze na ekranie), a gra sama maksymalizuje
   kort w tej scenie: „jak największa w oknie, nie wystaje poza
   ekran” bez ani jednego mediazapytania po naszej stronie.

   1.31.0 — PEŁNY EKRAN NA iPHONE (zgłoszenie właściciela 08.11:
   „na iPhone nie działa przycisk pełny ekran — gra się ładuje, ale
   nie powiększa się do pełnego ekranu”). Root cause: iPhone Safari
   NIE MA element-owego Fullscreen API (Element.requestFullscreen
   nie istnieje — tylko <video> ma webkitEnterFullscreen; iPad i
   desktop Safari mają webkitRequestFullscreen). Klik w ⛶ rzucał
   TypeError zgaszony w catch — plansza zostawała w oknie.
   Naprawa (całość po stronie strony — gra nie potrzebuje zmian):
   - wykrycie API: requestFullscreen LUB webkitRequestFullscreen
     (starsze Safari iPad/desktop) → prawdziwy fullscreen + etykieta
     synchronizowana zdarzeniem fullscreenchange/webkitfullscreenchange;
   - brak API (iPhone) → PSEUDO-FULLSCREEN: .gra-scena staje się
     position:fixed na 100dvh (z-index 45: nad nagłówkiem 40, pod
     toastem 50 i modalem 60), body blokuje przewijanie, pływający
     „✕” (safe-area-aware, prawy górny róg — nad nagłówkiem gry,
     z dala od przycisków w stopce gry) wraca do widoku strony.
     Gra w ramce sama dopasowuje kort (ResizeObserver po jej stronie).
   Wyjście: ten sam przycisk (etykieta „⛶ Zwykły widok”), „✕”, Esc
   (gdzie jest klawisz), zamknięcie gry (zamknijGre sprząta oba
     tryby — bez tego body zostawałoby zablokowane).

   1.30.2 — WATCHDOG NOWEJ WERSJI GRY (właściciel 07.11: „gra musi
   wchodzić zawsze w najnowszej wersji”). Wejście na gra.html i tak
   zawsze pobiera najnowszą (SHA-pinned z API GitHuba — natychmiast,
   CDN pominięty); watchdog łapie drugi scenariusz: gość SIEDZI na
   podstronie (kilka kolejek), a mirror dostaje nowszą wersję gry —
   bez tego zobaczyłby ją dopiero przy kolejnym wejściu. Porównanie:
   gra/version.json (mirror; CDN github.io trzyma do 10 min, parametry
   ?x= ignorowane — test 07.11) vs graWersja (pong:version od żywej
   gry). Nowsza w mirrorze = toast „Dostępna nowa wersja gry (vX.Y.Z)”
   z przyciskiem „Odśwież grę” (pełne pobranie SHA-pinned — jak
   przycisk nad planszą). Co 90 s + przy powrocie na kartę; bez API
   GitHuba (limit 60/h). Toast jeden na wersję gry, nie nachodzi na
   toast wersji strony (offset przy kolizji).

   1.30.1 — BCACHE: reset wyjscieWToku na pageshow (scenariusz E2E:
   galeria → gra → EXIT → back → FORWARD (przywrócenie z bfcache) →
   drugi EXIT — bez resetu handler milczał (wyjscieWToku=true z
   poprzedniego wyjścia), gra po 600 ms robiła replace(ENTRY||„/”), co
   przy pustym ENTRY (wejście wprost) lądowało na github.com; z resetem
   drugi EXIT działa normalnie przez protokół ACK).

   1.30.0 — OFICJALNY PROTOKÓŁ EXIT=BACK (RUNDA 2 dialogu z Allanem,
   gra v0.3.8 commit 7e67cab; zgodność P1–P4 potwierdzona w
   tmjwk/pong docs/dialog_ze_strona.md). Strona realizuje checklist
   Allanа w całości:
   - P1/P4 — ACK: po pong:exit wysyłamy natychmiast {type:
     'pong:exit-ack'} → gra gasi własny zapłon samonaprawy
     (clearTimeout) i nie rusza top; wyjście w 100% po stronie strony:
     history.back() (jest historia) albo panel „Gra zakończona”
     (brak). Koniec czasówek 250/450 ms z v1.29.9 przy grach >= 0.3.8;
   - P2 — set-back: po ogłoszeniu pong:version wysyłamy grze
     {type:'pong:set-back', back:<pełny URL strony wejścia>}
     (document.referrer gra.html; brak referrera = nie wysyłamy nic —
     wyjście przejmuje ACK). Gra >= 0.3.8 nadpisuje nim ENTRY — cel
     samonaprawy (gdyby ACK jednak nie doszedł) trafia we właściwy
     adres, nie w „/” = 404;
   - wersjonowanie: graWersja z pong:version; protokolExit() >= 0.3.8
     decyduje o ścieżce. Starsze gry — obrona czasówkami z v1.29.9
     bez zmian (wsteczna zgodność potwierdzona przez Allanа).
   E2E po wdrożeniu: pełny zapis rundy komunikatów (version →
   set-back → exit → exit-ack) + oba scenariusze wyjścia + replay.

   Wersja strony: konwencja jak na innych podstronach (WERSJA_KODU
   + toast o nowszej wersji; pełna historia w js/app.js). Od 1.29.0
   js/gra.js DOŁĄCZA do zestawu plików podnoszonych przy KAŻDYM
   deployu (reguła z v1.28.4). */
"use strict";

/* ===== konfiguracja ===== */
const GRA_REPO = "tmjwk/kts-gliwice-working-repo-public"; /* mirror gry */
const GRA_API = "https://api.github.com/repos/" + GRA_REPO;
const GRA_RAW = "https://raw.githubusercontent.com/" + GRA_REPO;
const GRA_KATALOG = "gra";
/* kandydackie pliki wejściowe mirroru (po kolei; dziś: game/pong.html
   z repo gry ląduje w mirrorze jako gra/pong.html) */
const GRA_PLIKI = ["pong.html", "index.html", "game/pong.html"];

/* ===== wersja strony (konwencja v1.28.4) ===== */
const WERSJA_KODU = "1.34.0";

const $ = (sel) => document.querySelector(sel);

/** Czy wersja „a” jest STRICT nowsza od „b” (numerycznie)? Jak app.js. */
function nowszaWersja(a, b) {
  if (!a || !b || a === b) return false;
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Toast o nowszej wersji — jak w galeria.js (styl .toast-danych). */
function zglosNowaWersje(wersja) {
  const el = document.createElement("div");
  el.className = "toast-danych toast-danych--wersja";
  el.setAttribute("role", "status");
  /* 1.32.1: oba toasty fixed bottom — przy kolizji z toastem wersji
     GRY podnieś ten wyżej (lustrzane do zglosNowaGre) */
  if (document.querySelector(".toast-danych--gra")) el.style.bottom = "5.5rem";
  const tekst = document.createElement("span");
  tekst.className = "toast-tekst";
  tekst.textContent = `Dostępna nowa wersja strony (v${wersja})`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-accent btn-sm toast-btn";
  btn.textContent = "Odśwież stronę";
  el.append(tekst, btn);
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".toast-btn")) el.remove();
  });
  btn.addEventListener("click", async () => {
    const adresy = [location.href,
      ...[...document.scripts].map((s) => s.src),
      ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)]
      .filter(Boolean);
    await Promise.allSettled(adresy.map((u) => fetch(u, { cache: "reload" })));
    location.reload();
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("widoczny"));
  setTimeout(() => {
    el.classList.remove("widoczny");
    setTimeout(() => el.remove(), 400);
  }, 20_000);
}

async function pokazWersje() {
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return;
    const w = await res.json();
    if (w?.wersja) {
      $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
      if (!document.hidden && nowszaWersja(w.wersja, WERSJA_KODU)) {
        stronaToastWersja = String(w.wersja);   /* 1.32.1: toast z wejścia zapisany — watchdog nie dubluje */
        zglosNowaWersje(w.wersja);
      }
    }
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
}

/* ===== 1.32.1: watchdog nowej wersji STRONY ==============================
   Do v1.32.0 wersja strony była tu sprawdzana TYLKO przy wejściu
   (pokazWersje wyżej) — karta zostawiona otwarta na gra.html nigdy
   nie dowiadywała się o deploju. Teraz lustrzanie do watchdogu
   wersji GRY (niżej): co 90 s + natychmiast po powrocie do karty.
   CDN github.io trzyma wersja.json do 10 min (max-age=600) i
   ignoruje parametry ?x= — realne opóźnienie toastu na otwartej
   karcie: do ~10 min (wygaśnięcie CDN) + takt 90 s; app.js ma to
   samo ograniczenie. Cicho przy błędzie sieci — następna próba
   za 90 s. */
let stronaToastWersja = "";   /* wersja strony, o której toast już poszedł */

async function cwykajNowaWersjeStrony() {
  if (document.hidden) return;                     /* karta w tle = później */
  if (document.querySelector(".toast-danych--wersja:not(.toast-danych--gra)")) return; /* już wisi */
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return;
    const w = await res.json();
    if (!w?.wersja) return;
    const stopka = $("#wersja-strony");
    if (stopka) stopka.textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
    if (String(w.wersja) === stronaToastWersja) return;  /* już zgłoszone */
    if (!nowszaWersja(w.wersja, WERSJA_KODU)) return;    /* nie nowsza */
    stronaToastWersja = String(w.wersja);
    zglosNowaWersje(w.wersja);
  } catch (e) { /* cicho */ }
}

/* ===== 1.30.2: watchdog nowej wersji gry ===== */

/** Toast „dostępna nowa wersja gry” — wzór zglosNowaWersje() wyżej.
 *  Przycisk = pełne pobranie SHA-pinned (zaladujGre — dokładnie to
 *  samo, co „↻ Odśwież grę” nad planszą), bez przeładowania karty. */
function zglosNowaGre(wersja) {
  if (document.querySelector(".toast-danych--gra")) return;
  const el = document.createElement("div");
  el.className = "toast-danych toast-danych--wersja toast-danych--gra";
  el.setAttribute("role", "status");
  /* oba toasty są fixed bottom — przy kolizji podnieś ten wyżej */
  if (document.querySelector(".toast-danych:not(.toast-danych--gra)")) {
    el.style.bottom = "5.5rem";
  }
  const tekst = document.createElement("span");
  tekst.className = "toast-tekst";
  tekst.textContent = `Dostępna nowa wersja gry (v${wersja})`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-accent btn-sm toast-btn";
  btn.textContent = "Odśwież grę";
  el.append(tekst, btn);
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".toast-btn")) el.remove();
  });
  btn.addEventListener("click", () => {
    el.remove();
    zaladujGre(); /* nowy SHA z API → nowy dokument w tej samej ramce */
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("widoczny"));
  setTimeout(() => {
    el.classList.remove("widoczny");
    setTimeout(() => el.remove(), 400);
  }, 20_000);
}

/** 1.30.2: czy w mirrorze jest nowsza wersja niż gra, która AKURAT
 *  działa w ramce? Źródło: gra/version.json (statyczny plik mirroru —
 *  bez limitu API; CDN github.io do ~10 min wstecz) vs graWersja
 *  (ogłoszenie pong:version od żywej gry — jedno źródło prawdy).
 *  Cicho przy błędzie sieci — kolejna próba za 90 s. */
async function cwykajNowaGre() {
  if (document.hidden) return;                    /* karta w tle = później */
  if (document.querySelector(".toast-danych--gra")) return; /* już wisi */
  if (!graWersja) return;           /* gra jeszcze nic nie ogłosiła */
  try {
    const res = await fetch("gra/version.json", { cache: "no-cache" });
    if (!res.ok) return;
    const w = await res.json();
    if (!w?.version) return;
    if (String(w.version) === graToastWersja) return; /* już zgłoszone */
    if (!nowszaWersja(w.version, graWersja)) return;  /* nie nowsza */
    graToastWersja = String(w.version);
    zglosNowaGre(w.version);
  } catch (e) { /* cicho */ }
}

/* ===== pobieranie gry ===== */

/** SHA ostatniego commita w katalogu mirroru (publiczne repo, CORS *,
 *  bez tokenu; limit 60/h/IP → przy przekroczeniu wraca null). */
async function najnowszyShaGra() {
  const res = await fetch(`${GRA_API}/commits?path=${GRA_KATALOG}&per_page=1`,
                          { cache: "no-store" });
  if (!res.ok) return null;
  const dane = await res.json();
  return Array.isArray(dane) && dane[0]?.sha ? dane[0].sha : null;
}

/** Katalog pliku wejściowego ("game/pong.html" → "game/"), bez "/" na końcu. */
function katalogPliku(plik) {
  const i = plik.lastIndexOf("/");
  return i === -1 ? "" : plik.slice(0, i);
}

/** Pobierz grę: najpierw z SHA ostatniego mirroru (adres niezmienny per
 *  wersja = cache CDN nieszkodliwy), potem fallback na gałęzie. */
async function pobierzGre() {
  const problemy = [];
  let sha = null;
  try {
    sha = await najnowszyShaGra();
  } catch (e) {
    problemy.push(`API GitHub: ${e.message || e}`);
  }
  const refy = [...(sha ? [sha] : []), "main", "master"];
  for (const ref of refy) {
    for (const plik of GRA_PLIKI) {
      const katalog = katalogPliku(plik);
      const url = `${GRA_RAW}/${ref}/${GRA_KATALOG}/${plik}`;
      try {
        const res = await fetch(url, { cache: "no-store" });
        const refKrotki = ref === sha ? sha.slice(0, 7) : ref;
        if (res.status === 404) { problemy.push(`brak ${GRA_KATALOG}/${plik} (${refKrotki})`); continue; }
        if (!res.ok) { problemy.push(`HTTP ${res.status} (${GRA_KATALOG}/${plik}, ${refKrotki})`); continue; }
        const html = await res.text();
        if (!html || html.length < 20) { problemy.push(`pusty plik ${GRA_KATALOG}/${plik}`); continue; }
        const baza = `${GRA_RAW}/${ref}/${GRA_KATALOG}${katalog ? "/" + katalog : ""}/`;
        return { html, baza, refKrotki };
      } catch (e) {
        problemy.push(`sieć (${plik}): ${e.message || e}`);
      }
    }
  }
  return { blad: problemy.join(" · ") || "nieznany błąd" };
}

/** Przepisz ścieżki względne na absolutne adresy raw i zbuduj dokument
 *  do srcdoc. <base> gwarantuje, że też zasoby dociągane później przez
 *  JS gry (fetch/img) trafiają do właściwej wersji mirroru. */
function zbudujDokument(html, baza) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  let base = doc.querySelector("base");
  if (!base) {
    base = doc.createElement("base");
    (doc.head || doc.documentElement).prepend(base);
  }
  base.setAttribute("href", baza);

  const absolut = (v) => new URL(String(v).replace(/^\/+/, ""), baza).href;

  doc.querySelectorAll("[src]").forEach((el) => {
    const v = el.getAttribute("src");
    if (wzgledna(v)) el.setAttribute("src", absolut(v));
  });

  doc.querySelectorAll("[href]").forEach((el) => {
    const v = el.getAttribute("href");
    if (!wzgledna(v)) return;
    if (el.tagName === "USE") return; /* sprite’y #fragment zostają */
    el.setAttribute("href", absolut(v));
  });

  doc.querySelectorAll("[poster]").forEach((el) => {
    const v = el.getAttribute("poster");
    if (wzgledna(v)) el.setAttribute("poster", absolut(v));
  });

  doc.querySelectorAll("[srcset]").forEach((el) => {
    const v = el.getAttribute("srcset");
    if (!v) return;
    const nowe = v.split(",").map((czesc) => {
      const czesci = czesc.trim().split(/\s+/);
      if (!czesci[0] || !wzgledna(czesci[0])) return czesc.trim();
      czesci[0] = absolut(czesci[0]);
      return czesci.join(" ");
    }).join(", ");
    el.setAttribute("srcset", nowe);
  });

  doc.querySelectorAll("style").forEach((st) => {
    st.textContent = st.textContent.replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
      (caly, cudzyslow, url) => (wzgledna(url) ? `url("${absolut(url)}")` : caly)
    );
  });

  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

/** Adres względny do przepisania? (http/data/blob/mailto/tel//# → nie) */
function wzgledna(v) {
  return !!v && !/^\s*(https?:|data:|blob:|mailto:|tel:|\/\/|#)/i.test(v);
}

/* v1.29.8: EXIT w trakcie (podwójne pong:exit nie cofa dwa razy) */
let wyjscieWToku = false;

/* v1.30.0: protokół z grą v0.3.8 (RUNDA 2) — stan per załadowanie gry */
let graWersja = "";          /* z pong:version; "" = nieznana (stara gra) */
let setBackWyslany = false;  /* jeden pong:set-back na załadowanie gry */
let graToastWersja = "";     /* 1.30.2: wersja gry, o której toast już poszedł */

/** Gra zna protokół ACK/set-back? (>= 0.3.8; RUNDA 2, checklist v1.30.0) */
function protokolExit() {
  return graWersja === "0.3.8" || nowszaWersja(graWersja, "0.3.8");
}

/** Pełny cykl: status → pobierz → zbuduj → wstrzyknij (albo fallback). */
async function zaladujGre() {
  const status = $("#gra-status");
  const scena = $("#gra-scena");
  const blad = $("#gra-blad");
  const zamknieta = $("#gra-zamknieta");
  const ramka = $("#gra-ramka");
  status.hidden = false;
  scena.hidden = true;
  blad.hidden = true;
  if (zamknieta) zamknieta.hidden = true;
  wyjscieWToku = false; /* nowa rozgrywka = EXIT znów działa */
  graWersja = "";         /* v1.30.0: fresh załadowanie = protokół od zera */
  setBackWyslany = false; /* (pong:version przyjdzie z nowego dokumentu) */

  const wynik = await pobierzGre();
  if (wynik.blad) {
    status.hidden = true;
    $("#gra-blad-szczegol").textContent = wynik.blad;
    blad.hidden = false;
    return;
  }

  const dokument = zbudujDokument(wynik.html, wynik.baza);
  ramka.addEventListener("load", function raz() {
    ramka.removeEventListener("load", raz);
    status.hidden = true;
    scena.hidden = false;
    try { ramka.contentWindow.focus(); } catch (e) { /* nie przeszkadza */ }
  });
  ramka.srcdoc = dokument;
}

/* ===== 1.31.0: pełny ekran także na iPhonie ==============================
   iPhone Safari nie ma element-FS API — patrz opis wersji u góry.
   FS_NATIVE = prawdziwy fullscreen (desktop/Android/iPad, także starsze
   Safari z webkit-prefixem); bez API → pseudo-fullscreen klasą .fs-fake
   (position:fixed 100dvh — patrz css/style.css). Stan trzyma fsFake;
   etykietę przycisku synchronizuje ustawPrzyciskFs (zdarzenia zmiany FS
   LUB wejście/wyjście pseudo-FS). */
const FS_SONDA = document.createElement("div");
const FS_NATIVE = typeof FS_SONDA.requestFullscreen === "function"
               || typeof FS_SONDA.webkitRequestFullscreen === "function";
let fsFake = false;

function fsAktywny() {
  return fsFake || !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function ustawPrzyciskFs() {
  const btn = $("#gra-fullscreen");
  if (!btn) return;
  const on = fsAktywny();
  btn.textContent = on ? "⛶ Zwykły widok" : "⛶ Pełny ekran";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.title = on
    ? (fsFake ? "Wróć do widoku strony" : "Wróć do okna (Esc)")
    : "Rozszerz planszę na cały ekran" + (FS_NATIVE ? " (Esc = powrót)" : "");
}

function fsWlacz() {
  const scena = $("#gra-scena");
  if (!scena) return;
  if (FS_NATIVE) {
    /* prawdziwy FS; obietnica-webkit (stare Safari) zwraca undefined */
    try {
      const p = scena.requestFullscreen
        ? scena.requestFullscreen()
        : scena.webkitRequestFullscreen();
      if (p && p.catch) p.catch(() => { /* odmowa (gest/prawo) — zostajemy w oknie */ });
    } catch (e) { /* przeglądarka odmówiła — gra działa dalej w oknie */ }
    return;
  }
  /* iPhone: pseudo-fullscreen */
  fsFake = true;
  scena.classList.add("fs-fake");
  document.body.classList.add("gra-fs-fake");
  ustawPrzyciskFs();
}

function fsWylacz() {
  const scena = $("#gra-scena");
  if (fsFake) {
    fsFake = false;
    if (scena) scena.classList.remove("fs-fake");
    document.body.classList.remove("gra-fs-fake");
    ustawPrzyciskFs();
  }
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    try {
      const p = document.exitFullscreen
        ? document.exitFullscreen()
        : document.webkitExitFullscreen();
      if (p && p.catch) p.catch(() => { /* odmowa — nie blokuje niczego */ });
    } catch (e) { /* odmówił */ }
  }
}

/** v1.29.6: {type:'pong:exit'} — gracz zamknął grę w jej menu (EXIT/Esc).
 *  Gra prosi stronę o zamknięcie ramki (protokół z gra/version.json):
 *  chowamy planszę i pokazujemy panel „Gra zakończona” — pusta ramka
 *  nie zostaje na ekranie. „Zagraj ponownie” = pełne pobranie świeżej
 *  wersji (ta sama droga co wejście na stronę). */
function zamknijGre() {
  const scena = $("#gra-scena");
  const zamknieta = $("#gra-zamknieta");
  fsWylacz();   /* 1.31.0: pseudo-FS i prawdziwy FS schodzą ZAWSZE — body nie może zostać zablokowane */
  if (!scena || scena.hidden) return;
  scena.hidden = true;
  if (zamknieta) zamknieta.hidden = false;
}

/* ===== start ===== */
async function start() {
  /* tryb dzień/noc — jak app.js/galeria.js */
  const ikona = () => {
    const noc = document.documentElement.getAttribute("data-theme") === "night";
    const przycisk = $("#theme-toggle");
    przycisk.textContent = noc ? "☀️" : "🌙";
  };
  ikona();
  $("#theme-toggle").addEventListener("click", () => {
    const terazNoc = document.documentElement.getAttribute("data-theme") === "night";
    const nowy = terazNoc ? "day" : "night";
    document.documentElement.setAttribute("data-theme", nowy);
    try { localStorage.setItem("kts-theme", nowy); } catch (e) { /* tryb prywatny */ }
    ikona();
  });

  /* kontrolki nad planszą — „Odśwież grę” od 1.29.2 DZIAŁA NAPRAWDĘ:
     nowe pytanie o SHA → nowy adres → cache CDN ominięty */
  $("#gra-odswiez").addEventListener("click", () => zaladujGre());
  /* 1.31.0: pełny ekran wszędzie — prawdziwy FS (desktop/Android/iPad)
     albo pseudo-FS (iPhone bez element-FS API). Etykieta i title trzymają
     stan; Esc działa tam, gdzie jest klawisz, na iPhone wyjście = ✕/przycisk. */
  $("#gra-fullscreen").addEventListener("click", () => {
    if (fsAktywny()) fsWylacz(); else fsWlacz();
  });
  const fsExit = $("#gra-fs-exit");
  if (fsExit) fsExit.addEventListener("click", fsWylacz);
  document.addEventListener("fullscreenchange", ustawPrzyciskFs);
  document.addEventListener("webkitfullscreenchange", ustawPrzyciskFs);
  ustawPrzyciskFs();   /* od razu poprawny title (iPhone: bez podpowiedzi Esc) */
  $("#gra-probij").addEventListener("click", () => zaladujGre());
  const zagraj = $("#gra-zagraj");
  if (zagraj) zagraj.addEventListener("click", () => zaladujGre());

  /* v1.29.6/8: protokół postMessage z grą (v0.3.2+; patrz gra/version.json).
     Przyjmujemy komunikaty WYŁĄCZNIE z naszej ramki z grą (e.source),
     treści trafiają tylko do textContent/title — nic nie wstrzykujemy. */
  window.addEventListener("message", (e) => {
    const ramka = $("#gra-ramka");
    if (!ramka || e.source !== ramka.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "pong:version") {
      /* v1.30.0: wersję pokazuje tylko gra na korcie — ale korzystamy
         z ogłoszenia do P2: przekazujemy grze cel BACK (pełny URL
         strony wejścia), którego srcdoc nie daje dostarczyć (?back=
         i referrer nie docierają — patrz RUNDA 1/2, F1). Gra >= 0.3.8
         ma listener pong:set-back zawieszony PRZED ogłoszeniem wersji
         — bez wyścigu. Brak strony wejścia (referrer pusty — wejście
         wprost na gra.html) = NIE wysyłamy nic: ENTRY zostaje puste,
         a wyjście przejmujemy ACK-iem (P1/P4). Jeden set-back na
         załadowanie gry (idempotentny po stronie gry, ale bez spamu). */
      if (d.version) graWersja = String(d.version);
      if (protokolExit() && !setBackWyslany) {
        let wejscie = "";
        try { wejscie = document.referrer || ""; } catch (e) { /* prywatny tryb */ }
        if (/^https?:/i.test(wejscie)) {
          try {
            ramka.contentWindow.postMessage(
              { type: "pong:set-back", back: wejscie }, "*");
            setBackWyslany = true;
          } catch (e) { /* ramka właśnie padła? wyjście i tak mamy */ }
        }
      }
      return;
    }
    if (d.type === "pong:exit") {
      if (wyjscieWToku) return;
      /* v1.30.0 + gra v0.3.8: OFICJALNY PROTOKÓŁ (RUNDA 2, P1–P4 —
         zgodność potwierdzona przez Allanа). ACK {type:'pong:exit-ack'}
         natychmiast po ping → gra gasi własny zapłon samonaprawy
         (clearTimeout) i NIE rusza top — wyjście w 100% po stronie
         strony (P4): jest historia → history.back() (bfcache przywraca
         stronę wejścia co do piksela); brak → panel „Gra zakończona”.
         Bez wyścigu z 600 ms gry — samonaprawa po ACK nie istnieje.
         Panel po 700 ms zostaje fallbackiem na dziwne stany historii. */
      if (protokolExit()) {
        wyjscieWToku = true;
        try { ramka.contentWindow.postMessage({ type: "pong:exit-ack" }, "*"); }
        catch (e) { /* gra i tak zamarza w bfcache */ }
        let poszlo = false;
        const pagehide = () => { poszlo = true; };
        window.addEventListener("pagehide", pagehide, { once: true });
        if (history.length > 1) {
          try { history.back(); } catch (e) { /* panel */ }
          setTimeout(() => { if (!poszlo) zamknijGre(); }, 700);
        } else {
          zamknijGre();   /* nie ma dokąd — panel, gość zostaje w klubie */
        }
        return;
      }
      /* v1.29.9: starsze gry (< 0.3.8, np. z cache) — obrona czasówkami
         (bez zmian). Gra v0.3.5+ po 600 ms bez reakcji robi
         top.location.replace(ENTRY || "/") — w naszym srcdoc
         ENTRY="" (referrer pusty, ?back= nie dociera), więc „/” =
         404/github.com (E2E 07.11: nowa karta + EXIT = wyrzut z
         klubu). Kolejność:
         - pagehide = ktoś już cofnął (back przeglądarki/graczy) — nic
           nie robimy, gra zamarza w bfcache;
         - 250 ms: jest historia → history.back() (bfcache przywraca
           poprzednią stronę co do piksela); brak historii → bierzemy
           stery: rozbrajamy grę (srcdoc="" — timer samonaprawy ginie
           razem ze starym dokumentem) + panel „Gra zakończona”;
         - 450 ms: back() jeszcze nie zdążył (wolne urządzenie) →
           rozbrajamy grę, żeby jej 600 ms nie ubiegło nas z „/”;
           back() dokańcza się we własnym tempie;
         - 700 ms: nadal nic → panel (fallback).
         Rozbrojenie nie psuje „Zagraj ponownie” — ramka zostaje w
         DOM, zaladujGre ustawia srcdoc od nowa. */
      wyjscieWToku = true;
      let poszlo = false;
      const pagehide = () => { poszlo = true; };
      window.addEventListener("pagehide", pagehide, { once: true });
      const rozbrojGre = () => {
        try { if (ramka) ramka.srcdoc = ""; } catch (e) { /* już złapana */ }
      };
      setTimeout(() => {
        if (poszlo) return;
        if (history.length > 1) {
          try { history.back(); } catch (e) { /* zostaje panel */ }
        } else {
          poszlo = true;    /* nie ma dokąd cofać — przejmujemy stery */
          rozbrojGre();     /* timer samonaprawy umiera z dokumentem */
          zamknijGre();     /* panel „Gra zakończona” zamiast github.com */
        }
      }, 250);
      setTimeout(() => { if (!poszlo) rozbrojGre(); }, 450);
      setTimeout(() => { if (!poszlo) zamknijGre(); }, 700);
    }
  });

  /* v1.30.1: bfcache — po powrocie FORWARD na tę stronę (gra zamarznięta
     w bfcache po naszym back()) wyjscieWToku zostało true z poprzedniego
     EXIT → drugi EXIT w przywróconej stronie zostałby zignorowany przez
     handler i gra strzeliłaby samonaprawą (600 ms, przy pustym referrerze
     nawet „/” = github.com). Gra resetuje swoje exiting na pageshow
     (v0.3.5) — my lustrzanie resetujemy wyjscieWToku. pageshow odpala
     się też przy zwykłym załadowaniu (then wyjscieWToku i tak false). */
  window.addEventListener("pageshow", () => { wyjscieWToku = false; });

  /* 1.30.2: watchdog nowej wersji gry — patrz cwykajNowaGre()
     (wejście i tak pobiera najnowszą; to łapie „siedzę i gram, a
     mirror właśnie dostał nowszą wersję”). */
  setInterval(() => { cwykajNowaGre(); cwykajNowaWersjeStrony(); }, 90_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { cwykajNowaGre(); cwykajNowaWersjeStrony(); }
  });
  window._ktsSprawdzWersjeStrony = cwykajNowaWersjeStrony; /* testy/debug — konwencja _ktsSprawdzDane z app.js */

  pokazWersje();
  zaladujGre();
}

document.addEventListener("DOMContentLoaded", start);
