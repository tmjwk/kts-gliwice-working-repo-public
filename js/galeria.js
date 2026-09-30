/* ============================================================
   KTS Gliwice — galeria (podstrona): render z galeria.json,
   filtry roku, lightbox (klawiatura + swipe), tryb dzień/noc.
   Samodzielny skrypt podstrony (nie wymaga app.js).
   ============================================================ */
"use strict";

/* ===== zawsze startuj od nagłówka strony — jak w app.js (v1.3.2) =====
   Patrz komentarz w js/app.js: skok natychmiastowy (bez animacji),
   obsługa przywrócenia karty z pamięci (pageshow persisted),
   kotwica uszanowana tylko przy wejściu z naszej domeny. */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const _naszReferrer = (() => {
  try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
  catch { return false; }
})();

const _naGoreNatychmiast = () => {
  if (location.hash && _naszReferrer) return;
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  } catch {
    const html = document.documentElement, org = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    html.style.scrollBehavior = org;
  }
};

// kotwica zdejmowana natychmiast (przed przewinięciem Chrome do fragmentu)
// — tylko dla wejść spoza naszej domeny:
if (location.hash && !_naszReferrer) {
  history.replaceState(null, "", location.pathname + location.search);
}
_naGoreNatychmiast();
window.addEventListener("load", () => {
  _naGoreNatychmiast();
  setTimeout(_naGoreNatychmiast, 200);
  setTimeout(_naGoreNatychmiast, 600);
});
window.addEventListener("pageshow", (e) => { if (e.persisted) _naGoreNatychmiast(); });

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatujDate(iso) {
  if (!iso) return "";
  const [r, m, d] = iso.split("-");
  return `${d}.${m}.${r}`;
}

/* ===== dane + stan ===== */
let GALERIA = [];
let FILTR = null; // null = wszystkie lata

/* ===== tryb dzień/noc (jak app.js) ===== */
function ustawIkoneTrybu() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  const noc = document.documentElement.getAttribute("data-theme") === "night";
  btn.textContent = noc ? "☀️" : "🌙";
  btn.setAttribute("aria-label", noc ? "Włącz tryb dzienny" : "Włącz tryb nocny");
  btn.setAttribute("aria-pressed", String(noc));
}

/* ===== render ===== */
function renderStatystyki() {
  const nZdjec = GALERIA.reduce((s, a) => s + a.zdjecia.length, 0);
  $("#gal-statystyki").textContent = `${GALERIA.length} albumów · ${nZdjec} zdjęć`;
}

function renderFiltry() {
  const lata = [...new Set(GALERIA.map((a) => (a.data || "").slice(0, 4)).filter(Boolean))]
    .sort().reverse();
  const wrap = $("#gal-filtry");
  const chip = (label, wartosc, aktywny) => `
    <button class="gal-chip${aktywny ? " is-aktywny" : ""}" type="button"
            data-rok="${wartosc ?? ""}">${esc(label)}</button>`;
  wrap.innerHTML = chip("Wszystkie", "", FILTR === null)
    + lata.map((r) => chip(r, r, FILTR === r)).join("");
  wrap.querySelectorAll(".gal-chip").forEach((b) => {
    b.addEventListener("click", () => {
      FILTR = b.dataset.rok === "" ? null : b.dataset.rok;
      renderFiltry();
      renderAlbumy();
    });
  });
}

function renderAlbumy() {
  const widoczne = GALERIA.filter((a) => !FILTR || (a.data || "").startsWith(FILTR));
  const kontener = $("#gal-albumy");
  if (widoczne.length === 0) {
    kontener.innerHTML = `<p class="t-small muted">Brak albumów w tym roku.</p>`;
    return;
  }
  kontener.innerHTML = widoczne.map((a) => {
    const idx = GALERIA.indexOf(a);
    const fotosy = a.zdjecia.map((src, i) => `
      <button class="gal-foto" type="button" data-album="${idx}" data-foto="${i}"
              aria-label="Powiększ zdjęcie ${i + 1} z albumu ${esc(a.tytul)}">
        <img src="${esc(src)}" alt="${esc(a.tytul)} — zdjęcie ${i + 1}" loading="lazy">
      </button>`).join("");
    return `
      <article class="gal-album" id="album-${esc(a.slug)}">
        <div class="gal-album-head">
          <h2 class="gal-album-tytul">${esc(a.tytul)}</h2>
          <span class="gal-album-meta t-nums">
            ${a.data ? formatujDate(a.data) : ""} · ${a.zdjecia.length} zdjęć · ${esc(a.zrodlo ?? "")}
          </span>
        </div>
        <div class="gal-siatka">${fotosy}</div>
      </article>`;
  }).join("");

  kontener.querySelectorAll(".gal-foto").forEach((btn) => {
    btn.addEventListener("click", () => {
      otworzLightbox(Number(btn.dataset.album), Number(btn.dataset.foto));
    });
  });
}

/* ===== lightbox ===== */
const LB = { album: 0, foto: 0 };

function lbPokaz() {
  const a = GALERIA[LB.album];
  if (!a) return;
  LB.foto = Math.max(0, Math.min(LB.foto, a.zdjecia.length - 1));
  $("#gal-lb-img").src = a.zdjecia[LB.foto];
  $("#gal-lb-img").alt = `${a.tytul} — zdjęcie ${LB.foto + 1}`;
  $("#gal-lb-tytul").textContent = a.tytul;
  $("#gal-lb-licznik").textContent = `· ${LB.foto + 1} / ${a.zdjecia.length}`;
}

function otworzLightbox(album, foto) {
  LB.album = album;
  LB.foto = foto;
  const el = $("#gal-lightbox");
  el.hidden = false;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
  lbPokaz();
  $("#gal-lb-zamknij").focus();
}

function zamknijLightbox() {
  const el = $("#gal-lightbox");
  el.classList.remove("open");
  el.hidden = true;
  document.body.style.overflow = "";
}

/* klawiatura */
document.addEventListener("keydown", (e) => {
  const el = $("#gal-lightbox");
  if (!el.classList.contains("open")) return;
  if (e.key === "Escape") zamknijLightbox();
  else if (e.key === "ArrowLeft") { LB.foto--; lbPokaz(); }
  else if (e.key === "ArrowRight") { LB.foto++; lbPokaz(); }
});

/* swipe (telefon) */
(function () {
  let x0 = null;
  let y0 = null;
  const el = $("#gal-lightbox");
  el.addEventListener("touchstart", (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 48 && Math.abs(dy) < 64) { // poziomy gest
      LB.foto += dx < 0 ? 1 : -1;
      lbPokaz();
    }
    x0 = y0 = null;
  }, { passive: true });
})();

/* przyciski lightboxu (klik tła zamyka) */
$("#gal-lb-zamknij").addEventListener("click", zamknijLightbox);
$("#gal-lb-poprz").addEventListener("click", () => { LB.foto--; lbPokaz(); });
$("#gal-lb-nast").addEventListener("click", () => { LB.foto++; lbPokaz(); });
$("#gal-lightbox").addEventListener("click", (e) => {
  if (e.target.id === "gal-lightbox") zamknijLightbox();
});

/* ===== wersja strony ===== */
async function pokazWersje() {
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return;
    const w = await res.json();
    if (w?.wersja) $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
}

/* ===== start ===== */
async function start() {
  // tryb dzień/noc + menu mobilne (jak app.js)
  ustawIkoneTrybu();
  $("#theme-toggle").addEventListener("click", () => {
    const terazNoc = document.documentElement.getAttribute("data-theme") === "night";
    const nowy = terazNoc ? "day" : "night";
    document.documentElement.setAttribute("data-theme", nowy);
    try { localStorage.setItem("kts-theme", nowy); } catch (e) { /* tryb prywatny */ }
    ustawIkoneTrybu();
  });
  const hamburger = $("#hamburger");
  const nav = $("#nav");
  hamburger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    hamburger.setAttribute("aria-expanded", String(open));
  });
  pokazWersje();

  try {
    const res = await fetch("galeria.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    GALERIA = await res.json();
  } catch (err) {
    console.error("Błąd ładowania galeria.json:", err);
    $("#gal-albumy").innerHTML =
      `<p class="t-small muted">Galeria chwilowo niedostępna — odśwież stronę.</p>`;
    return;
  }

  // sortowanie: najnowsze albumy na górze; bez daty (serwisowe) — na końcu
  GALERIA.sort((a, b) => {
    const da = a.data ?? "", db = b.data ?? "";
    return da > db ? -1 : da < db ? 1 : 0;
  });
  renderStatystyki();
  renderFiltry();
  renderAlbumy();

  // wejście z linku #album-slug (np. ze strony głównej)
  const hash = decodeURIComponent(location.hash.replace("#", ""));
  if (hash.startsWith("album-")) {
    const cel = document.getElementById(hash);
    if (cel) cel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

document.addEventListener("DOMContentLoaded", start);
