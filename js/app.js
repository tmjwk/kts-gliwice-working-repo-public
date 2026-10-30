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

/** Status meczu z perspektywy naszych drużyn: "W" | "P" | "R" | null (derby). */
function statusMeczu(m) {
  const nasze = druzynyMeczu(m);
  if (nasze.length !== 1) return null; // derby lub brak — neutralnie
  const z = nasze[0];
  const [a, b] = m.wynik.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let my, rywal;
  if (stronaNasza(m.gospodarz, z) && !stronaNasza(m.gosc, z)) {
    my = a; rywal = b;
  } else if (stronaNasza(m.gosc, z) && !stronaNasza(m.gospodarz, z)) {
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
    elO.innerHTML = zDnia.map((m) => wierszMeczuPaska(
      etykietaLigi(m.liga)
      + `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
      + `<span class="matchbar-score t-nums">${esc(m.wynik)}</span>`
      + `<span class="matchbar-team">${esc(m.gosc)}</span>`,
    )).join("");
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

function renderKartyDruzyn(dane, mecze) {
  const wrap = $("#karty-druzyn");
  wrap.innerHTML = dane.zespoly.map((z) => `
    <article class="card team-card">
      <h3 class="t-h4">${esc(z.nazwa)}</h3>
      <p class="t-small">${esc(z.liga)}</p>
      <span class="badge ${z.tryb.startsWith("PZTS") ? "badge--team-pzts" : "badge--team"}">${esc(z.tryb.replace(/\s*·\s*automat\s*$/i, ""))}</span>
      <dl>
        <div class="row"><dt>Stan</dt><dd class="t-nums">${esc(z.stan ?? "—")}</dd></div>
        <div class="row"><dt>Najbliższy</dt><dd class="t-nums">${esc(nastepnyDla(mecze, z.nazwa))}</dd></div>
      </dl>
      ${z.url ? `<a class="source-link" href="${esc(z.url)}" target="_blank" rel="noreferrer">Źródło: tabela ligowa ↗</a>` : ""}
    </article>`).join("");
}

function renderTabele(dane) {
  const tabela = dane.tabele.find((t) => t.klucz === "18/136");
  const tbody = $("#tabela-liga");
  if (!tabela) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted t-small">Tabela niedostępna — spróbuj odświeżyć.</td></tr>`;
    return;
  }
  tbody.innerHTML = tabela.wiersze.map((w) => `
    <tr class="${w.nazwa.includes("Gliwice") ? "is-ours" : ""}">
      <td>${w.pozycja}. ${esc(w.nazwa)}</td>
      <td class="num">${w.mecze}</td>
      <td class="num">${w.punkty}</td>
      <td class="num">${esc(w.stosunek)}</td>
    </tr>`).join("");
  $("#tabela-stan").textContent = formatujZnacznik(tabela.zaktualizowano) ?? "—";
}

function wierszMeczu(m, oczekuje = false) {
  const nasze = druzynyMeczu(m);
  const derby = nasze.length > 1;
  const st = statusMeczu(m);
  const wynikKolor = derby ? "match-score--derby" : st === "W" ? "match-score--W" : st === "P" ? "match-score--P" : "";
  const badge = oczekuje
    ? `<span class="badge badge--pending">wynik w drodze</span>`
    : derby
      ? `<span class="badge badge--derby">derby</span>`
      : st ? `<span class="badge badge--${st}">${st}</span>` : "";
  const etykieta = nasze.length > 0 && !derby ? ` · ${nasze[0]}` : "";
  const zrodlo = m.liga.startsWith("1. Liga") ? "pzts.pl" : "ligi.slzts.pl";
  return `
    <li>
      <div class="match-row">
        <span class="match-date">${formatujDate(m.dataMeczu)}${m.godzina ? ` · g. ${m.godzina}` : ""}</span>
        <span class="match-teams">${esc(m.gospodarz)} — ${esc(m.gosc)}</span>
        <span class="match-score t-nums ${wynikKolor}">${esc(m.wynik)}</span>
        ${badge}
        ${m.kolejka ? `<span class="match-date">kolejka ${m.kolejka}</span>` : ""}
      </div>
      <p class="match-meta">${esc(m.liga)} · ${zrodlo}${etykieta}</p>
    </li>`;
}

function renderMecze(mecze) {
  const dzis = dzisISO();
  // „Najbliższe": przyszłe + te już rozpoczęte, lecz bez wyniku w źródle
  // (kiedyś padnie — plakietka „wynik w drodze" tłumaczy, dlaczego tu wisi).
  const najblizsze = mecze
    .filter((m) => !m.rozegrany && (m.dataMeczu >= dzis || meczRozpoczety(m)))
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? -1 : 1))
    .slice(0, 6);
  const ostatnie = mecze
    .filter((m) => m.rozegrany)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? 1 : -1));

  // 1.7.0: pusty terminarz nie jest błędem — to przerwa w rozgrywkach;
  // piłka (#pilka-kts) spoczywa, komunikat tłumaczy, skąd wezmą się dane.
  $("#najblizsze-mecze").innerHTML = najblizsze.length
    ? najblizsze.map((m) => wierszMeczu(m, meczRozpoczety(m))).join("")
    : `<li class="pusty-stan">
         <svg class="pilka-odpoczyna" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><use href="#pilka-kts"/></svg>
         <span class="t-small muted">Brak zaplanowanych meczów — przerwa w rozgrywkach.</span>
       </li>`;
  $("#ostatnie-mecze").innerHTML = ostatnie.length
    ? ostatnie.map((m) => wierszMeczu(m)).join("")
    : `<li class="t-small muted">Brak rozegranych meczów w bazie.</li>`;
}

function renderBadges(dane, ok) {
  $("#badge-sezon").textContent = `Sezon ${dane.sezon}`;
  const live = $("#badge-live");
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

/* ===== wersja strony (wersja.json przy deployu) ===== */
async function pokazWersje() {
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const w = await res.json();
    if (w?.wersja) {
      $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
      return w.wersja; // 1.7.5: punkt odniesienia dla „w międzyczasie wyszła nowa wersja"
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
   • Nowa wersja strony (deploy w międzyczasie) → komunikat z przyciskiem
     „Odśwież stronę”. NIGDY nie przeładowujemy karty sami — czytanie
     święte.
   • Koszt: fetch z cache:"no-cache" to rewalidacja ETag (304 = kilkadziesiąt
     bajtów); przy okazji odświeża się panel „Automat” (runs.json) i
     znacznik „Ostatni odczyt”. Komunikat w ukrytej karcie czeka na
     powrót gościa — żeby go nie ominął.

   Uchwyt window._ktsSprawdzDane — wymuszone sprawdzenie z konsoli
   (testy automatu, debugging). */

const SWIEZOSC = {
  tekst: null,            // ostatni surowy dane.json (identyczny tekst = cisza)
  dane: null,             // ostatnie sparsowane dane
  wersjaStartowa: null,    // wersja strony z chwili załadowania karty
  wersjaZgloszona: false, // czy komunikat o nowej wersji już się pokazał
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
  if (btn) btn.addEventListener("click", () => location.reload());
  requestAnimationFrame(() => TOAST.el.classList.add("widoczny"));
  clearTimeout(TOAST.timer);
  TOAST.timer = setTimeout(ukryjToast, z.odswiez ? 20_000 : 8_000);
}

function ukryjToast() {
  if (!TOAST.el) return;
  TOAST.el.classList.remove("widoczny");
  clearTimeout(TOAST.timer);
}

/** Przerysowanie wszystkich sekcji danymi — identyczne funkcje jak przy
 *  starcie (podmieniają tylko wnętrza, scroll i menu zostają nietknięte). */
function przerysujDane(dane, animujPilke) {
  const mecze = meczeZDanych(dane);
  renderPasekMeczu(mecze);
  renderKartyDruzyn(dane, mecze);
  renderTabele(dane);
  renderMecze(mecze);
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
    // czy w międzyczasie nie wyszła nowa wersja strony?
    if (SWIEZOSC.wersjaStartowa && !SWIEZOSC.wersjaZgloszona) {
      try {
        const rw = await fetch("wersja.json", { cache: "no-cache" });
        if (rw.ok) {
          const w = await rw.json();
          if (w?.wersja && w.wersja !== SWIEZOSC.wersjaStartowa) {
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

/* ===== galeria: teaser okładek (pełna galeria na podstronie) ===== */
async function renderTeaserGalerii() {
  const wrap = $("#gal-teaser");
  const badge = $("#gal-count");
  if (!wrap) return;
  try {
    const res = await fetch("galeria.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const albumy = await res.json();
    albumy.sort((a, b) => {
      const da = a.data ?? "", db = b.data ?? "";
      return da > db ? -1 : da < db ? 1 : 0;
    });
    if (badge) {
      const n = albumy.reduce((s, a) => s + a.zdjecia.length, 0);
      badge.textContent = `${albumy.length} albumów · ${n} zdjęć`;
    }
    wrap.innerHTML = albumy.slice(0, 6).map((a) => {
      const mini = (a.miniatury && a.miniatury[0]) || a.zdjecia[0];   // v1.5.0: miniatura WebP
      const lqip = a.lqip && a.lqip[0];                              // v1.5.0: placeholder blur-up
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
  } catch (err) {
    console.error("Błąd ładowania galeria.json:", err);
    if (badge) badge.textContent = "galeria niedostępna";
  }
}

/* ===== start ===== */
async function start() {
  // tryb dzień/noc (ikona + klik) i menu mobilne
  obsluzPrzelacznikTrybu();
  pokazWersje().then((w) => { SWIEZOSC.wersjaStartowa = w; });
  pokazPrzebiegiSyncu();
  renderTeaserGalerii();
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
    // Mecze z odsianiem dat zastępczych źródeł (ŚZTS wstawia „2026-00-00"
    // dla meczów bez terminu) — wiersz z niepoprawną datą nie może trafić
    // na pasek meczowy (wisi tam jako „Wynik w drodze · 00.00.2026"),
    // do kart drużyn ani list wyników. Parser też je odsiewa — to
    // podwójne zabezpieczenie (bug z 10.10, zgłoszenie Tomka).
    const mecze = meczeZDanych(dane);
    renderPasekMeczu(mecze);
    renderKartyDruzyn(dane, mecze);
    renderTabele(dane);
    renderMecze(mecze);
  }
  renderBadges(dane ?? {}, ok);
  // 1.7.5: pętla świeżości rusza ZAWSZE — także po błędzie startu
  // (pierwsze udane sprawdzenie naprawia stronę bez odświeżania karty)
  SWIEZOSC.tekst = ok ? tekstDanych : null;
  SWIEZOSC.dane = ok ? dane : null;
  pilnujSwiezosci();
}

document.addEventListener("DOMContentLoaded", start);
