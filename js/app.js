/* ============================================================
   KTS Gliwice — strona statyczna: render danych ligowych z dane.json
   (wersja js warsztatu site-skeleton, przystosowana do statyki)
   ============================================================ */
"use strict";

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

/* ===== start ===== */
async function start() {
  // hamburger (mobile)
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
