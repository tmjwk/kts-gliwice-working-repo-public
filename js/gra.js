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
const WERSJA_KODU = "1.30.0";

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
      if (!document.hidden && nowszaWersja(w.wersja, WERSJA_KODU)) zglosNowaWersje(w.wersja);
    }
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
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

/** v1.29.6: {type:'pong:exit'} — gracz zamknął grę w jej menu (EXIT/Esc).
 *  Gra prosi stronę o zamknięcie ramki (protokół z gra/version.json):
 *  chowamy planszę i pokazujemy panel „Gra zakończona” — pusta ramka
 *  nie zostaje na ekranie. „Zagraj ponownie” = pełne pobranie świeżej
 *  wersji (ta sama droga co wejście na stronę). */
function zamknijGre() {
  const scena = $("#gra-scena");
  const zamknieta = $("#gra-zamknieta");
  if (!scena || scena.hidden) return;
  scena.hidden = true;
  if (zamknieta) zamknieta.hidden = false;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* odmówił */ }
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
  $("#gra-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("#gra-scena").requestFullscreen();
    } catch (e) { /* przeglądarka odmówiła — gra działa dalej w oknie */ }
  });
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

  pokazWersje();
  zaladujGre();
}

document.addEventListener("DOMContentLoaded", start);
