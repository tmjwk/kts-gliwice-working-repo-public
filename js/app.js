/* ============================================================
   KTS Gliwice — strona statyczna: render danych ligowych z dane.json
   (wersja js warsztatu site-skeleton, przystosowana do statyki)
   ============================================================ */
"use strict";

/* ===== zawsze startuj od baneru (hero) — v1.3.2 =====
   Trzy scenariusze, w których v1.3.1 przegrywało z przeglądarką:
   (a) scrollTo(0,0) przy html{scroll-behavior:smooth} jedzie ANIMACJĄ —
       późne przywrócenie pozycji (po doładowaniu obrazków) wygrywało
       ze skokiem → teraz behavior:"instant" (bez animacji),
   (b) przywrócenie karty z pamięci (bfcache: „wstecz", ponowne otwarcie
       karty, przywrócenie sesji) NIE odpala skryptu od nowa → pageshow
       z persisted=true,
   (c) klik w menu zostawiał w adresie #sekcja — przywrócenie sesji
       z kotwicą lądowało na sekcji → kotwica uszanowana TYLKO gdy
       wejście przyszło z naszej domeny (linki z galeria.html). */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const _naszReferrer = (() => {
  try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
  catch { return false; }
})();

const _naGoreNatychmiast = () => {
  if (location.hash && _naszReferrer) return;   // galeria → sekcja: uszanuj kotwicę
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }); // skok, nie animacja
  } catch {
    const html = document.documentElement, org = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";         // starsze przeglądarki bez "instant"
    window.scrollTo(0, 0);
    html.style.scrollBehavior = org;
  }
};

// kotwicę z adresu zdejmujemy NATYCHMIAST (jeszcze w trakcie parsowania,
// zanim Chrome zaplanuje asynchroniczne przewinięcie do fragmentu) —
// dotyczy tylko wejść spoza naszej domeny (z galerii kotwica zostaje):
if (location.hash && !_naszReferrer) {
  history.replaceState(null, "", location.pathname + location.search);
}
_naGoreNatychmiast();
window.addEventListener("load", () => {
  _naGoreNatychmiast();
  // siatka bezpieczeństwa: Chrome potrafi przewinąć do kotwicy późno
  // i to ANIMOWANIE (płynnie) — dostrzelamy dwoma skokami:
  setTimeout(_naGoreNatychmiast, 200);
  setTimeout(_naGoreNatychmiast, 600);
});
window.addEventListener("pageshow", (e) => { if (e.persisted) _naGoreNatychmiast(); });

/* ===== pomocnicze ===== */
const $ = (sel) => document.querySelector(sel);

/** ISO "2026-09-20" → "20.09.2026" */
function formatujDate(iso) {
  const [r, m, d] = iso.split("-");
  return `${d}.${m}.${r}`;
}

/** ISO znacznik czasu → "27.09, 20:20" */
function formatujZnacznik(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}, ${hh}:${mi}`;
}

/** Znormalizowana nazwa naszego zespołu do dopasowania strony meczu. */
function normNazwa(nazwa) {
  return nazwa.replace(" · amatorzy", "").trim();
}

/** Czy strona meczu (gospodarz/gość) to nasz zespół? Odporna na KTS V vs KTS VI. */
function stronaNasza(strona, naszZespol) {
  const n = normNazwa(naszZespol);
  return strona === n || strona.startsWith(n + " ") || strona.startsWith(n + "·");
}

/** Nasze drużyny w meczu (ŚZTS: zespoly[], PZTS: zespol). */
function druzynyMeczu(m) {
  return m.zespoly ? m.zespoly : m.zespol ? [m.zespol] : [];
}

/** Status meczu z perspektywy naszych drużyn: "W" | "P" | "R" | null (derby).
 *  1.28.0: dopasowanie strony meczu po nazwie karty ALBO jej nazwie u źródła
 *  (z.wiersz — PZTS: karta „KTS Gliwice I” gra w meczu jako „KTS Gliwice”),
 *  tym samym mechanizmem co piłeczki formy (statusMeczuKarty, v1.22.0).
 *  Naprawia lukę: mecze 1. ligi PZTS nie dostawały W/P/R na listach
 *  ani (od v1.28.0) na pasku wyników — spójny system WSZĘDZE. */
function statusMeczu(m) {
  const nasze = druzynyMeczu(m);
  if (nasze.length !== 1) return null; // derby lub brak — neutralnie
  const kandydaci = [...nasze];
  const karta = (SWIEZOSC.dane?.zespoly ?? []).find((x) => x.nazwa === nasze[0]);
  if (karta?.wiersz) kandydaci.push(karta.wiersz);
  // 1.28.2: obrona przed wynikiem null (nowy terminarz z mostu może
  // przynieść wiersze bez wyniku, zanim zagramy) — wzorzec z statusMeczuKarty
  const [a, b] = String(m.wynik ?? "").split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const pasuje = (strona) => kandydaci.some((n) => stronaNasza(strona, n));
  let my, rywal;
  if (pasuje(m.gospodarz) && !pasuje(m.gosc)) {
    my = a; rywal = b;
  } else if (pasuje(m.gosc) && !pasuje(m.gospodarz)) {
    my = b; rywal = a;
  } else {
    return null; // niejednoznaczne — neutralnie
  }
  if (my > rywal) return "W";
  if (my < rywal) return "P";
  return "R";
}

/** Dzisiejsza data ISO w czasie LOKALNYM gościa (toISOString dałoby UTC —
 *  między 00:00 a 02:00 polskiego wieczora goniłoby datę o dobę wstecz). */
function dzisISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/* 1.20.0: porównywarki meczów — data, potem godzina (mecze z tego
   samego dnia nie mogą latać w losowej kolejności); wspólne dla
   dialogu drużyny, listy najbliższych i grup ostatnich meczów. */
const poDacie = (a, b) => (a.dataMeczu < b.dataMeczu ? -1 : a.dataMeczu > b.dataMeczu ? 1 : 0);
const poGodzinie = (a, b) => (a.godzina ?? "").localeCompare(b.godzina ?? "");
const odNajstarszego = (a, b) => poDacie(a, b) || poGodzinie(a, b);
const odNajnowszego = (a, b) => odNajstarszego(b, a);   // najświeższe na górze

/** Etykieta dnia dla człowieka: „dziś" / „jutro" / „21.09.2026". */
function etykietaDnia(iso) {
  const dzis = dzisISO();
  if (iso === dzis) return "dziś";
  const j = new Date();
  j.setDate(j.getDate() + 1);
  const jutro = `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, "0")}-${String(j.getDate()).padStart(2, "0")}`;
  if (iso === jutro) return "jutro";
  return formatujDate(iso);
}

/** 1.23.0: data+godzina do podpowiedzi piłeczki formy (zgłoszenie
 *  właściciela 02.11: „na szybko wiadomo kiedy był/będzie mecz”):
 *  „dziś” / „jutro” / „pt 09.10.2026” (+ „· g. 18:00” gdy znana).
 *  Daty zastępcze źródeł („2026-00-00”) → „termin nieznany” — obronnie,
 *  bo meczeZDanych() i tak je odsiewa. */
const DNI_TYGODNIA = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
function opisDatyFormy(m) {
  const iso = String(m.dataMeczu ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso)) return "termin nieznany";
  const etykieta = etykietaDnia(iso);   // „dziś” / „jutro” / „dd.mm.rrrr”
  const czesc = etykieta === "dziś" || etykieta === "jutro"
    ? etykieta
    : `${DNI_TYGODNIA[new Date(iso + "T12:00:00").getDay()]} ${etykieta}`;
  return m.godzina ? `${czesc} · g. ${m.godzina}` : czesc;
}

/** Czy mecz już się zaczął, a wyniku wciąż brak w źródle?
 *  Godziny ligowe są warszawskie; u gościa z innej strefy granica
 *  przesunie się o kilka godzin — akceptowalne dla komunikatu na żywo. */
function meczRozpoczety(m) {
  if (m.rozegrany) return false;
  const dzis = dzisISO();
  if (m.dataMeczu < dzis) return true; // wczoraj lub dawniej — mecz na pewno się skończył
  if (m.dataMeczu === dzis && m.godzina) {
    const [g, mi] = m.godzina.split(":").map(Number);
    const n = new Date();
    return n.getHours() > g || (n.getHours() === g && n.getMinutes() >= mi);
  }
  return false;
}

/** Następny mecz dla drużyny (tekst „dziś · Górnik Bobowa"). */
function nastepnyDla(mecze, nazwa) {
  const wToku = mecze
    .filter((m) => meczRozpoczety(m) && druzynyMeczu(m).includes(nazwa))
    .sort((x, y) => (x.dataMeczu < y.dataMeczu ? 1 : -1))[0];
  if (wToku) return `${formatujDate(wToku.dataMeczu)} · wynik w drodze`;
  const przyszle = mecze
    .filter((m) => !m.rozegrany && !meczRozpoczety(m) && druzynyMeczu(m).includes(nazwa))
    .sort((x, y) => (x.dataMeczu < y.dataMeczu ? -1 : 1));
  const m = przyszle[0];
  if (!m) return "—";
  // Rywal = strona meczu, która NIE jest nami; nazwa karty bywa fragmentem
  // nazwy ligowej („KA Krokus VII" ⊂ „KTS KA Krokus VII Gliwice"), więc
  // dopasowujemy po zawieraniu, a nie przedrostku.
  const nasi = druzynyMeczu(m);
  const myName = nasi.find((n) => n === nazwa) ?? nasi[0] ?? nazwa;
  const rywal = [m.gospodarz, m.gosc].find((s) => !s.includes(myName)) ?? m.gosc;
  return `${etykietaDnia(m.dataMeczu)} · ${rywal}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Mecze ze wszystkich źródeł (ŚZTS + PZTS) z odsianiem dat zastępczych
 *  (ŚZTS wstawia „2026-00-00” dla meczów bez terminu). Używana przy
 *  starcie i przy odświeżaniu w tle (1.7.0) — jedno miejsce prawdy. */
function meczeZDanych(dane) {
  return [...(dane.meczeSzts ?? []), ...(dane.meczePzts ?? [])]
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(m.dataMeczu ?? ""));
}

/* ===== render ===== */
/** Pasek meczowy pokazuje CAŁE dni meczowe, nie pojedyncze mecze:
 *  1) ostatnie wyniki — wszystkie z najświeższego dnia, w którym padł wynik,
 *  2) wyniki w drodze — mecze już rozegrane, których źródło jeszcze nie wpisało,
 *  3) najbliższe mecze — wszystkie z najbliższego dnia z terminarza.
 *  Czytelność: KAŻDY mecz w osobnym wierszu (flex-wrap w ramach jednego meczu),
 *  wynik w „pillce" — wizualna granica między meczami; nazwy escapowane. */
function wierszMeczuPaska(html, klasy = "") {
  return `<span class="matchbar-match${klasy ? ` ${klasy}` : ""}">${html}</span>`;
}

/* Skróty lig w wierszach paska (właściciel zatwierdził 31.10):
   poziom ligi + rodzaj; grupy pomijamy (w danych jedna grupa
   na poziom, więc nie rozróżniają drużyn). */
const SKROTY_LIG = {
  "1. Liga Mężczyzn · gr. południowa": "1 LM",
  "2. Liga Mężczyzn": "2 LM",
  "2. Śląska Liga Amatorów": "2 ŚLA",
  "3. Liga Mężczyzn · gr. II": "3 LM",
  "4. Liga Mężczyzn · gr. IV": "4 LM",
};

/** Skrót ligi dla paska. Nieznana liga (np. zmiana nazwy u źródła):
 *  heurystyka z nazwy, a gdy się nie da — pusty string
 *  (wiersz bez etykiety; nic się nie wysypuje). */
const skrotLigi = (liga) => {
  if (!liga) return "";
  if (Object.prototype.hasOwnProperty.call(SKROTY_LIG, liga)) {
    return SKROTY_LIG[liga];
  }
  let m = liga.match(/^(\d+)\.\s*Liga Mężczyzn\b/);
  if (m) return `${m[1]} LM`;
  m = liga.match(/^(\d+)\.\s*Śląska Liga Amatorów\b/);
  if (m) return `${m[1]} ŚLA`;
  m = liga.match(/^(\d+)\.\s*Liga Kobiet\b/);
  if (m) return `${m[1]} LK`;
  return "";
};

const etykietaLigi = (liga) => {
  const s = skrotLigi(liga);
  return s ? `<span class="matchbar-liga">${esc(s)}</span>` : "";
};

function renderPasekMeczu(mecze) {
  /* 1.28.0: JEDNOLITY SYSTEM OZNACZEŃ WYNIKÓW (właściciel 05.11:
     „co do paska wyników zgadzam z rekomendacją… generalnie wszędzie
     chciałbym widzieć jednolity spójny system”) — pigułka ostatniego
     wyniku kolorowana wg statusu z perspektywy naszych drużyn:
     W zielona · R amber · P czerwona (odcienie pod granat, patrz CSS);
     derby (obie nasze drużyny) i mecz bez statusu zostają neutralne. */
  const rozegrane = mecze.filter((m) => m.rozegrany)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? 1 : -1));
  const wDrodze = mecze.filter(meczRozpoczety)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? 1 : -1));
  const przyszle = mecze.filter((m) => !m.rozegrany && !meczRozpoczety(m))
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? -1 : 1));

  const elO = $("#ostatni-wynik");
  const elD = $("#wyniki-w-drodze");
  const elN = $("#najblizszy-mecz");
  const strefaD = $("#strefa-droga");

  const o = rozegrane[0];
  if (o) {
    const zDnia = rozegrane.filter((m) => m.dataMeczu === o.dataMeczu)
      .sort((a, b) => (a.godzina ?? "").localeCompare(b.godzina ?? ""));
    const etykietaO = $("#etykieta-ostatni");
    if (etykietaO) {
      etykietaO.textContent = (zDnia.length > 1 ? "Ostatnie wyniki" : "Ostatni wynik")
        + ` · ${formatujDate(o.dataMeczu)}`;
    }
    elO.innerHTML = zDnia.map((m) => {
      const st = statusMeczu(m);
      return wierszMeczuPaska(
        etykietaLigi(m.liga)
        + `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
        + `<span class="matchbar-score t-nums${st ? ` matchbar-score--${st}` : ""}">${esc(m.wynik)}</span>`
        + `<span class="matchbar-team">${esc(m.gosc)}</span>`,
      );
    }).join("");
  } else {
    elO.textContent = "Wyniki pojawią się po pierwszej synchronizacji";
  }

  if (elD && strefaD) {
    if (wDrodze.length > 0) {
      const etykietaD = strefaD.querySelector(".matchbar-label");
      if (etykietaD) etykietaD.textContent = `Wynik w drodze · ${etykietaDnia(wDrodze[0].dataMeczu)}`;
      elD.innerHTML = wDrodze.map((m) => wierszMeczuPaska(
        etykietaLigi(m.liga)
        + `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
        + `<span class="matchbar-sep">—</span>`
        + `<span class="matchbar-team">${esc(m.gosc)}</span>`,
        "matchbar-match--pending",
      )).join("");
      strefaD.hidden = false;
    } else {
      strefaD.hidden = true;
    }
  }

  const n = przyszle[0];
  if (n) {
    const zDnia = przyszle.filter((m) => m.dataMeczu === n.dataMeczu)
      .sort((a, b) => (a.godzina ?? "").localeCompare(b.godzina ?? ""));
    const etykietaN = $("#etykieta-najblizszy");
    if (etykietaN) {
      etykietaN.textContent = (zDnia.length > 1 ? "Najbliższe mecze" : "Najbliższy mecz")
        + ` · ${etykietaDnia(n.dataMeczu)}`;
    }
    elN.innerHTML = zDnia.map((m) => wierszMeczuPaska(
      etykietaLigi(m.liga)
      + (m.godzina ? `<span class="matchbar-hour t-nums">g. ${esc(m.godzina)}</span>` : "")
      + `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
      + `<span class="matchbar-sep">—</span>`
      + `<span class="matchbar-team">${esc(m.gosc)}</span>`,
    )).join("");
  } else {
    elN.textContent = "Najbliższy mecz: wg terminarza";
  }
}

/* ===== 1.22.0: FORMA SEZONU NA KARCIE DRUŻYNY (pomysł właściciela 02.11)
   Każda karta dostaje pasek piłeczek — po jednej za KAŻDY mecz drużyny
   w terminarzu (liczba płynie z danych syncu, zero hardcodowania):
   nierozegrany = pusty obrys, wygrany = zielona, przegrany = czerwona,
   remis = żółto-pomarańczowa (remisy realnie występują — np. 5:5 w
   1. lidze PZTS). Kolejność chronologiczna wg kolejek; najechanie
   na piłeczkę podpowiada wynik. */

/** Status meczu z perspektywy JEDNEJ drużyny (karta): W | P | R | null.
 *  Dopasowanie strony meczu po nazwie karty ALBO dokładnej nazwie u źródła
 *  (z.wiersz — PZTS: „KTS Gliwice I” na karcie to „KTS Gliwice” w meczu);
 *  odporna na „KTS II” ⊂ „KTS II Gliwice”, ale NIE „KTS III…”. */
function statusMeczuKarty(m, z) {
  if (!m.wynik) return null;
  const [a, b] = String(m.wynik).split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const kandydaci = [z.wiersz, z.nazwa].filter(Boolean).map(normNazwa);
  const pasuje = (strona) => kandydaci.some((n) =>
    strona === n || strona.startsWith(n + " ") || strona.startsWith(n + "·"));
  const gospodarzNasz = pasuje(m.gospodarz || "");
  const goscNasz = pasuje(m.gosc || "");
  let my, rywal;
  if (gospodarzNasz && !goscNasz) { my = a; rywal = b; }
  else if (goscNasz && !gospodarzNasz) { my = b; rywal = a; }
  else return null; // niejednoznaczne (np. obie strony „KTS Gliwice…”) — neutralnie
  return my > rywal ? "W" : my < rywal ? "P" : "R";
}

/** Polska odmiana liczebnika: 1 zwycięstwo / 2 zwycięstwa / 5 zwycięstw. */
function odmiana(n, [j, mm, w]) {
  n = Number(n) || 0;
  if (n === 1) return `1 ${j}`;
  const r10 = n % 10, r100 = n % 100;
  return `${n} ${r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) ? mm : w}`;
}

/** Klucz chronologiczny meczu dla paska formy: prawdziwa data →
 *  timestamp; daty zastępcze źródeł („2026-00-00” bez terminu) → na
 *  koniec paska. 1.22.1: pasek czyta się CHRONOLOGICZNIE (wg dat),
 *  nie wg numerów kolejek — mecz przełożony przez ligę (np. kolejka 4
 *  rozgrywana dopiero 04.11, choć 5–7 już rozegrane) nie zostawia
 *  „dziury” pośród rozegranych piłeczek; tooltip nadal podpowiada
 *  numer kolejki. */
function kluczCzasuFormy(m) {
  const t = Date.parse(String(m.dataMeczu ?? ""));
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** 1.24.0: DUCHY REWANŻY (§9.3/§9.4, decyzja właściciela 03.11: „wdroż,
 *  z uwzględnieniem, że dane dotyczą tylko pierwszej połowy sezonu”).
 *  Kalendarz 2. rundy nie istnieje jeszcze w źródłach, ale pary rewanżowe
 *  są znane — to lustrzane odbicia meczów rundy 1 (wzorzec ŚZTS rok do
 *  roku, Task 174). Metoda lustra = ZERO założeń o formacie ligi:
 *  dorysowujemy dokładnie tyle duchów, ile meczów nie ma jeszcze
 *  odwrotnego odpowiednika w danych — mianownik „rozegrane/sezon”
 *  płynie z danych (30/30/26/18), nic nie jest zaszyte. Duch znika sam
 *  (guard), gdy tylko sync przyniesie prawdziwy rewanż — w jego miejscu
 *  pojawia się zwykła piłeczka z datą.
 *  Zakres 1.24.0: tylko karty ŚZTS (rewanże udokumentowane komunikatami
 *  2025/26); 1. LM PZTS czekała na publikację kalendarza — format
 *  niezweryfikowany (§9.3), więc ta karta liczyła terminarz ze źródła.
 *  Zakres 1.26.0 (właściciel 03.11: „zrób to samo z pierwszą ligą"):
 *  format PZTS zweryfikowany u źródła — sezon 2024/25 gr. południowa
 *  = każdy z każdym 2× (18 meczów, np. k1 ↔ k18), a w 2026/27 opublikowane
 *  dokładnie 45 meczów = PEŁNA runda 1 (każda para raz, każda drużyna
 *  9 meczów, zero powtórzeń — analiza par, etykiety „kolejka” u źródła
 *  bywają przesunięte). Duchy działają więc dla ŚZTS i PZTS tak samo. */
function duchyRewanz(mecze, z) {
  const tryb = String(z.tryb || "");
  if (!tryb.startsWith("ŚZTS") && !tryb.startsWith("PZTS")) return [];
  const moje = (mecze ?? []).filter((m) => druzynyMeczu(m).includes(z.nazwa));
  const pary = new Set(moje.map((m) => `${m.gospodarz}|${m.gosc}`));
  const duchy = [];
  for (const m of moje) {
    // rewanż już w terminarzu źródła → duch zbędny (guard metody lustra)
    if (pary.has(`${m.gosc}|${m.gospodarz}`)) continue;
    duchy.push({
      duch: true,
      gospodarz: m.gosc,           // rewanż = odwrócone role gospodarza
      gosc: m.gospodarz,
      liga: m.liga,
      kolejka: m.kolejka ?? null,  // wyłącznie do kolejności duchów między sobą (kolejność rundy 1)
      dataMeczu: null,             // → „termin nieznany”, kluczCzasuFormy = ∞ (koniec paska)
      godzina: null,
      wynik: null,
      rozegrany: false,
    });
  }
  return duchy;
}

/** Pasek formy (HTML) dla karty drużyny z; mecze = pełny terminarz
 *  i wyniki (ŚZTS + PZTS) z dane.json. 1.24.0: do meczów z kalendarza
 *  dorysowujemy duchy rewanży (duchyRewanz) — pasek pokazuje KSZTAŁT
 *  CAŁEGO SEZONU już dziś, a piłeczki „do rozegrania z datą” i duchy
 *  uzupełniają się same, gdy źródła opublikują kalendarz i wyniki. */

/** 1.26.0: fraza o nieopublikowanym kalendarzu w dymku/aria ducha —
 *  per źródło. ŚZTS: „kalendarz 2. rundy nieopublikowany” (ustalenie
 *  z v1.24.0 — bez zmian). PZTS: „kalendarz rewanży nieopublikowany”
 *  — pzts.pl numeruje kolejki 1–18 i pokazuje już wiersze „kolejka 10”
 *  (dalekie końcówki rundy 1 — analiza par §9.10), więc mówimy
 *  o REWANŻACH, nie o numerze rundy: zero sprzeczności z tym, co
 *  użytkownik widzi u źródła. */
const frazaKalendarzaDucha = (z) =>
  String(z.tryb || "").startsWith("PZTS")
    ? "kalendarz rewanży nieopublikowany"
    : "kalendarz 2. rundy nieopublikowany";

function htmlFormy(mecze, z) {
  const realne = (mecze ?? [])
    .filter((m) => druzynyMeczu(m).includes(z.nazwa));
  const moje = [...realne, ...duchyRewanz(mecze, z)]
    .sort((x, y) => kluczCzasuFormy(x) - kluczCzasuFormy(y)
      || ((x.kolejka ?? 999) - (y.kolejka ?? 999)));
  if (moje.length === 0) return ""; // brak terminarza — bez paska
  const ileDuchow = moje.length - realne.length;
  const bilans = { W: 0, P: 0, R: 0 };
  const pilki = moje.map((m) => {
    const st = m.rozegrany ? statusMeczuKarty(m, z) : null;
    if (st) bilans[st]++;
    const klasa = m.duch ? "forma-pilka--duch"
      : st === "W" ? "forma-pilka--wygrana"
      : st === "P" ? "forma-pilka--przegrana"
      : st === "R" ? "forma-pilka--remis"
      : "forma-pilka--przyszla";   // nierozegrany albo wynik niedostępny
    const slowo = st === "W" ? "zwycięstwo" : st === "P" ? "porażka" : st === "R" ? "remis" : null;
    // 1.23.0: podpowiedź z DATĄ meczu (zgłoszenie właściciela 02.11).
    // 1.28.2: DUCH = PLACEHOLDER, nie projekcja pary (właściciel 05.11:
    // „pamiętaj, że nie znamy par, więc pisanie kto z kim kiedy nie ma
    // jeszcze terminarza (tabeli) jest bez sensu. może lepiej niech te
    // piłeczki formy będą po prostu jako placeholder który będzie
    // uaktualniony gdy tylko pojawi się tabela — coś jak tooltip =
    // ‹Runda rewanżowa, kolejka x, oczekiwanie na terminarz›”). Dymek
    // zachowuje 3 wiersze jak mecze, ale BEZ nazw drużyn: (1) „runda
    // rewanżowa”, (2) „rewanż meczu z X. kolejki” — X = kolejka meczu
    // rundy 1, którego to rewanż (płynie z danych; to NIE numer
    // w przyszłym terminarzu, którego nie znamy i nie zgadujemy —
    // stąd 1.24.0 celowo nie numerował), (3) „oczekiwanie na terminarz”.
    // Pełne zdanie o nieopublikowanym kalendarzu zostaje w aria paska
    // (czytniki ekranu) i legendzie — dymek ma być krótki.
    // Natywny title= nie działa na dotyku — treść dymka jedzie w data-tip
    // (esc() przy zapisie; odczyt przez dataset zwraca oryginalny HTML),
    // a rysuje go silnik podpiezForme(): hover na desktopie, tap/scrub
    // na telefonie.
    const status = m.duch ? "oczekiwanie na terminarz"
      : m.rozegrany && slowo
        ? `kolejka ${m.kolejka ?? "—"} · ${slowo}`
        : `kolejka ${m.kolejka ?? "—"} · ${m.rozegrany ? "wynik niedostępny" : "do rozegrania"}`;
    const dataTxt = m.duch
      ? "runda rewanżowa"
      : opisDatyFormy(m);
    // 1.28.1: WYNIK w dymku w kolorze statusu (jak .match-score--W/R/P
    // na listach — właściciel: „chyba nie wdrożyłeś konsystentnego
    // systemu oznaczania wyników do tooltips”); duch i mecz bez
    // statusu zostają neutralne (białe).
    const wynikTip = m.rozegrany && m.wynik && m.wynik !== "-:-"
      ? `<b class="t-nums forma-tip-wynik${st ? ` forma-tip-wynik--${st}` : ""}">${esc(m.wynik)}</b>` : "—";
    // 1.28.2: duch — wiersz meczu bez PAR (projekcja lustra w dymku
    // myliła się z oficjalnym terminarzem); zostaje kotwica „którego
    // meczu rundy 1 to rewanż” (patrz komentarz wyżej).
    const meczHtml = m.duch
      ? esc(m.kolejka != null ? `rewanż meczu z ${m.kolejka}. kolejki` : "rewanż meczu rundy 1")
      : `${esc(m.gospodarz)} ${wynikTip} ${esc(m.gosc)}`;
    const tip = `<span class="forma-tip-data">${esc(dataTxt)}</span>`
      + `<span class="forma-tip-mecz">${meczHtml}</span>`
      + `<span class="forma-tip-status${st ? ` forma-tip-status--${st}` : m.duch ? " forma-tip-status--duch" : ""}">${esc(status)}</span>`;
    return `<span class="forma-pilka ${klasa}" data-tip="${esc(tip)}" aria-hidden="true"></span>`;
  });   // 1.25.0: tablica bez join — cięcie na wiersze (rundy) niżej
  const rozegrane = bilans.W + bilans.P + bilans.R;
  const czesci = [];
  if (bilans.W) czesci.push(odmiana(bilans.W, ["zwycięstwo", "zwycięstwa", "zwycięstw"]));
  if (bilans.R) czesci.push(odmiana(bilans.R, ["remis", "remisy", "remisów"]));
  if (bilans.P) czesci.push(odmiana(bilans.P, ["porażka", "porażki", "porażek"]));
  // 1.24.0: mianownik = CAŁY sezon (umowa z właścicielem, Task 176):
  // mecze z kalendarza + duchy rewanży. Różnicę realne/duchy opisuje
  // aria (czytniki ekranu) + legenda + same szare piłeczki (wzrok).
  const duchyAria = ileDuchow
    ? `; ${odmiana(ileDuchow, ["rewanż", "rewanże", "rewanży"])} bez terminu — ${frazaKalendarzaDucha(z)}`
    : "";
  // 1.25.0: KAŻDA POŁOWA SEZONU W SWOIM WIERSZU (właściciel 03.11: „mówiąc
  // dwa wiersze miałem na myśli każda połowa sezonu / runda jest wyświetlana
  // w swoim wierszu"). Cięcie po połowie CHRONOLOGICZNEJ paska (pasek czyta
  // się wg dat od 1.22.1): wiersz 1 = runda 1, wiersz 2 = rewanże/runda 2
  // (dziś głównie duchy — po publikacji kalendarza zwykłe piłeczki z datą).
  // Cięcie liczone jest wyłącznie chronologią, więc mecz przełożony przez ligę na
  // termin 2. połowy trafia do wiersza 2 razem z rewanżami — wiersze są
  // PÓŁOWAMI SEZONU wg dat, nie sztywną etykietą rundy (ta nie może skłamać).
  // n ≤ 10 = jeden wiersz (hipotetyczne karty z krótkim terminarzem;
  // 1.26.0: wszystkie 8 kart ma ≥ 18 meczów sezonu = 2 wiersze).
  // Rozmiar celu płynie per karta:
  // --na-wiersz + CSS gwarantują równe 2 wiersze na telefonie 360–430 px
  // (pomiar Task 179: pasek 292/262 px).
  const n = moje.length;
  const dwaWiersze = n > 10;
  const ciecie = dwaWiersze ? Math.ceil(n / 2) : n;
  const licznikHtml = `<span class="team-forma-licznik t-nums">${rozegrane}/${n}</span>`;
  const wierszeHtml = dwaWiersze
    ? `<span class="team-forma-wiersz">${pilki.slice(0, ciecie).join("")}</span>`
      + `<span class="team-forma-wiersz team-forma-wiersz--ostatni">${pilki.slice(ciecie).join("")}${licznikHtml}</span>`
    : `<span class="team-forma-wiersz team-forma-wiersz--ostatni">${pilki.join("")}${licznikHtml}</span>`;
  return `
      <div class="team-forma" role="img" style="--na-wiersz:${ciecie}"
           aria-label="Sezon w piłeczkach: ${rozegrane} z ${n} meczów sezonu rozegranych${czesci.length ? " — " + czesci.join(", ") : ""}${duchyAria}">
        ${wierszeHtml}
      </div>`;
}

/** 1.24.0: LEGENDA PIŁECZEK (zasada jasności z Taska 177 — użytkownik
 *  musi wiedzieć CO WIDZI): jeden wiersz nad kartami drużyn. Pozycja
 *  „rewanż — termin nieznany” pojawia się tylko dopóki w danych są
 *  duchy (kalendarz rewanży nieopublikowany); po publikacji zniknie
 *  sama. Element jest staly (jednorazowo wstawiony przed siatką kart),
 *  treść odświeżana przy każdym przerysowaniu.
 *  1.26.0: nawias uogólniony „kalendarz rewanży…” (było „2. rundy”) —
 *  legenda jest WSPÓLNA dla kart ŚZTS i PZTS; dla PZTS „2. runda”
 *  kolidowałaby z widocznymi u źródła wierszami „kolejka 10” (patrz
 *  frazaKalendarzaDucha), a rewanże to dokładnie to, czego brakuje
 *  w obu ligach.
 *  1.26.9 (właściciel 04.11: „«rewanż — termin nieznany (kalendarz
 *  rewanży nieopublikowany)» zamień na «rewanż — termin nieznany””):
 *  NAWIAS ZNIKA z legendy — wyjaśnienie żyje w dymku piłeczki
 *  (frazaKalendarzaDucha) i w etykiecie aria, więc czytelnik nie
 *  traci informacji; legenda mówi tylko CO oznacza szara piłeczka. */
function legendaFormy(mecze, zespoly) {
  const duchy = zespoly.reduce((n, z) => n + duchyRewanz(mecze, z).length, 0);
  let el = $("#forma-legenda");
  if (!el) {
    el = document.createElement("p");
    el.id = "forma-legenda";
    el.className = "forma-legenda";
    $("#karty-druzyn").insertAdjacentElement("beforebegin", el);
  }
  el.innerHTML = `<span><i class="fl fl--w"></i>wygrana</span>`
    + `<span><i class="fl fl--p"></i>porażka</span>`
    + `<span><i class="fl fl--r"></i>remis</span>`
    + `<span><i class="fl fl--plan"></i>zaplanowany mecz</span>`
    + (duchy > 0
      ? `<span><i class="fl fl--duch"></i>rewanż — termin nieznany</span>`
      : "")
    // 1.25.0: odkrywalność scrubbera — widoczne tylko na dotyku (CSS)
    + `<span class="forma-legenda-scrub">‹ przesuń palcem po pasku — przejrzysz sezon mecz po meczu ›</span>`;
  el.hidden = false;
}

function renderKartyDruzyn(dane, mecze) {
  ukryjFormTip();   // 1.23.0: piłeczki lecą do przerysowania — dymek nie może wisieć w powietrzu
  /* 1.26.4 (właściciel 04.11): zero plakietki PZTS/ŚZTS (liga mówi
     sama za siebie) i JEDEN wiersz na dole kafelka. 1.28.3 (właściciel
     05.11: źródła wymienione WYŁĄCZNIE w stopce strony): link do tabeli
     u źródła zostaje (funkcja), ale bez słowa „Źródło” w treści —
     „Pełna tabela ↗” z lewej, „Szczegóły ↗” z prawej. */
  const wrap = $("#karty-druzyn");
  wrap.innerHTML = dane.zespoly.map((z) => `
    <article class="card team-card team-klik" data-slug="${esc(slugZespolu(z.nazwa))}" tabindex="0" role="button"
             aria-label="Otwórz szczegóły drużyny: ${esc(z.nazwa)}">
      <h3 class="t-h4">${esc(z.nazwa)}</h3>
      <p class="t-small">${esc(z.liga)}</p>
      <dl>
        <div class="row"><dt>Stan</dt><dd class="t-nums">${esc(z.stan ?? "—")}</dd></div>
        <div class="row"><dt>Najbliższy</dt><dd class="t-nums">${esc(nastepnyDla(mecze, z.nazwa))}</dd></div>
      </dl>
      ${htmlFormy(mecze, z)}
      <div class="team-stopka">
        ${z.url ? `<a class="source-link" href="${esc(z.url)}" target="_blank" rel="noreferrer">Pełna&nbsp;tabela&nbsp;↗</a>` : ""}
        <span class="team-wiecej">Szczegóły&nbsp;↗</span>
      </div>
    </article>`).join("");
  legendaFormy(mecze, dane.zespoly);   // 1.24.0: klucz kolorów nad kartami (CO WIDZĘ)
  wskazScrubber();   // 1.25.0: chip „przesuń palcem” pod pierwszym paskiem (raz na wizytę)
}

/* ===== 1.23.0: PODPOWIEDZI PIŁECZEK — DOTYK I DATA (właściciel 02.11)
   „nie wiem jak używać tooltipów na telefonie — chyba się nie da?”
   Miało rację: natywny title= NIE ISTNIEJE na urządzeniach dotykowych.
   Teraz jeden wspólny dymek (position: fixed, doklejany do body):
   - desktop: najechanie myszą pokazuje, opuszczenie chowa
     (zdarzenia pointerowe z pointerType „mouse” — syntetyczne
     „mouseover” po tapnięciu na telefonie są ignorowane);
   - dotyk: tapnięcie piłeczki PRZYPINA dymek (klik w piłeczkę jest
     wyłączony z otwierania dialogu drużyny), tap gdziekolwiek — także
     w sam dymek — scroll albo Escape odpina.
   Piłeczki mają powiększony NIEWIDOCZALNY obszar trafienia (::after w
   CSS, rozmiar równy odstęwowi między piłeczkami — strefy się nie
   nakładają), ale celowo NIE wchodzą do tabulatora: pełne dane
   meczów (z datami) są w dialogu drużyny, więc klawiatura/ czytnik
   ekranu nic nie traci — pasek pozostaje ozdobnym „role=img”.
   ===== 1.24.0: SCRUBBER (§9.4, właściciel 03.11 — „celowanie palcem
   jest trudne na tak małym ekranie”): przesuwanie palca po pasku
   wskazuje piłeczkę najbliższą palcowi, dymek podmieniał treść na żywo
   i stał w miejscu (kotwica = pasek), aktywna piłeczka z pierścieniem.
   Tap i desktop (hover + klik) bez zmian. Zasada jasności (Task 177):
   GDZIE JESTEM = pierścień, CO WIDZĘ = dymek, CO TO ZNACZY =
   legenda kolorów nad kartami, KONTEKST = scroll strony żyje (pan-y).
   ===== 1.25.0 (właściciel 03.11): dymek ZAKOTWICZONY W PIŁECZCE
   („strzałeczka nad piłeczką, a nad tym tooltip — aby użytkownik
   wiedział, który mecz wyświetla”) — ramka podąża za aktywną piłeczką
   (płynnie), ogon-strzałeczka dotyka piłeczki.
   Odkrywalność gestu: tor pod piłeczkami + podpowiedź w legendzie +
   jednorazowy chip „przesuń palcem” (SCRUBHINT) + wibracja zmiany.
   ===== 1.25.1 (właściciel 03.11, po obejrzeniu v1.25.0): dymek ZAWSZE
   NAD piłeczką — także w 2. wierszu („wyświetlaj go u góry tak jak dla
   górnego wiersza piłeczek formy”), a końcówka strzałeczki POMARAŃCZOWA
   z uzgodnionej palety (--kts-accent) dla lepszej widoczności. Fallback
   „pod” zostaje tylko na wypadek braku miejsca nad (pasek przy samej
   górnej krawędzi ekranu). */

const FORMTIP = { el: null, pilka: null, przypiete: false };

function formaTipEl() {
  if (!FORMTIP.el) {
    FORMTIP.el = document.createElement("div");
    FORMTIP.el.className = "forma-tip";
    FORMTIP.el.setAttribute("aria-hidden", "true");
    // tap w PRZYPIĘTY dymek = zamknij (zdarzenie nie może „przebić się”
    // do karty i otworzyć dialogu)
    FORMTIP.el.addEventListener("click", (e) => {
      e.stopPropagation();
      ukryjFormTip();
    });
    document.body.appendChild(FORMTIP.el);
  }
  return FORMTIP.el;
}

/** 1.25.0→1.25.1: pozycja dymka — kotwica = AKTYWNA PIŁECZKA (właściciel
 *  03.11: „chodzi mi o to, aby strzałeczka była nad piłeczką, a nad tym
 *  tooltip — aby użytkownik wiedział, który mecz wyświetla”; po obejrzeniu
 *  v1.25.0: „tooltip dla dolnego rzędu piłeczek wyświetlasz z dołu —
 *  wyświetlaj go u góry tak jak dla górnego wiersza piłeczek formy”).
 *  Ogon-strzałeczka dotyka piłeczki, dymek stoi tuż nad nią — dla OBU
 *  wierszy paska (1.25.0 stawiał dymek 2. wiersza pod paskiem, lustrzanie;
 *  decyzja właściciela po weryfikacji wizualnej ją zdjęła). Fallback „pod”
 *  tylko gdy w viewporcie brak miejsca nad (pasek przy samej górnej
 *  krawędzi ekranu). Doczepienie do krawędzi ekranu (min. 8 px). */
function polozFormTip(tip, pilka) {
  const r = pilka.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let nad = true;                              // 1.25.1: ZAWSZE nad piłeczką
  if (r.top - th - 9 < 8) nad = false;         // brak miejsca nad → pod
  tip.classList.toggle("forma-tip--pod", !nad);
  const x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2),
    window.innerWidth - tw - 8);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(nad ? r.top - th - 9 : r.bottom + 9)}px`;
  // strzałeczka dokładnie nad środkiem piłeczki (klamra do szerokości dymka)
  const sx = Math.min(Math.max(12, r.left + r.width / 2 - x), tw - 12);
  tip.style.setProperty("--strzalka", `${Math.round(sx)}px`);
}

function pokazFormTip(pilka) {
  const tip = formaTipEl();
  // 1.24.0: pierścień aktywnej piłeczki (GDZIE JESTEM) — także przy tapnięciu
  if (FORMTIP.pilka && FORMTIP.pilka !== pilka) {
    FORMTIP.pilka.classList.remove("forma-pilka--aktywna");
  }
  FORMTIP.pilka = pilka;
  pilka.classList.add("forma-pilka--aktywna");
  tip.innerHTML = pilka.dataset.tip ?? "";
  // pomiar działa zawsze: dymek jest w layout (visibility:hidden), więc
  // offsetWidth/Height są dostępne jeszcze zanim .widoczny zacznie fade
  polozFormTip(tip, pilka);
  tip.classList.add("widoczny");
}

function ukryjFormTip() {
  if (!FORMTIP.el) return;
  FORMTIP.el.classList.remove("widoczny", "forma-tip--dotyk");
  if (FORMTIP.pilka) FORMTIP.pilka.classList.remove("forma-pilka--aktywna");
  FORMTIP.pilka = null;
  FORMTIP.przypiete = false;
}

/** 1.24.0→1.25.0: SCRUBBER — treść dymka podmieniana na żywo, a ramka
 *  PODĄŻA za aktywną piłeczką (płynnie — transition left/top w CSS).
 *  Zmiana właściciela 03.11: strzałeczka NA piłeczce zastępuje stojącą
 *  ramkę zakotwiczoną w pasku — „aby użytkownik wiedział, który mecz
 *  wyświetla” (patrz polozFormTip, kotwica = piłeczka, wspólna z tapem
 *  i hoverem). Wibracja przy zmianie piłeczki wzmacnia „przesuwam po
 *  szynie” (Android; iOS nie wspiera navigator.vibrate — cisza). */
function przewinForme(pilka) {
  const tip = formaTipEl();
  if (FORMTIP.pilka !== pilka) {
    if (FORMTIP.pilka) FORMTIP.pilka.classList.remove("forma-pilka--aktywna");
    FORMTIP.pilka = pilka;
    pilka.classList.add("forma-pilka--aktywna");   // GDZIE JESTEM
    tip.innerHTML = pilka.dataset.tip ?? "";
    if (navigator.vibrate) navigator.vibrate(8);   // „tik” szyny pod palcem
  }
  polozFormTip(tip, pilka);
  tip.classList.add("widoczny");
}

/* 1.25.0: ODKRYWALNOŚĆ SCRUBBERA (właściciel 03.11: „rzeczywiście w wersji
   mobilnej nie ma żadnej info wizualnej, że można scrube po tym polu.
   jak byś to uwidocznił?”). Trzy sygnały, od subtelnego do jawnego:
   (1) TOR — linia za piłeczkami każdego wiersza (CSS): rząd piłeczek
       wygląda jak suwak/oś czasu, a nie statyczne kropki;
   (2) PODPOWIEDŹ w legendzie piłeczek (tylko ekran dotykowy — CSS);
   (3) CHIP „‹ przesuń palcem ›” NA SZYNIE — na rzędzie duchów (ostatnim
       wierszu) paska PIERWSZEJ KARTY Z DUCHAMI (1.26.0: KTS Gliwice I —
       1. LM PZTS; do v1.25.x była to 1. karta ŚZTS): kołysze się wzdłuż
       toru jak mini-demonstracja gestu i zasłania wyłącznie identyczne
       szare duchy („termin nieznany” — zero utraconej informacji; linki
       i wyniki nietknięte). Pojawia się RAZ NA WIZYTĘ (sessionStorage),
       znika po pierwszym dotknięciu paska albo po 9 s
       (1.26.1: +2 s — właściciel 03.11: „dodaj mu 2s życia”; kolor
       pomarańczowy w CSS — patrz .forma-scrub-hint)
       (pointer-events: none — nie blokuje gestu). Na desktopie (hover)
       nie występuje wcale.
   1.27.0 (wdrożone w 1.27.3): ŻYCIE OD ZOBACZENIA, NIE OD
       ZAŁADOWANIA (właściciel 05.11: „aktywuje się zaraz po załadowaniu
       strony, a ma tylko 9 s życia — użytkownik doskrolowuje do sekcji
       drużyn, kiedy chip już zniknął; powinien pojawiać się dopiero,
       gdy użytkownik zobaczy kafelek”). IntersectionObserver pilnuje
       PASKA (≥25% w widoku, z 10% zapasem od dołu ekranu): dopóki pasek
       jest poza ekranem, chip czeka ukryty (visibility:hidden + pauza
       kołysania), zegar 9 s STOI. Pierwsze wejście paska w ekran =
       start zegara i odsłonięcie. Przerysowania sekcji (dane na żywo)
       odtwarzają paski — chip wraca na tor, obserwator wsiada na świeży
       element; raz wystartowany deadline się NIE cofa. Przeglądarka
       bez IO (muzeum) dostaje zachowanie stare (start od razu). */
const SCRUBHINT = { el: null, timer: 0, klucz: "kts-scrub-hint-v1",
                    io: null, wystartowal: false };

function zamknijScrubHint() {
  clearTimeout(SCRUBHINT.timer);
  if (SCRUBHINT.io) { SCRUBHINT.io.disconnect(); SCRUBHINT.io = null; }
  try { sessionStorage.setItem(SCRUBHINT.klucz, "1"); } catch { /* tryb prywatny */ }
  SCRUBHINT.el?.remove();
}

/** Odsłoń chip i odpal jego 9 s życia — dokładnie RAZ (kolejne
 *  przerysowania nie cofają deadline'u, patrz 1.27.0 wyżej). */
function odpalScrubHint() {
  if (SCRUBHINT.wystartowal) return;
  SCRUBHINT.wystartowal = true;
  if (SCRUBHINT.el) {
    SCRUBHINT.el.style.visibility = "";
    SCRUBHINT.el.style.animationPlayState = "";   // kołysanie od zera
  }
  clearTimeout(SCRUBHINT.timer);
  SCRUBHINT.timer = setTimeout(zamknijScrubHint, 9000);   // 1.26.1: 7 s → 9 s (+2 s, właściciel)
}

/** Doklej chip NA SZYNĘ paska pierwszej karty z duchami (rząd duchów
 *  = ostatni wiersz; 1.26.0: pierwszą kartą z duchami jest KTS Gliwice I
 *  — 1. LM PZTS) — po każdym przerysowaniu: elementy .team-forma są
 *  odtwarzane, chip wsiada z powrotem, dopóki użytkownik dotykowego
 *  ekranu nie „zdrapie” go pierwszym gestem. Fallback: pierwszy pasek. */
function wskazScrubber() {
  if (!SCRUBHINT.el) {
    SCRUBHINT.el = document.createElement("span");
    SCRUBHINT.el.className = "forma-scrub-hint";
    SCRUBHINT.el.setAttribute("aria-hidden", "true");
    SCRUBHINT.el.textContent = "‹ przesuń palcem ›";
  }
  let widziane = false;
  try { widziane = sessionStorage.getItem(SCRUBHINT.klucz) === "1"; } catch { }
  const duch = document.querySelector(".team-forma .forma-pilka--duch");
  const forma = duch?.closest(".team-forma") ?? document.querySelector(".team-forma");
  if (widziane || !forma || !matchMedia("(pointer: coarse)").matches) {
    SCRUBHINT.el.remove();
    if (SCRUBHINT.io) { SCRUBHINT.io.disconnect(); SCRUBHINT.io = null; }
    return;
  }
  // ostatni wiersz paska: runda 2 / rewanże (dziś: duchy) — chip na torze
  const wiersze = forma.querySelectorAll(":scope > .team-forma-wiersz");
  (wiersze[wiersze.length - 1] ?? forma).appendChild(SCRUBHINT.el);
  // 1.27.0: zegar już tyka (przerysowanie w trakcie życia) — tylko
  // powrót na tor świeżego paska, deadline bez zmian
  if (SCRUBHINT.wystartowal) return;
  // dopóki pasek nie wszedł w ekran — chip ukryty, kołysanie wstrzymane
  SCRUBHINT.el.style.visibility = "hidden";
  SCRUBHINT.el.style.animationPlayState = "paused";
  if (SCRUBHINT.io) SCRUBHINT.io.disconnect();   // stary pasek przerysowany
  if (typeof IntersectionObserver === "function") {
    SCRUBHINT.io = new IntersectionObserver((wpisy) => {
      if (wpisy.some((w) => w.isIntersecting)) {
        SCRUBHINT.io.disconnect();
        SCRUBHINT.io = null;
        odpalScrubHint();
      }
    }, { threshold: 0.25, rootMargin: "0px 0px -10% 0px" });
    SCRUBHINT.io.observe(forma);
  } else {
    odpalScrubHint();   // bez IO (muzeum) — jak dotychczas: start od razu
  }
}

/* 1.24.0: stan gestu scrubu. id = pointerId aktywnego palca (multitouch:
   tylko pierwszy palec na pasku steruje); ruszyl = przekroczony próg
   ruchu poziomego; wycisz = znacznik czasu końca scrubu — klik, który
   przeglądarka wyśle po pointerup, trzeba zignorować (to echo gestu,
   nie zamiar otwarcia/zamknięcia dymka). */
const SCRUB = { id: null, pasek: null, pilki: [], rects: [], x0: 0, y0: 0, ruszyl: false, wycisz: 0 };

/** Podpięcie RAZ (kontener #karty-druzyn żyje mimo przerysowań kart). */
function podpiezForme() {
  const wrap = $("#karty-druzyn");
  if (!wrap) return;

  // desktop: hover myszą pokazuje/chowa (chyba że dymek przypiął tap)
  wrap.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || FORMTIP.przypiete) return;
    const pilka = e.target.closest(".forma-pilka");
    if (pilka && pilka !== FORMTIP.pilka) pokazFormTip(pilka);
  });
  wrap.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse" || FORMTIP.przypiete) return;
    const pilka = e.target.closest(".forma-pilka");
    if (pilka && pilka === FORMTIP.pilka && !pilka.contains(e.relatedTarget)) {
      ukryjFormTip();
    }
  });

  // 1.24.0 SCRUBBER (§9.4): przesuwanie palcem po pasku formy wskazuje
  // piłeczkę NAJBLIŻSZĄ palcowi — zero celowania. Dotyk/rysika tylko
  // (mysz działa po staremu). Dotyk ma niejawny pointer capture, więc
  // zdarzenia płyną do nas nawet, gdy palec zawędruje poza pasek.
  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || SCRUB.id !== null) return;
    const pasek = e.target.closest(".team-forma");
    if (!pasek) return;
    zamknijScrubHint();   // 1.25.0: pierwszy dotyk paska = gest odkryty
    SCRUB.id = e.pointerId;
    SCRUB.pasek = pasek;
    SCRUB.pilki = [...pasek.querySelectorAll(".forma-pilka")];
    SCRUB.x0 = e.clientX;
    SCRUB.y0 = e.clientY;
    SCRUB.ruszyl = false;
  });
  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerId !== SCRUB.id || !SCRUB.pasek) return;
    const dx = e.clientX - SCRUB.x0, dy = e.clientY - SCRUB.y0;
    if (!SCRUB.ruszyl) {
      // scrub zaczyna dopiero WYRAŹNIE poziomym ruchem; pionowy to scroll
      // strony (touch-action: pan-y w CSS — przeglądarka wtedy przejmuje
      // palec i przychodzi pointercancel, nie scrub)
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      SCRUB.ruszyl = true;
      // pozycje piłeczek zamrożone na czas gestu — pasek się nie rusza
      SCRUB.rects = SCRUB.pilki.map((p) => p.getBoundingClientRect());
    }
    // aktywna = piłeczka najbliższa palcowi (2D — pasek zawija się w wiersze)
    let best = null, bestD = Infinity;
    for (let i = 0; i < SCRUB.pilki.length; i++) {
      const r = SCRUB.rects[i];
      const px = r.left + r.width / 2 - e.clientX;
      const py = r.top + r.height / 2 - e.clientY;
      const d = px * px + py * py;
      if (d < bestD) { bestD = d; best = SCRUB.pilki[i]; }
    }
    if (best) przewinForme(best);
  });
  const koniecScrubu = (e) => {
    if (e.pointerId !== SCRUB.id) return;
    if (SCRUB.ruszyl) {
      // dymek zostaje przypięty po zdjęciu palca (jak po tapnięciu)
      FORMTIP.przypiete = true;
      FORMTIP.el?.classList.add("forma-tip--dotyk");
      SCRUB.wycisz = Date.now();   // ignoruj klik-błąd po pointerup
    }
    SCRUB.id = null;
    SCRUB.pasek = null;
    SCRUB.ruszyl = false;
  };
  wrap.addEventListener("pointerup", koniecScrubu);
  wrap.addEventListener("pointercancel", koniecScrubu);

  // dotyk (i mysz): klik/tap w piłeczkę → dymek przypięty / odepnięty
  wrap.addEventListener("click", (e) => {
    const pilka = e.target.closest(".forma-pilka");
    if (!pilka) return;
    e.stopPropagation();   // nie otwieraj dialogu drużyny (patrz podpiezKartyDruzyn)
    if (Date.now() - SCRUB.wycisz < 600) return;   // 1.24.0: echo scrubu, nie zamiar
    if (FORMTIP.przypiete && pilka === FORMTIP.pilka) {
      ukryjFormTip();
      return;
    }
    pokazFormTip(pilka);
    FORMTIP.przypiete = true;
    FORMTIP.el.classList.add("forma-tip--dotyk");   // pointer-events: auto
  });

  // odepnięcie: klik gdziekolwiek indziej, Escape, scroll/zmiana okna
  document.addEventListener("click", (e) => {
    if (!FORMTIP.el?.classList.contains("widoczny")) return;
    if (e.target.closest(".forma-pilka, .forma-tip")) return;
    ukryjFormTip();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ukryjFormTip();
  });
  window.addEventListener("scroll", ukryjFormTip, { passive: true });
  window.addEventListener("resize", ukryjFormTip, { passive: true });
}

/* ===== 1.12.0: szczegóły drużyny — dialog z zakładkami + podstrona =====
   Decyzja właściciela 31.10 (wariant C): klik w kafelek otwiera
   PODSUMOWANIE (dialog: tabela / ostatnie wyniki / najbliższe mecze,
   skład gdy sync dostarczy dane.sklady), a przycisk „Pełna strona
   drużyny” prowadzi na druzyna.html?id=… (stabilny URL do
   udostępniania). Wiązanie zespół→tabela: jawnie (z.tabela z syncu)
   albo po nazwie ligi; nasz wiersz — dokładnie albo z granicą słowa
   („KTS II” ⊂ „KTS II Gliwice”, ale NIE „KTS III…”). */

/** Slug drużyny do URL (identyczny w js/druzyna.js — jedno miejsce
 *  prawdy dla kształtu linków podstrony). */
function slugZespolu(nazwa) {
  const mapa = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  return String(nazwa).toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => mapa[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tabela ligowa drużyny: jawne wiązanie z syncu (z.tabela = klucz)
 *  albo dopasowanie nazwy ligi do nazwy tabeli (ŚZTS). */
function tabelaDlaZespolu(dane, z) {
  const tabele = dane?.tabele ?? [];
  if (z.tabela) {
    const t = tabele.find((x) => x.klucz === z.tabela);
    if (t) return t;
  }
  return tabele.find((x) => x.nazwa === z.liga) ?? null;
}

/** Nasz wiersz w tabeli — najpierw jawne wiązanie z syncu (z.wiersz =
 *  dokładna nazwa u źródła; „KTS Gliwice” w 1. lidze PZTS ≠ nazwa karty
 *  „KTS Gliwice I”), potem heurystyki (dokładnie → granica słowa:
 *  „KTS II” ⊂ „KTS II Gliwice”, ale NIE „KTS III…”). */
function wierszDlaZespolu(tabela, z) {
  if (!tabela) return null;
  if (z.wiersz) {
    const jawnie = tabela.wiersze.find((w) => w.nazwa === z.wiersz);
    if (jawnie) return jawnie;
  }
  const n = normNazwa(z.nazwa);
  const trafienie = tabela.wiersze.find((w) => w.nazwa === n);
  if (trafienie) return trafienie;
  try {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return tabela.wiersze.find((w) => re.test(w.nazwa)) ?? null;
  } catch { return null; }
}

/** Mecze jednej drużyny (ŚZTS: zespoly[], PZTS: zespol). */
function meczeDruzyny(mecze, nazwa) {
  return mecze.filter((m) => druzynyMeczu(m).includes(nazwa));
}

/** Skład drużyny z danych syncu (dane.sklady) — brak = null. */
function skladDlaZespolu(dane, z) {
  const cel = slugZespolu(z.nazwa);
  return (dane?.sklady ?? []).find((s) => slugZespolu(s.zespol) === cel) ?? null;
}

/** HTML tabeli ligowej (dialog i podstrona współdzielą układ).
 *  v1.12.1: kolumna4 = etykieta 4. kolumny z danych („Sety” domyślnie;
 *  tabela PZTS ma „Z–R–P”, bo źródło nie wystawia bilansu setów). */
function htmlTabeli(tabela, naszWiersz, { maxWys = "" } = {}) {
  if (!tabela) return "";
  const kol4 = tabela.kolumna4 || "Sety";
  return `<div class="table-scroll${maxWys ? ` ${maxWys}` : ""}">
    <table class="league-table">
      <thead><tr><th>Drużyna</th><th class="num">M</th><th class="num">Pkt</th><th class="num">${esc(kol4)}</th></tr></thead>
      <tbody>${tabela.wiersze.map((w) => `
        <tr class="${w === naszWiersz ? "is-ours" : ""}">
          <td>${w.pozycja}. ${esc(w.nazwa)}</td>
          <td class="num">${w.mecze}</td>
          <td class="num">${w.punkty}</td>
          <td class="num">${esc(w.stosunek)}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
}

let dialogDruzynyPodpiety = false;

function otworzDruzyne(z) {
  const dlg = $("#druzyna-dialog");
  if (!dlg || !z) return;
  const dane = SWIEZOSC.dane;
  if (!dane) return;
  const mecze = meczeZDanych(dane);
  const nasze = meczeDruzyny(mecze, z.nazwa);
  const tabela = tabelaDlaZespolu(dane, z);
  const naszWiersz = wierszDlaZespolu(tabela, z);
  const sklad = skladDlaZespolu(dane, z);

  const ustaw = (pole, wartosc) => {
    const el = dlg.querySelector(`[data-pole="${pole}"]`);
    if (el) el.textContent = wartosc;
  };
  ustaw("nazwa", z.nazwa);
  ustaw("liga", z.liga);
  const elTryb = dlg.querySelector('[data-pole="tryb"]');
  if (elTryb) {
    elTryb.textContent = z.tryb.replace(/\s*·\s*automat\s*$/i, "");
    elTryb.className = "badge " + (z.tryb.startsWith("PZTS") ? "badge--team-pzts" : "badge--team");
  }
  const strona = dlg.querySelector('[data-pole="strona"]');
  if (strona) strona.href = `druzyna.html?id=${encodeURIComponent(slugZespolu(z.nazwa))}`;

  // panel: tabela
  const pTabela = dlg.querySelector('[data-panel="tabela"]');
  if (pTabela) {
    pTabela.innerHTML = tabela
      ? htmlTabeli(tabela, naszWiersz, { maxWys: "table-scroll--dialog" })
        + `<p class="t-small muted source-note">Źródło: ${z.url
            ? `<a href="${esc(z.url)}" target="_blank" rel="noreferrer">${esc(tabela.nazwa)}</a>`
            : esc(tabela.nazwa)} · stan: <span class="t-nums">${formatujZnacznik(tabela.zaktualizowano) ?? "—"}</span></p>`
      : `<p class="t-small muted">Pełna tabela tej ligi jeszcze nie płynie z automatycznego
         odczytu (pzts.pl czytany mostem Google Sheets — rozszerzenie w toku).
         Wyniki i terminarz tej drużyny są dostępne w zakładkach obok;
         tabela u źródła: ${z.url
            ? `<a href="${esc(z.url)}" target="_blank" rel="noreferrer">↗</a>` : "—"}.</p>`;
  }

  // panele: wyniki / najbliższe (wiersze jak na stronie — spójny wygląd).
  // v1.12.3 (właściciel 31.10): zakładka „Wyniki” pokazuje WSZYSTKIE mecze
  // sezonu (nie 5 ostatnich); porównywarki wspólne (1.20.0) biorą pod
  // uwagę także GODZINĘ.
  const rozegrane = nasze.filter((m) => m.rozegrany).sort(odNajnowszego);
  const wDrodze = nasze.filter(meczRozpoczety).sort(odNajnowszego);
  const przyszle = nasze.filter((m) => !m.rozegrany && !meczRozpoczety(m)).sort(odNajstarszego);

  const pWyniki = dlg.querySelector('[data-panel="wyniki"]');
  if (pWyniki) {
    pWyniki.innerHTML = rozegrane.length
      ? `<ul class="divide-list">${rozegrane.map((m) => wierszMeczu(m)).join("")}</ul>`
      : `<p class="t-small muted">Brak rozegranych meczów tej drużyny w danych.</p>`;
  }
  const pNajblizsze = dlg.querySelector('[data-panel="najblizsze"]');
  if (pNajblizsze) {
    const lista = [...wDrodze, ...przyszle].slice(0, 5);
    pNajblizsze.innerHTML = lista.length
      ? `<ul class="divide-list">${lista.map((m) => wierszMeczu(m, meczRozpoczety(m))).join("")}</ul>`
        + (wDrodze.length + przyszle.length > 5
            ? `<p class="t-small muted">+ ${wDrodze.length + przyszle.length - 5} kolejnych — pełny terminarz na stronie drużyny.</p>` : "")
      : `<p class="t-small muted">Brak zaplanowanych meczów — przerwa w rozgrywkach.</p>`;
  }

  // panel: skład (tylko gdy sync dostarczył dane.sklady)
  const pSklad = dlg.querySelector('[data-panel="sklad"]');
  const zSklad = dlg.querySelector('[data-zak="sklad"]');
  if (pSklad && zSklad) {
    if (sklad && sklad.zawodnicy?.length) {
      pSklad.innerHTML = htmlSkladu(sklad, "table-scroll--dialog");
      zSklad.hidden = false;
    } else {
      pSklad.innerHTML = "";
      zSklad.hidden = true;
    }
  }

  // domyślna zakładka: tabela (a dla lig bez tabeli — wyniki)
  aktywujZakladke(dlg, tabela ? "tabela" : "wyniki");

  if (!dialogDruzynyPodpiety) {
    const zamknij = dlg.querySelector('[data-akcja="zamknij"]');
    if (zamknij) zamknij.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll(".zakladka").forEach((prz) => {
      prz.addEventListener("click", () => aktywujZakladke(dlg, prz.dataset.zak));
    });
    dialogDruzynyPodpiety = true;
  }
  dlg.showModal();
}

function aktywujZakladke(dlg, nazwa) {
  dlg.querySelectorAll(".zakladka").forEach((prz) => {
    const on = prz.dataset.zak === nazwa;
    prz.classList.toggle("is-aktywny", on);
    prz.setAttribute("aria-selected", String(on));
    prz.tabIndex = on ? 0 : -1;
  });
  dlg.querySelectorAll(".zakladka-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nazwa;
  });
}

/** Wspólny HTML tabeli składu (dialog + podstrona; dane.sklady z syncu). */
function htmlSkladu(sklad, maxWys = "") {
  const z = sklad.zawodnicy ?? [];
  const maSkutecznosc = z.some((x) => x.skutecznosc);
  return `<div class="table-scroll${maxWys ? ` ${maxWys}` : ""}">
    <table class="sklad-table">
      <thead><tr>
        <th>Zawodnik</th><th class="num">Zwyc.</th><th class="num">Poraż.</th>
        ${maSkutecznosc ? '<th class="num">Skut.</th>' : '<th class="num">Sety</th>'}
      </tr></thead>
      <tbody>${z.map((x) => `
        <tr>
          <td>${esc(x.nazwisko)}${x.rok ? ` <span class="t-small muted">(${esc(x.rok)})</span>` : ""}</td>
          <td class="num">${x.zwyciestwa ?? "—"}</td>
          <td class="num">${x.porazki ?? "—"}</td>
          <td class="num">${maSkutecznosc ? esc(x.skutecznosc ?? "—") : esc(x.punkty ?? "—")}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>
    <p class="t-small muted source-note">Źródło: ${sklad.zrodlo
      ? `<a href="${esc(sklad.zrodlo)}" target="_blank" rel="noreferrer">${esc(new URL(sklad.zrodlo).hostname)}</a>` : "—"}
      · stan: <span class="t-nums">${formatujZnacznik(sklad.zaktualizowano) ?? "—"}</span></p>`;
}

/** Delegacja klików/klawiatury na kartach drużyn (raz — kontener żyje). */
function podpiezKartyDruzyn() {
  const wrap = $("#karty-druzyn");
  if (!wrap) return;
  const otworz = (kartaEl) => {
    const slug = kartaEl.dataset.slug;
    const z = (SWIEZOSC.dane?.zespoly ?? []).find((x) => slugZespolu(x.nazwa) === slug);
    otworzDruzyne(z);
  };
  wrap.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;   // „Pełna tabela” działa normalnie
    // 1.23.0: piłeczka formy = podpowiedź meczu (podpiezForme), nie dialog
    if (e.target.closest(".forma-pilka")) return;
    const kartaEl = e.target.closest(".team-klik");
    if (kartaEl) otworz(kartaEl);
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const kartaEl = e.target.closest(".team-klik");
    if (!kartaEl) return;
    e.preventDefault();
    otworz(kartaEl);
  });
}

/* 1.20.0: wielka tabela 2. ligi ZNIKNĘŁA z sekcji „Drużyny i wyniki”
   (decyzja właściciela 02.11: te same dane żyją w kartach drużyn —
   dialog i druzyna.html). Pełne tabele dalej płyną z dane.json
   (tabele[]) i są renderowane przez htmlTabeli() w dialogach oraz
   na podstronach drużyn; funkcja renderTabele() została usunięta. */

function wierszMeczu(m, oczekuje = false, wGrupie = false) {
  const nasze = druzynyMeczu(m);
  const derby = nasze.length > 1;
  const st = statusMeczu(m);
  const wynikKolor = derby ? "match-score--derby" : st === "W" ? "match-score--W" : st === "P" ? "match-score--P" : st === "R" ? "match-score--R" : ""; /* 1.28.0: remis = amber (dotąd bez koloru) */
  const badge = oczekuje
    ? `<span class="badge badge--pending">wynik w drodze</span>`
    : derby
      ? `<span class="badge badge--derby">derby</span>`
      : st ? `<span class="badge badge--${st}">${st}</span>` : "";
  const etykieta = nasze.length > 0 && !derby ? ` · ${nasze[0]}` : "";
  // 1.28.3 (właściciel 05.11: „żródła na stronie głównej niech będą
  // wymienione tylko w stopce”): domena źródła (pzts.pl/ligi.slzts.pl)
  // ZDJĘTA z mety meczu — atrybucja mieszka teraz w stopce strony
  // (+ znacznik ostatniej synchronizacji). Liga zostaje (kontekst
  // meczu), etykieta drużyny zostaje.
  // wGrupie = wiersz wewnątrz grupy drużyny („Ostatnie mecze”):
  // liga jest w nagłówku grupy, meta zduplikowana by schodziła.
  // 1.26.5 (właściciel 04.11: „w wersji mobilnej inną strukturę — niech
  // będzie jak na komputerze”): wiersz = dwie GRUPY — .match-glowne
  // (drużyny + wynik + plakietka) i .match-info (data · godzina ·
  // kolejka). Na desktopie stoją w JEDNYM wierszu (główna lewa,
  // info dopchnięte do prawej), na telefonie info schodzi do drugiej
  // linii (flex-basis:100%) — ŚWIADOMY, stały układ zamiast dowolnego
  // zawijania; identyczna struktura DOM na obu szerokościach.
  return `
    <li>
      <div class="match-row">
        <span class="match-glowne">
          <span class="match-teams">${esc(m.gospodarz)} — ${esc(m.gosc)}</span>
          <span class="match-score t-nums ${wynikKolor}">${esc(m.wynik)}</span>
          ${badge}
        </span>
        <span class="match-info">
          <span class="match-date">${formatujDate(m.dataMeczu)}${m.godzina ? ` · g. ${m.godzina}` : ""}</span>
          ${m.kolejka ? `<span class="match-date match-kolejka">· kolejka ${m.kolejka}</span>` : ""}
        </span>
      </div>
      ${wGrupie ? "" : `<p class="match-meta">${esc(m.liga)}${etykieta}</p>`}
    </li>`;
}

/* 1.20.0: „1 mecz / 2 mecze / 5 meczów” — licznik w tytule kafelka. */
function liczbaMeczy(n) {
  if (n === 1) return "1 mecz";
  const r10 = n % 10, r100 = n % 100;
  if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return `${n} mecze`;
  return `${n} meczów`;
}

/* 1.20.0: kafelki meczów — trójkąciki rozwijają treść (wzór „O klubie”).
   Podpinane RAZ przy starcie: kontener i przyciski żyją mimo przerysowań
   w pętli świeżości (render zamienia tylko wnętrza paneli), więc stan
   rozwinięcia przetrwa odświeżenie danych bez zamykania gościa.
   1.26.5 (właściciel 04.11: „brak wygodnego sposobu do zwinięcia listy
   w trakcie czytania; możliwość zwijania nie może być po prostu
   na samym dole”): w każdym panelu siedzi przycisk .mecz-zwin
   („Zwiń listę ▲”) — na długiej liście PRZYKLEJA się do dołu ekranu
   (CSS position:sticky), a klik zwija panel i WRACA do nagłówka
   kafelka (żeby nie zgubić miejsca po zniknięciu długiej listy). */
function podpinKafelkiMeczy() {
  [["#przelacz-najblizsze", "#najblizsze-mecze-panel"],
   ["#przelacz-ostatnie", "#ostatnie-mecze-panel"]].forEach(([selPrzycisku, selPanelu]) => {
    const przycisk = $(selPrzycisku);
    const panel = $(selPanelu);
    if (!przycisk || !panel || przycisk.dataset.podpiety) return;
    przycisk.dataset.podpiety = "1";
    przycisk.addEventListener("click", () => {
      const otwarte = przycisk.getAttribute("aria-expanded") === "true";
      przycisk.setAttribute("aria-expanded", String(!otwarte));
      panel.hidden = otwarte;
    });
    const zwin = panel.querySelector(".mecz-zwin");
    if (zwin) zwin.addEventListener("click", () => {
      przycisk.setAttribute("aria-expanded", "false");
      panel.hidden = true;
      // powrót do nagłówka kafelka; .mecz-kafel ma scroll-margin-top
      // (miejsce na przyklejony nagłówek strony); reduced-motion = instant
      przycisk.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    });
  });
}

function renderMecze(dane, mecze) {
  const dzis = dzisISO();

  /* „Najbliższe” (1.20.0: WSZYSTKIE przyszłe, nie tylko 6 — kafelek
     rozwijany): przyszłe + rozpoczęte bez wyniku w źródle (kiedyś padnie;
     plakietka „wynik w drodze” tłumaczy, dlaczego tu wisi), sortowanie
     od najbliższego do najdalszego — data, potem godzina. */
  const najblizsze = mecze
    .filter((m) => !m.rozegrany && (m.dataMeczu >= dzis || meczRozpoczety(m)))
    .sort(odNajstarszego);

  // 1.7.0: pusty terminarz nie jest błędem — to przerwa w rozgrywkach;
  // piłka (#pilka-kts) spoczywa, komunikat tłumaczy, skąd wezmą się dane.
  const elNajblizsze = $("#najblizsze-mecze");
  if (elNajblizsze) {
    elNajblizsze.innerHTML = najblizsze.length
      ? najblizsze.map((m) => wierszMeczu(m, meczRozpoczety(m))).join("")
      : `<li class="pusty-stan">
           <svg class="pilka-odpoczyna" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><use href="#pilka-kts"/></svg>
           <span class="t-small muted">Brak zaplanowanych meczów — przerwa w rozgrywkach.</span>
         </li>`;
  }
  const licznikNajblizsze = $("#najblizsze-mecze-licznik");
  if (licznikNajblizsze) licznikNajblizsze.textContent = liczbaMeczy(najblizsze.length);
  // 1.26.5: pusta lista (przerwa w rozgrywkach) → przycisk „Zwiń” zbędny
  const zwinN = $("#zwin-najblizsze");
  if (zwinN) zwinN.hidden = najblizsze.length === 0;

  /* „Ostatnie” (1.20.0): pogrupowane wg DRUŻYN w kolejności sezonu
     (dane.zespoly = 1. liga → … → amatorzy — decyzja właściciela 02.11:
     „od 1-szej ligi w dół”), w grupie chronologicznie OD NAJNOWSZEGO.
     Derby naszych drużyn trafia do grupy wyżej notowanej drużyny
     (pokazujemy raz, nie dwa razy). */
  const zespoly = dane?.zespoly ?? [];
  const kolejnosc = zespoly.map((z) => z.nazwa);
  const rozegrane = mecze.filter((m) => m.rozegrany);
  const grupy = new Map();                 // nazwa drużyny → mecze
  for (const m of rozegrane) {
    const nasze = druzynyMeczu(m);
    let klucz = kolejnosc.find((nazwa) => nasze.includes(nazwa));
    if (!klucz) klucz = nasze[0] ?? "Inne";   // mecz poza zespoly — na koniec
    if (!grupy.has(klucz)) grupy.set(klucz, []);
    grupy.get(klucz).push(m);
  }
  const klucze = [...grupy.keys()].sort((a, b) => {
    const ia = kolejnosc.indexOf(a), ib = kolejnosc.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
      || a.localeCompare(b, "pl");
  });

  const elGrupy = $("#ostatnie-mecze-grupy");
  if (elGrupy) {
    elGrupy.innerHTML = klucze.length
      ? klucze.map((nazwa) => {
          const z = zespoly.find((x) => x.nazwa === nazwa);
          const lista = grupy.get(nazwa).sort(odNajnowszego);
          return `<section class="mecz-grupa">
            <p class="list-title mecz-grupa-naglowek">${esc(nazwa)}${z ? ` <span class="t-small muted">· ${esc(z.liga)}</span>` : ""}</p>
            <ul class="divide-list">${lista.map((m) => wierszMeczu(m, false, true)).join("")}</ul>
          </section>`;
        }).join("")
      : `<p class="t-small muted">Brak rozegranych meczów w bazie.</p>`;
  }
  const licznikOstatnie = $("#ostatnie-mecze-licznik");
  if (licznikOstatnie) licznikOstatnie.textContent = liczbaMeczy(rozegrane.length);
  const zwinO = $("#zwin-ostatnie");
  if (zwinO) zwinO.hidden = klucze.length === 0;
}

function renderBadges(dane, ok) {
  $("#badge-sezon").textContent = `Sezon ${dane.sezon}`;
  // 1.27.1 (właściciel 04.11): #badge-live („dane live · auto-sync”) ZDJĘTY
  // ze strony — sekcja ma nie opowiadać o automatyce. Guard jak przy
  // #ostatni-sync (1.10.2), by brak elementu nie wywalał renderu.
  const live = $("#badge-live");
  if (live) {
    // klasy wymieniane SYMETRYCZNIE — od 1.7.5 renderBadges woła też tło
    // (odzysk po błędzie ładowania), więc „warn" nie może zostać przyklejony
    if (ok) {
      live.textContent = "dane live · auto-sync";
      live.classList.remove("badge-live--warn");
      live.classList.add("badge-live");
    } else {
      live.textContent = "błąd ładowania danych";
      live.classList.remove("badge-live");
      live.classList.add("badge-live--warn");
    }
  }
  const elSync = $("#ostatni-sync");
  // 1.10.2: element zdjęty ze strony (sekcja bez info o automacie) —
  // guard, by usunięcie HTML nie wywalało reszty renderu.
  if (elSync) {
    const sSzts = formatujZnacznik(dane.ostatniSync?.szts);
    const sPzts = formatujZnacznik(dane.ostatniSync?.pzts);
    elSync.textContent =
      `Ostatni odczyt: PZTS ${sPzts ?? "—"} · ŚZTS ${sSzts ?? "—"}`;
    elSync.title =
      "Moment ostatniego poprawnego odczytu każdego źródła. Wyniki nie muszą " +
      "się zmieniać między odczytami — strona zawsze pokazuje najświeższe " +
      "odczytane dane.";
  }
  // 1.28.3: ŹRÓDŁA TYLKO W STOPCE + ZNACZNIK OSTATNIEJ SYNCHRONIZACJI
  // (właściciel 05.11: „żródła na stronie głównej (desktop/mobile)
  // niech będą wymienione tylko w stopce… dodaj timestamp ostatniej
  // synchronizacji”). Statyczna treść (domeny + przypisanie lig) siedzi
  // w index.html; tu doklejamy znacznik czasu z danych — NOWSZY z dwóch
  // odczytów (PZTS/ŚZTS), bo tyle mówi, kiedy dane strony były ostatnio
  // świeże; oba znaczniki szczegółowo w title (hover).
  // 1.29.1 (właściciel 05.11: „to jest zbyt długie — zastąp tak: «Źródła:
  // PZTS, ŚlZTS — synchronizacja {timestamp}»”): statyczna treść w stopce
  // SKRÓCONA do nazw organizacji (bez domen i przypisania lig — pełne
  // informacje zostają w title po hover i w dialogach „Pełna tabela”);
  // logika znacznika bez zmian.
  const elZrodlaStopki = $("#zrodla-stopki");
  if (elZrodlaStopki) {
    const ts = [dane.ostatniSync?.szts, dane.ostatniSync?.pzts]
      .filter(Boolean).sort().pop();
    elZrodlaStopki.textContent = formatujZnacznik(ts) ?? "—";
    elZrodlaStopki.title =
      "Moment ostatniego poprawnego odczytu każdego źródła — PZTS: "
      + `${formatujZnacznik(dane.ostatniSync?.pzts) ?? "—"} · ŚZTS: `
      + `${formatujZnacznik(dane.ostatniSync?.szts) ?? "—"}. Wyniki nie muszą `
      + "się zmieniać między odczytami — strona zawsze pokazuje najświeższe "
      + "odczytane dane.";
  }
}

/* ===== tryb dzień/noc ===== */
function ustawIkoneTrybu() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  const noc = document.documentElement.getAttribute("data-theme") === "night";
  btn.textContent = noc ? "☀️" : "🌙";
  btn.setAttribute("aria-label", noc ? "Włącz tryb dzienny" : "Włącz tryb nocny");
  btn.setAttribute("aria-pressed", String(noc));
}

function obsluzPrzelacznikTrybu() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const terazNoc = document.documentElement.getAttribute("data-theme") === "night";
    const nowy = terazNoc ? "day" : "night";
    document.documentElement.setAttribute("data-theme", nowy);
    try { localStorage.setItem("kts-theme", nowy); } catch (e) { /* tryb prywatny */ }
    ustawIkoneTrybu();
  });
  ustawIkoneTrybu();
  sledzSystemowyTryb();
}

/* 1.6.7 — system przełącza dzień/noc (np. Windows o zachodzie słońca):
   strona podąża NA ŻYWO, bez odświeżania — ale tylko dopóki użytkownik
   nie kliknął własnego przełącznika (ręczny wybór w localStorage jest
   ważniejszy niż system; świeża wizyta = zawsze tryb systemu). */
function sledzSystemowyTryb() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const reakcja = (e) => {
    let zapisany = null;
    try { zapisany = localStorage.getItem("kts-theme"); } catch (err) { /* prywatny */ }
    if (zapisany) return; // własny wybór wygrywa — nie ruszamy
    document.documentElement.setAttribute("data-theme", e.matches ? "night" : "day");
    ustawIkoneTrybu();
  };
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", reakcja);
  else if (typeof mq.addListener === "function") mq.addListener(reakcja); // starsze Safari
}

/* ===== wersja strony (wersja.json przy deployu) =====
   1.26.2: KONWENCJA OPISU WERSJI (właściciel 03.11: „W stopce nie używaj
   formy właściciel. Pisanie w stopce kto generalnie nie ma sensu bo to
   nieistotne. Więc jeśli to dopisujesz skrócisz stopkę i będzie super”):
   opis z wersja.json ląduje W STOPCE strony — jedno krótkie zdanie
   (do ~60 znaków), zero atrybucji (kto zamówił/co powiedział), zero
   szczegółów technicznych. Te żyją w komentarzach kodu, WORKLOG.md
   i release'ach na GitHubie. Przykład dobrej formy: „Drobne porządki —
   krótsza stopka”; zła: „Chip wyraźniejszy (właściciel: «dodaj mu 2s
   życia i może lepiej niech będzie pomarańczowy»): żyje 9 s zamiast 7…”

   1.28.4: WERSJA KODU vs WERSJA NA SERWERZE (właściciel 05.11: „czasem
   ale niestety nie zawsze z dołu wyskakuje komunikat, że site ma nową
   wersję. dlaczego czasem nie wyskakuje […] można to naprawić?”).
   PRZYCZYNA: do v1.28.3 komunikat porównywał wersję.json z chwili
   załadowania karty z wersją.json przy kolejnym sprawdzeniu — obie są
   pobierane bez cache, więc gość wchodzący PO deployu miał „wersję
   startową” już nową → cisza, choć przeglądarka trzymała w cache STARY
   app.js (GitHub Pages: ~10 min). Komunikat działał tylko, gdy deploy
   wypadł w trakcie życia otwartej karty — stąd „czasem”.
   NAPRAWA: skrypt zna WŁASNĄ wersję — WERSJA_KODU, podnoszoną RAZEM
   z wersja.json przy KAŻDYM deployu (wszystkie pliki z WERSJA_KODU
   wchodzą do każdego deploy_v*.py; spójność pilnuje test v1.28.4).
   Komunikat wstaje, gdy na serwerze jest STRICT NOWSZA wersja: przy
   wejściu (pokazWersje) i przy każdym sprawdzeniu świeżości
   (sprawdzDane). „Odśwież stronę” omija cache — patrz pobierzNowaWersje.

   1.28.5 (właściciel 05.11: „usuń SZKIELET”): koniec etykiety
   „szkieletu projektowego” — strona jest już wdrożona i oceniana
   przez zarząd, więc znika obramowanie SZKIELET — podział sekcji
   nad hero, dopisek „/ SZKIELET” przy logo (strona główna + archiwum)
   i „SZKIELET projektowy ·” w stopkach wszystkich 4 stron; zdanie
   w sekcji „Podziel się opinią” przeformułowane bez słowa „szkielet”
   (sama sekcja zostaje — etap projektowy). 
   1.29.2 (właściciel 05.11: „go” — gra ma DZIAŁAĆ): naprawa poboru gry
   Pong. Odkrycie: CDN raw.githubusercontent.com IGNORUJE parametry ?bust=
   (x-cache HIT przy unikalnych wartościach) — obiecano „najnowszą od
   razu”, a dawano do 5 min wstecz. Naprawa: js/gra.js pyta API GitHuba
   o SHA ostatniego commita w gra/ i pobiera grę z adresu z SHA (każda
   wersja gry = inny, niezmienny adres = cache nieszkodliwy). Repo gry
   tmjwk/pong ZOSTAJE PRYWATNE — jego workflow (Actions) publikuje
   mirror game/ do katalogu gra/ repo strony przy każdym pushu (sekret
   TOKEN_STRONY); fallback: gałąź main mirroru. Gra nadal pobierana
   przy każdym wejściu i nie jest częścią kodu strony.

   1.29.3 (06.11): domknięcie luki bfcache w komunikacie o nowej wersji
   (właściciel 06.11: „komunikat o nowej wersji… wydaje mi się, że
   nie ma tego w wersji na telefon”). Weryfikacja mobile (viewport
   telefonu): obie dotychczasowe ścieżki działają — (1) wejście
   ze starym kodem w cache (v1.28.4) i (2) powrót do karty po
   deploju (visibilitychange). LUKA: powrót „wstecz” przez bfcache
   (galeria/archiwum → strona główna) NIE odpala visibilitychange
   (karta cały czas widoczna), więc sprawdzenie wersji czekało do
   10 min na timerze. Naprawa: pilnujSwiezosci słucha też pageshow
   z persisted=true — jak przy powrocie do karty: pokaż czekający
   komunikat i sprawdź natychmiast (nie częściej niż co 45 s).
*/

const WERSJA_KODU = "1.29.4";

/** Czy wersja „a” jest STRICT nowsza od „b” (numerycznie: 1.28.10 > 1.28.9)?
 *  Odporna na różne długości i śmieci w polu (wtedy false — milczimy). */
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

async function pokazWersje() {
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const w = await res.json();
    if (w?.wersja) {
      $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
      // 1.28.4: karta z PRZESTARZAŁYM kodem (cache przeglądarki)? Komunikat
      // od razu przy wejściu — do v1.28.3 ten przypadek był ślepy.
      if (nowszaWersja(w.wersja, WERSJA_KODU) && !SWIEZOSC.wersjaZgloszona) {
        SWIEZOSC.wersjaZgloszona = true;
        pokazToast(`Dostępna nowa wersja strony (v${w.wersja})`, { odswiez: true });
      }
      return w.wersja;
    }
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
  return null;
}

/* ===== 1.7.5: odświeżanie danych w tle (przebudowa sygnału świeżości z 1.7.0) =====
   Karta z wynikami wisi często otwarta godzinami — strona SAMA pilnuje,
   czy nie wpadły nowe dane (pytanie Tomka 15.10; mechanizm z 1.7.0
   rozbudowany, bo wykrywał tylko zmiany wyników rozegranych meczów —
   zmiana terminarza/godziny czy tabeli wymykała mu się po cichu).

   JAK DZIAŁA:
   • Rytm ADAPTACYJNY (samoplanujący setTimeout, nie sztywny setInterval):
       2 min  — gdy jakiś wynik jest „w drodze” (mecz się skończył, źródło
                jeszcze nie wpisało) — łowimy jak najszybciej,
       5 min  — w dzień meczowy (wyniki zaczną wpadać wieczorem),
       10 min — zwykły spokojny rytm (tyle mniej więcej żyje cache CDN
                dla dane.json, więc częściej nie ma sensu),
       1 min  — gdy strona wciąż nie ma danych (błąd startu) — odzysk.
   • Powrót do karty / odzysk sieci = sprawdzenie NATYCHMIAST (nie
     częściej niż co 45 s) — ukryta karta dostaje od przeglądarki
     zmulone timery, więc realny rytm pilnuje właśnie to zdarzenie.
   • Co wykrywa: KAŻDĄ realną zmianę dane.json. Sync commituje plik tylko
     przy zmianie treści (znaczniki czasu maskuje), więc zwykłe
     porównanie tekstu wystarcza: wyniki, terminarz (daty/godziny!),
     tabele, stan drużyn, odzysk/awaria źródła.
   • Co robi po wykryciu: przerysowuje sekcje (te same funkcje co przy
     starcie — podmieniają tylko wnętrza, scroll i menu zostają),
     piłka-bohater robi jedno „podanie”, a na dole ekranu pojawia się
     krótki komunikat (znika sam; prefers-reduced-motion: bez animacji,
     dane i tak się odświeżają).
   • Nowa wersja strony → komunikat z przyciskiem „Odśwież stronę”.
     1.28.4: porównujemy z WERSJĄ URUCHOMIONEGO KODU (patrz WERSJA_KODU),
     więc komunikat łapie i wejście PO deployu ze starym app.js w cache,
     i deploy wypadły w trakcie życia karty; przycisk dociąga stronę
     z pominięciem cache (pobierzNowaWersje). NIGDY nie przeładowujemy
     karty sami — czytanie święte.
   • Koszt: fetch z cache:"no-cache" to rewalidacja ETag (304 = kilkadziesiąt
     bajtów); przy okazji odświeża się panel „Automat” (runs.json) i
     znacznik „Ostatni odczyt”. Komunikat w ukrytej karcie czeka na
     powrót gościa — żeby go nie ominął.

   Uchwyt window._ktsSprawdzDane — wymuszone sprawdzenie z konsoli
   (testy automatu, debugging). */

const SWIEZOSC = {
  tekst: null,            // ostatni surowy dane.json (identyczny tekst = cisza)
  dane: null,             // ostatnie sparsowane dane
  wersjaZgloszona: false, // czy komunikat o nowej wersji już się pokazał (raz na życie karty)
  wToku: false,           // osłona przed równoległymi sprawdzeniami
  ostatnio: 0,            // czas ostatniego wystartowania sprawdzenia (ms)
  timer: null,
};

/** Sygnatura rozegranych meczów — rozróżnia „nowe wyniki!” od innych zmian. */
function sygnaturaWynikow(dane) {
  return meczeZDanych(dane).filter((m) => m.rozegrany)
    .map((m) => `${m.dataMeczu}:${m.gospodarz}:${m.wynik}`)
    .join("|");
}

/** Sygnatura całej widocznej treści (bez znaczników czasu i statusów źródeł). */
function sygnaturaWidoczna(dane) {
  return JSON.stringify([dane.sezon, dane.zespoly, dane.tabele, dane.meczeSzts, dane.meczePzts]);
}

/** Odstęp do następnego sprawdzenia — patrz komentarz bloku wyżej. */
function nastepnyOdstep() {
  if (!SWIEZOSC.dane) return 60_000;
  const mecze = meczeZDanych(SWIEZOSC.dane);
  if (mecze.some(meczRozpoczety)) return 2 * 60_000;
  if (mecze.some((m) => m.dataMeczu === dzisISO() && !m.rozegrany)) return 5 * 60_000;
  return 10 * 60_000;
}

function zaplanujSprawdzenie() {
  clearTimeout(SWIEZOSC.timer);
  SWIEZOSC.timer = setTimeout(sprawdzDane, nastepnyOdstep());
}

/* ===== toast: krótki komunikat na dole ekranu =====
   Jeden element, budowany dopiero przy pierwszej potrzebie. role=status
   (czytniki ekranu ogłaszają grzecznie, raz). Znika sam; klik = zamknij;
   wariant --wersja dokłada przycisk „Odśwież stronę” (świadome
   przeładowanie). Gdy karta jest ukryta, komunikat CZEKA na powrót. */
const TOAST = { el: null, timer: null, oczekujacy: null };

function pokazToast(tresc, { odswiez = false } = {}) {
  TOAST.oczekujacy = { tresc, odswiez };
  if (document.hidden) return; // pokaże się, gdy gość wróci do karty
  pokazToastTeraz();
}

function pokazToastTeraz() {
  const z = TOAST.oczekujacy;
  if (!z) return;
  TOAST.oczekujacy = null;
  if (!TOAST.el) {
    TOAST.el = document.createElement("div");
    TOAST.el.id = "toast-danych";
    TOAST.el.className = "toast-danych";
    TOAST.el.setAttribute("role", "status");
    TOAST.el.addEventListener("click", (e) => {
      if (e.target.closest(".toast-btn")) return; // przycisk ma własną akcję
      ukryjToast();
    });
    document.body.appendChild(TOAST.el);
  }
  TOAST.el.classList.toggle("toast-danych--wersja", z.odswiez);
  TOAST.el.innerHTML =
    `<span class="toast-tekst">${esc(z.tresc)}</span>` +
    (z.odswiez ? `<button type="button" class="btn btn-accent btn-sm toast-btn">Odśwież stronę</button>` : "");
  const btn = TOAST.el.querySelector(".toast-btn");
  if (btn) btn.addEventListener("click", pobierzNowaWersje);
  requestAnimationFrame(() => TOAST.el.classList.add("widoczny"));
  clearTimeout(TOAST.timer);
  TOAST.timer = setTimeout(ukryjToast, z.odswiez ? 20_000 : 8_000);
}

function ukryjToast() {
  if (!TOAST.el) return;
  TOAST.el.classList.remove("widoczny");
  clearTimeout(TOAST.timer);
}

/** 1.28.4: „Odśwież stronę” OMIJA cache przeglądarki. Zwykłe przeładowanie
 *  w oknie ~10 min po deployu sięgałoby po starą kopię z cache (GitHub
 *  Pages) i komunikat wracał jak bumerang. Najpierw dociągamy na nowo
 *  HTML i zasoby strony (fetch z cache:"reload" podmienia wpis w cache
 *  HTTP), dopiero potem przeładowujemy — po powrocie działa nowy kod. */
async function pobierzNowaWersje() {
  const adresy = [location.href,
    ...[...document.scripts].map((s) => s.src),
    ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)]
    .filter(Boolean);
  await Promise.allSettled(adresy.map((u) => fetch(u, { cache: "reload" })));
  location.reload();
}

/** Przerysowanie wszystkich sekcji danymi — identyczne funkcje jak przy
 *  starcie (podmieniają tylko wnętrza, scroll i menu zostają nietknięte). */
function przerysujDane(dane, animujPilke) {
  const mecze = meczeZDanych(dane);
  renderPasekMeczu(mecze);
  renderKartyDruzyn(dane, mecze);
  renderMecze(dane, mecze);
  renderBadges(dane, true);
  const pilka = document.querySelector(".pilka-bohater");
  if (pilka && animujPilke) {
    pilka.classList.remove("podanie");
    void pilka.getBoundingClientRect(); // restart animacji (reflow)
    pilka.classList.add("podanie");
  }
}

async function sprawdzDane() {
  if (SWIEZOSC.wToku) return; // jedno sprawdzenie naraz
  SWIEZOSC.wToku = true;
  SWIEZOSC.ostatnio = Date.now();
  try {
    const res = await fetch("dane.json", { cache: "no-cache" });
    if (res.ok) {
      const tekst = await res.text();
      if (tekst !== SWIEZOSC.tekst) {
        let nowe = null;
        try { nowe = JSON.parse(tekst); } catch { /* okrojony zapis — czekamy na kolejny */ }
        if (nowe) {
          const stare = SWIEZOSC.dane;
          const terazWyniki = sygnaturaWynikow(nowe);
          const byloWynikow = stare ? sygnaturaWynikow(stare) : "";
          const terazTresc = sygnaturaWidoczna(nowe);
          const bylaTresc = stare ? sygnaturaWidoczna(stare) : "";
          const zmianaWidoczna = terazWyniki !== byloWynikow || terazTresc !== bylaTresc;
          SWIEZOSC.tekst = tekst;
          SWIEZOSC.dane = nowe;
          przerysujDane(nowe, zmianaWidoczna);
          // komunikat RÓŻNICUJE powód; zmiana samych znaczników czasu lub
          // statusu źródeł (ostatniSync/zrodla) jest cicha — nic do pokazania
          if (terazWyniki !== byloWynikow) {
            const lista = (s) => s.split("|").filter(Boolean);
            const ile = lista(terazWyniki).filter((x) => !lista(byloWynikow).includes(x)).length;
            pokazToast(ile === 1 ? "Nowy wynik na stronie 🏓" : `Nowe wyniki na stronie (${ile}) 🏓`);
          } else if (zmianaWidoczna) {
            pokazToast("Dane zaktualizowane — terminarz lub tabela");
          }
        }
      }
    }
    pokazPrzebiegiSyncu(); // panel „Automat” też na bieżąco (runs.json mały)
    // czy na serwerze nie czeka nowsza wersja strony? (1.28.4: porównanie
    // z WERSJĄ URUCHOMIONEGO KODU — do v1.28.3 porównywaliśmy z wersją
    // z chwili załadowania karty, więc gość wchodzący po deployu dostawał
    // ciszę nawet ze starym app.js w cache; to samo sprawdzenie robi
    // pokazWersje przy wejściu — tu łapiemy deploy w trakcie życia karty)
    if (!SWIEZOSC.wersjaZgloszona) {
      try {
        const rw = await fetch("wersja.json", { cache: "no-cache" });
        if (rw.ok) {
          const w = await rw.json();
          if (nowszaWersja(w?.wersja, WERSJA_KODU)) {
            SWIEZOSC.wersjaZgloszona = true;
            pokazToast(`Dostępna nowa wersja strony (v${w.wersja})`, { odswiez: true });
          }
        }
      } catch { /* sieć — następny takt */ }
    }
  } catch (e) { /* sieć/błąd — dane zostają, następna próba wg planu */ }
  SWIEZOSC.wToku = false;
  zaplanujSprawdzenie();
}

function pilnujSwiezosci() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    // komunikat czekający w ukrytej karcie pokazujemy po powrocie…
    if (TOAST.oczekujacy) pokazToastTeraz();
    // …i od razu sprawdzamy dane (chyba że niedawno sprawdzone)
    if (Date.now() - SWIEZOSC.ostatnio > 45_000) sprawdzDane();
  });
  // 1.29.3: powrót przez bfcache („wstecz” z galerii/archiwum) — karta
  // przez cały czas była widoczna, więc visibilitychange milczy, a kod
  // w karcie może być starszy niż na serwerze. pageshow z persisted=true
  // łapie dokładnie ten przypadek: pokaż czekający komunikat (gdyby się
  // zgromadził w tle) i sprawdź wersję natychmiast — jak przy powrocie
  // do karty (nie częściej niż co 45 s).
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    if (TOAST.oczekujacy) pokazToastTeraz();
    if (Date.now() - SWIEZOSC.ostatnio > 45_000) sprawdzDane();
  });
  window.addEventListener("online", () => sprawdzDane());
  // uchwyt testowo-poglądowy: wymuszone sprawdzenie z konsoli (testy automatu)
  window._ktsSprawdzDane = sprawdzDane;
  zaplanujSprawdzenie();
}

/* ===== przebiegi automatu: runs.json (zapisywany przy KAŻDYM uruchomieniu) =====
   Konwencja uzgodniona z właścicielem (01.10.2026), doprecyzowana 10.10 (1.7.2):
     ✓ = źródło odczytane poprawnie (także gdy danych nie zmieniło —
         „bez zmian” to również sukces),
     „chwilowo nieodczytany” = źródło nie odpowiedziało (timeout / 0 B) —
         na stronie zostają ostatnie znane dane.
   Od 1.7.2 linia pokazuje JEDEN ostatni przebieg ze statusem PER ŹRÓDŁO,
   źródła po imieniu. Poprzedni format „✗ źródło bez odpowiedzi” nie nazywał
   źródła (atrybucja kłamała przy awarii), a „✓ AWARIA…” kleił sukces ze
   statusem awarii innego źródła. Szczegóły techniczne pozostają w runs.json. */
async function pokazPrzebiegiSyncu() {
  const el = $("#cron-aktywnosc");
  if (!el) return;
  let runs = null;
  try {
    const res = await fetch("runs.json", { cache: "no-cache" });
    if (res.ok) runs = (await res.json())?.runs ?? null;
  } catch (e) { /* sieć — sekcja milczy */ }
  if (!runs || !runs.length) {
    el.textContent = "Automat: czekam na pierwszy zapis przebiegu…";
    el.title =
      "Od wersji 1.5.2 automat zapisuje każdy przebieg (także pusty) do runs.json. " +
      "Pierwszy wpis pojawi się po najbliższym uruchomieniu crona (co 2 h).";
    return;
  }
  const etykietaCzasu = (iso) => {
    const d = new Date(iso);
    const teraz = new Date();
    const fmt = (x) =>
      x.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });
    const godz = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
    if (fmt(d) === fmt(teraz)) return `dziś ${godz}`;
    const wczoraj = new Date(teraz.getTime() - 86_400_000);
    if (fmt(d) === fmt(wczoraj)) return `wczoraj ${godz}`;
    return `${fmt(d)} ${godz}`;
  };
  const run = runs[runs.length - 1];
  const sztsStan = run.szts === "ok" ? "ŚZTS ✓" : "ŚZTS chwilowo nieodczytany";
  const pztsStan =
    run.pzts === "ok" ? "PZTS ✓" :
    run.pzts === "recznie" ? "PZTS ✓ (wklejka)" :
    run.pzts === "pominieto" ? "PZTS pominięty" :
    "PZTS chwilowo nieodczytany";
  const przytrzymane = run.szts !== "ok" || (run.pzts !== "ok" && run.pzts !== "recznie" && run.pzts !== "pominieto");
  el.textContent =
    `Automat: ostatni przebieg ${etykietaCzasu(run.start)} — ${sztsStan} · ${pztsStan}` +
    (przytrzymane ? " (pokazuję ostatnie znane dane)" : "");
  el.title =
    "Automat czyta źródła co 2 h (cron GitHub Actions). ✓ = odczytane poprawnie — " +
    "także bez zmian; „chwilowo nieodczytany” = źródło nie odpowiedziało, " +
    "na stronie zostają ostatnie znane dane. Historia: runs.json w repo.";
}

/* ===== galeria: licznik CAŁEJ galerii (badge przy nagłówku sekcji) =====
   1.16.0 (decyzja właściciela): badge ma mówić, ile zdjęć jest w CAŁEJ
   galerii (2012–…), a nie w oknie wczytanych lat — i ma się liczyć
   automatycznie, bo zdjęć stale przybywa. Pełne policzenie = przejście
   całego stronicowania FB (~14 stron po 1000 rekordów), więc robi to BOT
   (scripts/licznik_galerii.ts, krok workflow sync-dane.yml co 2 h) i
   zapisuje galeria-licznik.json — strona tylko czyta. Podczas poboru:
   kręcąca się piłka (zamiast tekstu „dociągam…”). Brak danych = brak
   badge (nigdy nie pokazujemy liczby, która nie odpowiada prawdzie). */
async function wypelnijLicznikGalerii() {
  const badge = $("#gal-count");
  if (!badge) return;
  const K = window.KTSFB;
  badge.setAttribute("role", "status");
  badge.innerHTML = K ? K.pilka("gal-pilka gal-pilka--badge") : "…";
  try {
    const res = await fetch("galeria-licznik.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const n = Number(d && d.zdjecia);
    if (!Number.isFinite(n) || n <= 0) throw new Error("brak liczby zdjęć");
    const nZ = K ? K.liczba(n, ["zdjęcie", "zdjęcia", "zdjęć"]) : `${n} zdjęć`;
    badge.textContent = (d.od && d.do) ? `${nZ} · ${d.od}–${d.do}` : nZ;
    badge.title = "Wszystkie zdjęcia w galerii (zakładka „Zdjęcia” na FB klubu). "
      + "Licznik odświeża się automatycznie razem z danymi ligowymi.";
  } catch (err) {
    console.warn("Licznik galerii niedostępny — ukrywam:", err);
    badge.style.display = "none";   // display:none działa niezależnie od klasy
  }
}

/* ===== galeria: teaser okładek (pełna galeria na podstronie) =====
   1.15.0: teaser NA ŻYWO z zakładki „Zdjęcia” na FB (silnik
   js/galeria-fb-core.js) — najnowsze albumy klubu zamiast zamarzniętego
   archiwum 2023–24. Awaria FB → archiwum lokalne (bez etykiety liczb —
   badge sekcji to od 1.16.0 osobny licznik CAŁEJ galerii, patrz wyżej).
   1.27.0: między lustrem a archiwum wchodzi MIGAWKA BOTA
   (galeria-teaser.json, zapisywana co 2 h przez sync-bot w Actions) —
   u gościa, któremu przeglądarka BLOKUJE graph.facebook.com (adblock /
   filtry prywatności) albo gdy FB świeci czasem, teaser pokazuje
   najnowsze albumy z migawki (bieżący rok!) zamiast udawać, że
   „najnowsze” = zamrożone 2023–24 z archiwum.
   1.27.4: gdy przeglądarka gościa NIE ODCZYTAŁA zdjęć z FB (adblock /
   filtry prywatności blokują graph.facebook.com, rzadziej chwilowa
   awaria FB), pod okładkami pojawia się notka o tym — żeby gość
   wiedział, czemu okładki żyją z migawki, i jak zobaczyć zdjęcia
   bezpośrednio. Przy udanym poborze notki nie ma (nigdy). */
async function renderTeaserGalerii() {
  const wrap = $("#gal-teaser");
  if (!wrap) return;

  /* 1.27.4: notka degradacji — TAK, pokazuje się wyłącznie, gdy prawdziwy
     pobór zdjęć z graph.facebook.com w TEJ przeglądarce się nie udał
     (właściciel 05.11: „pojawi się tylko przy nieudanym odczycie fotek
     z galerii na FB?”). Zdjęcia dalej się pokazują — z migawki bota
     (albo, czarną ławicą, z archiwum). Raz na stronę (guard), link
     wyprowadza na zakładkę „Zdjęcia” fanpage’a klubu. */
  let fbNieodczytane = false;
  const notkaBloku = () => {
    if (document.querySelector(".gal-teaser-notka")) return;   // raz
    wrap.insertAdjacentHTML("afterend",
      '<p class="gal-teaser-notka">Wygląda na to, że Twoja przeglądarka '
      + 'blokuje zapytania do Facebooka (np. AdBlock). Odznacz stronę '
      + 'w blokerze albo <a href="https://www.facebook.com/'
      + 'AkademiaTenisaStolowego/photos" target="_blank" rel="noopener">'
      + 'zobacz zdjęcia bezpośrednio na Facebooku&nbsp;→</a></p>');
  };

  const okladki = (albumy) => {
    wrap.innerHTML = albumy.slice(0, 6).map((a) => {
      const mini = (a.miniatury && a.miniatury[0]) || a.zdjecia[0];
      const lqip = a.lqip && a.lqip[0];
      return `
      <a href="galeria.html#album-${esc(a.slug)}" aria-label="${esc(a.tytul)}">
        ${lqip ? `<span class="lqip" style="background-image:url('${lqip}')" aria-hidden="true"></span>` : ""}
        <img onload="this.classList.add('zalane')"
             onerror="if(this.dataset.org && this.src !== this.dataset.org){this.src=this.dataset.org}else{this.classList.add('zalane')}"
             src="${esc(mini)}" data-org="${esc(a.zdjecia[0])}"
             alt="${esc(a.tytul)}" loading="lazy" decoding="async">
        <span class="gal-teaser-label">${a.data ? esc(formatujDate(a.data)) : ""} · ${esc(a.tytul)}</span>
      </a>`;
    }).join("");
  };
  const wgDaty = (a, b) => {
    const da = a.data ?? "", db = b.data ?? "";
    return da > db ? -1 : da < db ? 1 : 0;
  };

  /* szkielet podczas poboru (wzór .lustro-skeleton) */
  wrap.innerHTML = '<span class="gal-teaser-skel" aria-hidden="true"></span>'.repeat(6);

  /* 1) lustro FB na żywo — 1.17.0: BIEŻĄCY rok (lżejszy pobór: ~2 MB
     zamiast okna 2 lat ~5 MB); gdy mało albumów (np. styczeń), dołóż
     rok poprzedni, żeby zebrać 6 okładek. Wiek roku liczymy dynamicznie,
     więc teaser nie starzeje się w 2027+. */
  const K = window.KTSFB;
  if (K) {
    try {
      const rok = Math.max(2012, new Date().getFullYear());
      const [posty, zdjecia] = await Promise.all([
        K.posty(`${rok}-01-01`, null, { stopPrzedIso: `${rok}-01-01` }).catch(() => []),
        K.zdjecia(`${rok}-01-01`, null),
      ]);
      const widziane = new Set();   // dedup foto na granicy lat
      let albumy = K.zbudujAlbumy(zdjecia, K.mapaFotoPost(posty), widziane);
      if (albumy.length < 6 && rok - 1 >= 2012) {
        try {
          const [posty2, zdjecia2] = await Promise.all([
            K.posty(`${rok - 1}-01-01`, `${rok}-01-01`).catch(() => []),
            K.zdjecia(`${rok - 1}-01-01`, `${rok}-01-01`),
          ]);
          albumy = albumy.concat(K.zbudujAlbumy(zdjecia2, K.mapaFotoPost(posty2), widziane));
        } catch (e) { /* rok poprzedni opcjonalny — nie wywala teasera */ }
      }
      albumy.sort(wgDaty);
      if (!albumy.length) throw new Error("FB nie zwrócił zdjęć");
      okladki(albumy);
      return;
    } catch (err) {
      fbNieodczytane = true;   // pobór z FB nie udał się W TEJ przeglądarce
      console.warn("Teaser galerii: lustro FB niedostępne — próbuję migawki bota:", err);
    }
  }

  /* 2) ratunek: MIGAWKA BOTA (galeria-teaser.json) — najnowsze albumy
     (bieżący rok) zapisane przez sync-bot co 2 h. Plik żyje w naszym
     repo, więc działa dokładnie tam, gdzie lustru FB nie damy rady:
     adblock/filtry prywatności blokujące graph.facebook.com, sieci
     firmowe, chwilowe awarie FB. Wiek migawki ≤ 2 h (a po cichych
     tygodniach bot odświeża podpisy URL-i CDN najpóźniej po 14 dniach).
     Format albumów = ten sam co lustro (galeria-fb-core.js), więc
     linki „galeria.html#album-…” trafiają w te same miejsca. */
  try {
    const res = await fetch("galeria-teaser.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    const albumy = (snap && snap.albumy) || [];
    if (!albumy.length) throw new Error("migawka bez albumów");
    okladki(albumy);
    if (fbNieodczytane) notkaBloku();   // 1.27.4: migawka + wyjaśnienie
    return;
  } catch (err) {
    console.warn("Teaser galerii: migawka bota niedostępna — archiwum lokalne:", err);
  }

  /* 3) ostateczność: archiwum lokalne (2023–24) — tylko gdy padło i FB,
     i migawka bota (awaria obu naraz jest już czarna ławica) */
  try {
    const res = await fetch("galeria.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const albumy = await res.json();
    albumy.sort(wgDaty);
    okladki(albumy);
    if (fbNieodczytane) notkaBloku();   // 1.27.4: i tu FB było nieodczytane
  } catch (err) {
    console.error("Błąd ładowania galeria.json:", err);
    wrap.innerHTML = "";
  }
}

/* ===== start ===== */
async function start() {
  // tryb dzień/noc (ikona + klik) i menu mobilne
  obsluzPrzelacznikTrybu();
  pokazWersje();   // 1.28.4: stopka + komunikat, gdy na serwerze czeka nowsza wersja
  pokazPrzebiegiSyncu();
  renderTeaserGalerii();
  wypelnijLicznikGalerii();   // 1.16.0: badge sekcji = licznik CAŁEJ galerii (bot)
  podpiezKartyDruzyn();   // 1.12.0: dialog szczegółów (kontener żyje mimo przerysowań)
  podpiezForme();         // 1.23.0: dymki piłeczek formy — hover + dotyk (jw.)
  podpinKafelkiMeczy();   // 1.20.0: trójkąciki kafelków meczów (jw. — podpięte raz)
  const hamburger = $("#hamburger");
  const nav = $("#nav");
  hamburger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    hamburger.setAttribute("aria-expanded", String(open));
  });

  let dane = null;
  let ok = false;
  let tekstDanych = null;
  try {
    const res = await fetch("dane.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tekstDanych = await res.text(); // 1.7.5: surowy tekst = punkt porównania odświeżania
    dane = JSON.parse(tekstDanych);
    ok = true;
  } catch (err) {
    console.error("Błąd ładowania dane.json:", err);
    $("#ostatni-wynik").textContent = "Błąd ładowania danych — odśwież stronę";
    $("#najblizszy-mecz").textContent = "";
    const elD = $("#wyniki-w-drodze");
    if (elD) elD.hidden = true;
    $("#karty-druzyn").innerHTML =
      `<p class="t-small muted">Dane chwilowo niedostępne — odśwież stronę.</p>`;
    $("#badge-sezon").textContent = "Sezon —";
  }

  if (ok) {
    // 1.28.0: dane lądują w SWIEZOSC PRZED renderami — statusMeczu
    // (W/P/R na listach i pasku) dopasowuje stronę meczu także po
    // zespoly[].wiersz (PZTS: „KTS Gliwice I” gra jako „KTS Gliwice”);
    // przy ustawianiu dopiero po renderach pierwszy rysunek straciłby
    // kolorowe oznaczenia 1. ligi.
    SWIEZOSC.dane = dane;
    // Mecze z odsianiem dat zastępczych źródeł (ŚZTS wstawia „2026-00-00"
    // dla meczów bez terminu) — wiersz z niepoprawną datą nie może trafić
    // na pasek meczowy (wisi tam jako „Wynik w drodze · 00.00.2026"),
    // do kart drużyn ani list wyników. Parser też je odsiewa — to
    // podwójne zabezpieczenie (bug z 10.10, zgłoszenie Tomka).
    const mecze = meczeZDanych(dane);
    renderPasekMeczu(mecze);
    renderKartyDruzyn(dane, mecze);
    renderMecze(dane, mecze);
  }
  renderBadges(dane ?? {}, ok);
  // 1.7.5: pętla świeżości rusza ZAWSZE — także po błędzie startu
  // (pierwsze udane sprawdzenie naprawia stronę bez odświeżania karty)
  SWIEZOSC.tekst = ok ? tekstDanych : null;
  SWIEZOSC.dane = ok ? dane : null;
  pilnujSwiezosci();
}

document.addEventListener("DOMContentLoaded", start);
