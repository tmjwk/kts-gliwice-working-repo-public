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

/** Następny mecz dla drużyny (tekst "30.09 · Górnik Bobowa"). */
function nastepnyDla(mecze, nazwa) {
  const dzis = new Date().toISOString().slice(0, 10);
  const przyszle = mecze
    .filter((m) => !m.rozegrany && m.dataMeczu >= dzis && druzynyMeczu(m).includes(nazwa))
    .sort((x, y) => (x.dataMeczu < y.dataMeczu ? -1 : 1));
  const m = przyszle[0];
  if (!m) return "—";
  const rywal = stronaNasza(m.gospodarz, nazwa) ? m.gosc : m.gospodarz;
  return `${formatujDate(m.dataMeczu)} · ${rywal}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ===== render ===== */
function renderPasekMeczu(mecze) {
  const rozegrane = mecze.filter((m) => m.rozegrany).sort((a, b) => (a.dataMeczu < b.dataMeczu ? 1 : -1));
  const dzis = new Date().toISOString().slice(0, 10);
  const przyszle = mecze.filter((m) => !m.rozegrany && m.dataMeczu >= dzis)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? -1 : 1));

  const elO = $("#ostatni-wynik");
  const elN = $("#najblizszy-mecz");
  const o = rozegrane[0];
  elO.textContent = o
    ? `${formatujDate(o.dataMeczu)} · ${o.gospodarz} ${o.wynik} ${o.gosc}`
    : "Wyniki pojawią się po pierwszej synchronizacji";
  const n = przyszle[0];
  elN.textContent = n
    ? `Najbliższy mecz: ${formatujDate(n.dataMeczu)}${n.godzina ? ` g. ${n.godzina}` : ""} · ${n.gospodarz} — ${n.gosc}`
    : "Najbliższy mecz: wg terminarza";
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

function wierszMeczu(m) {
  const nasze = druzynyMeczu(m);
  const derby = nasze.length > 1;
  const st = statusMeczu(m);
  const wynikKolor = derby ? "match-score--derby" : st === "W" ? "match-score--W" : st === "P" ? "match-score--P" : "";
  const badge = derby
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
  const dzis = new Date().toISOString().slice(0, 10);
  const najblizsze = mecze
    .filter((m) => !m.rozegrany && m.dataMeczu >= dzis)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? -1 : 1))
    .slice(0, 6);
  const ostatnie = mecze
    .filter((m) => m.rozegrany)
    .sort((a, b) => (a.dataMeczu < b.dataMeczu ? 1 : -1));

  $("#najblizsze-mecze").innerHTML = najblizsze.length
    ? najblizsze.map(wierszMeczu).join("")
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
  $("#ostatni-sync").textContent =
    `Ostatni sync: PZTS ${sPzts ?? "—"} · ŚZTS ${sSzts ?? "—"}`;
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

/* ===== aktywność automatu: ostatnie 3 uruchomienia workflow =====
   Publiczne API GitHuba (repo jest publiczne — pobierane z przeglądarki
   gościa, limit 60 zapytań/h na IP — dla strony klubowej zapas ogromny).
   Pokazuje KAŻDY run, także pusty („bez zmian w danych”): ✓ = sukces,
   ✗ = błąd, … = w trakcie. „Ostatni sync” obok pokazuje ostatnią REALNĄ
   zmianę danych (commity powstają tylko przy realnej zmianie). */
async function pokazAktywnoscCrona() {
  const el = $("#cron-aktywnosc");
  if (!el) return;
  try {
    const res = await fetch(
      "https://api.github.com/repos/tmjwk/kts-gliwice-working-repo-public" +
        "/actions/workflows/sync-dane.yml/runs?per_page=3",
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return; // np. chwilowy limit zapytań — po prostu nie pokazujemy
    const dane = await res.json();
    const runy = (dane.workflow_runs ?? []).slice(0, 3);
    if (!runy.length) return;
    const znak = (r) => (r.status !== "completed" ? "…" : r.conclusion === "success" ? "✓" : "✗");
    const czas = (iso) => {
      const d = new Date(iso);
      const dzien = d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });
      const godz = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
      return `${dzien} ${godz}`;
    };
    el.textContent = "Cron: " + runy.map((r) => `${czas(r.created_at)} ${znak(r)}`).join(" · ");
    el.title =
      "Ostatnie 3 uruchomienia automatu synchronizacji. ✓ = zakończony sukcesem, " +
      "✗ = błąd, … = w trakcie. Pusty przebieg (bez zmian danych) jest normalny — " +
      "„Ostatni sync” pokazuje moment ostatniej realnej zmiany danych.";
  } catch (e) { /* sieć — sekcja milczy */ }
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
  pokazAktywnoscCrona();
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
    $("#karty-druzyn").innerHTML =
      `<p class="t-small muted">Dane chwilowo niedostępne — odśwież stronę.</p>`;
    $("#badge-sezon").textContent = "Sezon —";
  }

  if (ok) {
    const mecze = [...(dane.meczeSzts ?? []), ...(dane.meczePzts ?? [])];
    renderPasekMeczu(mecze);
    renderKartyDruzyn(dane, mecze);
    renderTabele(dane);
    renderMecze(mecze);
  }
  renderBadges(dane ?? {}, ok);
}

document.addEventListener("DOMContentLoaded", start);
