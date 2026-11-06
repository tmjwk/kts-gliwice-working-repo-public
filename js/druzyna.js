/* ============================================================
   KTS Gliwice — DRUŻYNA (1.12.0): podstrona jednej drużyny.
   Renderuje się z dane.json wg ?id=<slug> (slug wg slugZespolu —
   ten sam algorytm co w js/app.js; linki produkuje dialog drużyny
   na stronie głównej). Pełny widok: tabela ligowa z podświetlonym
   naszym wierszem, terminarz + wyniki meczów, skład ze statystykami
   (gdy sync dostarczy dane.sklady), źródła.

   UWAGA PORZĄDKOWA: pomocnicze funkcje (esc, daty, dopasowania
   drużyn) są ŚWIADOMIE zdublowane z js/app.js — app.js renderuje
   stronę główną i zakłada jej strukturę (pasek meczowy, sekcje),
   więc wspólne wydzielenie wymagałoby refaktoru live kodu.
   Duplikacja jest mała, statyczna i udokumentowana.
   ============================================================ */
"use strict";

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

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

function dzisISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** „dziś” / „jutro” / „21.09.2026” */
function etykietaDnia(iso) {
  const dzis = dzisISO();
  if (iso === dzis) return "dziś";
  const j = new Date();
  j.setDate(j.getDate() + 1);
  const jutro = `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, "0")}-${String(j.getDate()).padStart(2, "0")}`;
  if (iso === jutro) return "jutro";
  return formatujDate(iso);
}

function meczRozpoczety(m) {
  if (m.rozegrany) return false;
  const dzis = dzisISO();
  if (m.dataMeczu < dzis) return true;
  if (m.dataMeczu === dzis && m.godzina) {
    const [g, mi] = m.godzina.split(":").map(Number);
    const n = new Date();
    return n.getHours() > g || (n.getHours() === g && n.getMinutes() >= mi);
  }
  return false;
}

function normNazwa(nazwa) {
  return nazwa.replace(" · amatorzy", "").trim();
}

function druzynyMeczu(m) {
  return m.zespoly ? m.zespoly : m.zespol ? [m.zespol] : [];
}

function slugZespolu(nazwa) {
  const mapa = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  return String(nazwa).toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => mapa[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tabela ligowa drużyny: jawne wiązanie (z.tabela z syncu) albo po nazwie ligi. */
function tabelaDlaZespolu(dane, z) {
  const tabele = dane?.tabele ?? [];
  if (z.tabela) {
    const t = tabele.find((x) => x.klucz === z.tabela);
    if (t) return t;
  }
  return tabele.find((x) => x.nazwa === z.liga) ?? null;
}

/** Nasz wiersz: najpierw jawne wiązanie z syncu (z.wiersz), potem
 *  heurystyki (dokładnie → granica słowa; KTS II ≠ KTS III). */
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

function meczeDruzyny(mecze, nazwa) {
  return mecze.filter((m) => druzynyMeczu(m).includes(nazwa));
}

function skladDlaZespolu(dane, z) {
  const cel = slugZespolu(z.nazwa);
  return (dane?.sklady ?? []).find((s) => slugZespolu(s.zespol) === cel) ?? null;
}

/** Status meczu z perspektywy TEJ drużyny: W/P/R lub null (derby).
 *  1.28.0: dopasowanie strony meczu po nazwie karty ALBO jej nazwie
 *  u źródła (zespol.wiersz — PZTS: karta „KTS Gliwice I” gra w meczu
 *  jako „KTS Gliwice”), jak statusMeczuKarty piłeczek formy w app.js;
 *  wcześniej mecze 1. ligi PZTS nie dostawały tu W/P/R. */
function statusMeczuDla(m, zespol) {
  const [a, b] = m.wynik.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const kandydaci = [zespol.nazwa, zespol.wiersz].filter(Boolean);
  const pasuje = (strona) => kandydaci.some((n) => {
    const nn = normNazwa(n);
    return strona === nn || strona.startsWith(nn + " ") || strona.startsWith(nn + "·");
  });
  const myIsHost = pasuje(m.gospodarz);
  const myIsGuest = pasuje(m.gosc);
  let my, rywal;
  if (myIsHost && !myIsGuest) { my = a; rywal = b; }
  else if (myIsGuest && !myIsHost) { my = b; rywal = a; }
  else return null;
  if (my > rywal) return "W";
  if (my < rywal) return "P";
  return "R";
}

/** Wiersz meczu dla widoku drużyny (bez powtarzania ligi w meta).
 *  1.29.5 (właściciel 06.11: „nie wyświetlasz informacji konsystentnie —
 *  brakuje w niektórych wierszach daty, godz. i kolejki”): DOKŁADNIE
 *  ta sama struktura DOM co wierszMeczu w js/app.js (dialog „Wyniki”
 *  i kafelki na stronie głównej): .match-glowne (drużyny + wynik +
 *  plakietka) i .match-info (data · godzina · kolejka) — a CSS
 *  (v1.29.5) stawia .match-info ZAWSZE w drugiej linii wiersza,
 *  na każdej szerokości. Do 1.29.4 podstrona miała własny układ:
 *  pięć równorzędnych elementów .match-row zawijało się dowolnie
 *  (data przed nazwami, kolejka po plakiecie — 3–4 nieregularne
 *  linie na telefonie) i wyglądało inaczej niż dialog. */
function wierszMeczuDruzyny(m, zespol) {
  const derby = druzynyMeczu(m).length > 1;
  const st = statusMeczuDla(m, zespol);
  const wynikKolor = derby ? "match-score--derby" : st === "W" ? "match-score--W" : st === "P" ? "match-score--P" : st === "R" ? "match-score--R" : ""; /* 1.28.0: remis = amber (dotąd bez koloru) — jednolity system z app.js */
  const badge = derby
    ? `<span class="badge badge--derby">derby</span>`
    : st ? `<span class="badge badge--${st}">${st}</span>` : "";
  const oczekuje = !m.rozegrany && meczRozpoczety(m);
  return `
    <li>
      <div class="match-row">
        <span class="match-glowne">
          <span class="match-teams">${esc(m.gospodarz)} — ${esc(m.gosc)}</span>
          <span class="match-score t-nums ${wynikKolor}">${esc(m.wynik)}</span>
          ${oczekuje ? `<span class="badge badge--pending">wynik w drodze</span>` : badge}
        </span>
        <span class="match-info">
          <span class="match-date">${etykietaDnia(m.dataMeczu)}${m.godzina ? ` · g. ${esc(m.godzina)}` : ""}</span>
          ${m.kolejka ? `<span class="match-date match-kolejka">· kolejka ${m.kolejka}</span>` : ""}
        </span>
      </div>
      ${!derby ? "" : `<p class="match-meta">mecze wewnątrzklubowe — punkty dla obu drużyn wg regulaminy</p>`}
    </li>`;
}

function htmlTabeli(tabela, naszWiersz) {
  const kol4 = tabela.kolumna4 || "Sety";   // v1.12.1: PZTS = „Z–R–P”
  return `<div class="table-scroll">
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

function htmlSkladu(sklad) {
  const z = sklad.zawodnicy ?? [];
  const maSkutecznosc = z.some((x) => x.skutecznosc);
  let host = "—";
  try { host = new URL(sklad.zrodlo).hostname; } catch { /* bez źródła */ }
  return `<div class="table-scroll">
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
      ? `<a href="${esc(sklad.zrodlo)}" target="_blank" rel="noreferrer">${esc(host)}</a>` : "—"}
      · stan: <span class="t-nums">${formatujZnacznik(sklad.zaktualizowano) ?? "—"}</span></p>`;
}

/* ===== UI: tryb dzień/noc + menu mobilne (jak na stronie głównej) ===== */
function ustawIkoneTrybu() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  const noc = document.documentElement.getAttribute("data-theme") === "night";
  btn.textContent = noc ? "☀️" : "🌙";
  btn.setAttribute("aria-label", noc ? "Włącz tryb dzienny" : "Włącz tryb nocny");
  btn.setAttribute("aria-pressed", String(noc));
}

/* ===== 1.28.4: NOWA WERSJA STRONY — komunikat jak na stronie głównej =====
   Konwencja i pełna historia: js/app.js (WERSJA_KODU, sekcja „1.28.4”).
   Podstrony sprawdzają PRZY WEJŚCIU (razem z wersją do stopki) — cykliczne
   odpytywanie jak na stronie głównej (SWIEZOSC) tu nie jest potrzebne:
   nawigacja po stronie to pełne przeładowania, a długo otwarte karty to
   wzorzec strony głównej z wynikami. „Odśwież stronę” omija cache
   przeglądarki (GitHub Pages trzyma pliki ~10 min) — dociąga HTML,
   skrypty i styl, dopiero potem przeładowuje. */
const WERSJA_KODU = "1.29.6";

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

/** Toast na dole ekranu (klasy jak .toast-danych z app.js — styl wspólny
 *  w css/style.css): znika sam po 20 s, klik w tło zamyka, przycisk
 *  przeładowuje stronę z ominięciem cache. */
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
    setTimeout(() => el.remove(), 400); // czas na fade-out (transition 0.25 s)
  }, 20_000);
}

(async function start() {
  // tryb dzień/noc
  const btn = $("#theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const terazNoc = document.documentElement.getAttribute("data-theme") === "night";
      const nowy = terazNoc ? "day" : "night";
      document.documentElement.setAttribute("data-theme", nowy);
      try { localStorage.setItem("kts-theme", nowy); } catch (e) { /* prywatny */ }
      ustawIkoneTrybu();
    });
  }
  ustawIkoneTrybu();

  // menu mobilne
  const hamburger = $("#hamburger");
  const nav = $("#nav");
  if (hamburger && nav) {
    hamburger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      hamburger.setAttribute("aria-expanded", String(open));
    });
  }

  // wersja w stopce + 1.28.4: komunikat, gdy na serwerze czeka nowsza wersja
  // (porównanie z WERSJA_KODU — ten sam skutek co na stronie głównej;
  // ukryta przy otwieraniu karta pomija komunikat — dogoni go przy
  // kolejnym wejściu, bo nawigacja po stronie to pełne przeładowania)
  try {
    const rw = await fetch("wersja.json", { cache: "no-cache" });
    /* 1.26.2: opis wersji trafia do STOPKI — jedno krótkie zdanie, bez atrybucji (konwencja, szczegóły: app.js pokazWersje) */
    if (rw.ok) {
      const w = await rw.json();
      if (w?.wersja) {
        $("#wersja-strony").textContent =
          `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
        if (!document.hidden && nowszaWersja(w.wersja, WERSJA_KODU)) zglosNowaWersje(w.wersja);
      }
    }
  } catch { /* brak pliku — zostaje „wersja —” */ }

  // drużyna z ?id=
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const kontener = $("#druzyna-tresc");
  let dane = null;
  try {
    const res = await fetch("dane.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dane = await res.json();
  } catch (err) {
    kontener.innerHTML =
      `<div class="card card-pad"><p class="t-small muted">Nie udało się pobrać danych — odśwież stronę.</p></div>`;
    return;
  }

  const zespol = (dane.zespoly ?? []).find((z) => slugZespolu(z.nazwa) === id);
  if (!zespol) {
    $("#druzyna-nazwa").textContent = "Nie znaleziono drużyny";
    $("#druzyna-liga").textContent = "";
    kontener.innerHTML = `
      <div class="card card-pad">
        <p class="t-small muted">Link prowadzi do drużyny, której nie ma w bieżącym sezonie
        (zmiana składu zespołów w danych). Wróć do listy drużyn i wybierz aktualną.</p>
        <p style="margin-top: 0.75rem;"><a class="btn btn-outline btn-sm" href="index.html#druzyny-wyniki">← Drużyny i wyniki</a></p>
      </div>`;
    return;
  }

  // nagłówek
  document.title = `${zespol.nazwa} — KTS Gliwice`;
  $("#druzyna-nazwa").textContent = zespol.nazwa;
  $("#druzyna-liga").textContent = zespol.liga;
  $("#druzyna-badges").innerHTML = `
    <span class="badge ${zespol.tryb.startsWith("PZTS") ? "badge--team-pzts" : "badge--team"}">
      ${esc(zespol.tryb.replace(/\s*·\s*automat\s*$/i, ""))}</span>
    <span class="badge badge-outline-primary t-nums">${esc(zespol.stan ?? "—")}</span>
    <span class="badge badge-live">dane live · auto-sync</span>`;

  const mecze = [...(dane.meczeSzts ?? []), ...(dane.meczePzts ?? [])]
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(m.dataMeczu ?? ""));
  const nasze = meczeDruzyny(mecze, zespol.nazwa);
  const tabela = tabelaDlaZespolu(dane, zespol);
  const naszWiersz = wierszDlaZespolu(tabela, zespol);
  const sklad = skladDlaZespolu(dane, zespol);

  // v1.12.3: sortowanie z GODZINĄ jako drugim kluczem (mecze z tego samego
  // dnia w kolejności chronologicznej) — spójnie z zakładką „Wyniki” dialogu.
  const poDacie = (a, b) => (a.dataMeczu === b.dataMeczu ? 0 : a.dataMeczu < b.dataMeczu ? -1 : 1);
  const poGodzinie = (a, b) => (a.godzina ?? "").localeCompare(b.godzina ?? "");
  const odNajstarszego = (a, b) => poDacie(a, b) || poGodzinie(a, b);
  const odNajnowszego = (a, b) => -odNajstarszego(a, b);

  const wDrodze = nasze.filter(meczRozpoczety).sort(odNajnowszego);
  const przyszle = nasze.filter((m) => !m.rozegrany && !meczRozpoczety(m)).sort(odNajstarszego);
  const rozegrane = nasze.filter((m) => m.rozegrany).sort(odNajnowszego);

  const zrodloHost = (() => {
    try { return new URL(zespol.url).hostname; } catch { return "źródło"; }
  })();

  kontener.innerHTML = `
    <div class="grid grid-2 gap-lg results-grid" style="margin-top: 1.25rem;">
      <div class="card card-pad">
        <p class="table-caption">${esc(tabela ? tabela.nazwa : zespol.liga)} — tabela, sync na żywo</p>
        ${tabela
          ? htmlTabeli(tabela, naszWiersz)
          : `<p class="t-small muted">Pełna tabela tej ligi jeszcze nie płynie z automatycznego
             odczytu (pzts.pl czytany mostem Google Sheets — rozszerzenie w toku).
             Tabela u źródła: ${zespol.url
                ? `<a href="${esc(zespol.url)}" target="_blank" rel="noreferrer">↗</a>` : "—"}.</p>`}
        <p class="t-small muted source-note">
          Źródło: ${zespol.url
            ? `<a href="${esc(zespol.url)}" target="_blank" rel="noreferrer">${esc(zrodloHost)}</a>` : "—"}
          ${tabela ? ` · stan: <span class="t-nums">${formatujZnacznik(tabela.zaktualizowano) ?? "—"}</span>` : ""}
        </p>
      </div>
      <div class="card card-pad">
        <p class="list-title">📅 Najbliższe mecze</p>
        <ul class="divide-list">${(wDrodze.length + przyszle.length)
          ? [...wDrodze, ...przyszle].map((m) => wierszMeczuDruzyny(m, zespol)).join("")
          : `<li class="t-small muted">Brak zaplanowanych meczów — przerwa w rozgrywkach.</li>`}</ul>
        <p class="list-title list-title-gap">🏆 Rozegrane mecze</p>
        <ul class="divide-list">${rozegrane.length
          ? rozegrane.map((m) => wierszMeczuDruzyny(m, zespol)).join("")
          : `<li class="t-small muted">Brak rozegranych meczów w danych.</li>`}</ul>
      </div>
    </div>
    ${sklad && sklad.zawodnicy?.length ? `
    <div class="card card-pad" style="margin-top: 1.5rem;">
      <p class="table-caption">Skład i statystyki indywidualne — sezon ${esc(dane.sezon ?? "")}</p>
      ${htmlSkladu(sklad)}
    </div>` : ""}`;
})();
