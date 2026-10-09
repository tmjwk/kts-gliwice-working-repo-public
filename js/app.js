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
      `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
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
        `<span class="matchbar-team">${esc(m.gospodarz)}</span>`
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
      (m.godzina ? `<span class="matchbar-hour t-nums">g. ${esc(m.godzina)}</span>` : "")
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
      <span class="badge ${z.tryb.startsWith("PZTS") ? "badge--team-pzts" : "badge--team"}">${esc(z.tryb)}</span>
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
      <p class="match-meta">${esc(m.liga)} · ${zrodlo} · automat${etykieta}</p>
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

  $("#najblizsze-mecze").innerHTML = najblizsze.length
    ? najblizsze.map((m) => wierszMeczu(m, meczRozpoczety(m))).join("")
    : `<li class="t-small muted">Terminarz pojawi się po pierwszej synchronizacji.</li>`;
  $("#ostatnie-mecze").innerHTML = ostatnie.length
    ? ostatnie.map(wierszMeczu).join("")
    : `<li class="t-small muted">Brak rozegranych meczów w bazie.</li>`;
}

function renderBadges(dane, ok) {
  $("#badge-sezon").textContent = `Sezon ${dane.sezon}`;
  const live = $("#badge-live");
  if (ok) {
    live.textContent = "dane live · auto-sync";
    live.classList.add("badge-live");
  } else {
    live.textContent = "błąd ładowania danych";
    live.classList.add("badge-live--warn");
  }
  const sSzts = formatujZnacznik(dane.ostatniSync?.szts);
  const sPzts = formatujZnacznik(dane.ostatniSync?.pzts);
  const elSync = $("#ostatni-sync");
  elSync.textContent =
    `Ostatnia zmiana danych: PZTS ${sPzts ?? "—"} · ŚZTS ${sSzts ?? "—"}`;
  elSync.title =
    "Moment ostatniej REALNEJ zmiany danych (commit w repo) — nie każde " +
    "uruchomienie automatu coś zmienia; puste przebiegi są normalne.";
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
    if (!res.ok) return;
    const w = await res.json();
    if (w?.wersja) $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
}

/* ===== przebiegi automatu: runs.json (zapisywany przy KAŻDYM uruchomieniu) =====
   Konwencja uzgodniona z właścicielem (01.10.2026):
     ✓ = automat wystartował i ODCZYTAŁ dane ze źródeł — sukces, TAKŻE gdy
         danych nie zmienił („bez zmian" to również sukces, nie błąd),
     ✗ = automat wystartował, ale źródło nie odpowiedziało (timeout / 0 B),
     BRAK WPISU między godzinami = slot co 2 h pominięty przez GitHub
         (normalne na darmowym planie — przerwy 4-8 h).
   Źródło: runs.json (same-origin, bez limitów API); ostatnie 50 przebiegów.
   „Ostatnia zmiana danych" obok = moment ostatniej REALNEJ zmiany (commit). */
async function pokazPrzebiegiSyncu() {
  const el = $("#cron-aktywnosc");
  const elO = $("#cron-ostatni-odczyt");
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
      "Pierwszy wpis pojawi się po najbliższym uruchomieniu crona.";
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
  const opisRunu = (r) => {
    if (r.szts !== "ok") return "✗ źródło bez odpowiedzi";
    let txt = r.zmieniono ? (r.zmiany && r.zmiany !== "—" ? r.zmiany : "zmiana danych") : "bez zmian";
    if (r.pzts === "blad-czytnika") txt += " · PZTS czytnik ✗";
    if (r.pzts === "recznie") txt += " · PZTS wklejka";
    return `✓ ${txt}`;
  };
  const ostatnie3 = runs.slice(-3).reverse(); // najnowszy pierwszy
  el.textContent = "Automat: " + ostatnie3.map((r) => `${etykietaCzasu(r.start)} ${opisRunu(r)}`).join(" · ");
  el.title =
    "Ostatnie uruchomienia automatu (cron co 2 h). ✓ = dane odczytane — także bez zmian; " +
    "✗ = źródło nie odpowiedziało; brak wpisu między godzinami = slot pominięty przez " +
    "GitHub (przerwy 4-8 h są normalne). Szczegóły techniczne: runs.json w repo.";
  if (elO) {
    const ostatniOk = [...runs].reverse().find((r) => r.szts === "ok");
    if (ostatniOk) {
      const min = Math.round((Date.now() - new Date(ostatniOk.start).getTime()) / 60_000);
      const temu =
        min < 1 ? "właśnie teraz" :
        min < 60 ? `${min} min temu` :
        min < 2_880 ? `${Math.round(min / 60)} godz. temu` :
        `${Math.round(min / 1_440)} dni temu`;
      elO.textContent = `Ostatni udany odczyt: ${etykietaCzasu(ostatniOk.start)} (${temu})`;
      elO.title = "Moment ostatniego przebiegu, w którym dane ze źródeł zostały odczytane pomyślnie.";
    }
  }
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
  pokazWersje();
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
  try {
    const res = await fetch("dane.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dane = await res.json();
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
    // Ochrona przed datami zastępczymi źródeł (ŚZTS wstawia „2026-00-00"
    // dla meczów bez terminu): wiersz z niepoprawną datą nie może trafić
    // na pasek meczowy (wisi tam jako „Wynik w drodze · 00.00.2026"),
    // do kart drużyn ani list wyników. Parser też je odsiewa — to
    // podwójne zabezpieczenie (bug z 10.10, zgłoszenie Tomka).
    const mecze = [...(dane.meczeSzts ?? []), ...(dane.meczePzts ?? [])]
      .filter((m) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(m.dataMeczu ?? ""));
    renderPasekMeczu(mecze);
    renderKartyDruzyn(dane, mecze);
    renderTabele(dane);
    renderMecze(mecze);
  }
  renderBadges(dane ?? {}, ok);
}

document.addEventListener("DOMContentLoaded", start);
