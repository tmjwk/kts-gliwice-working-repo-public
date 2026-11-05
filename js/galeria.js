/* ============================================================
   KTS Gliwice — galeria (podstrona): render z galeria.json,
   filtry roku, lightbox (klawiatura + swipe), tryb dzień/noc.
   Samodzielny skrypt podstrony (nie wymaga app.js).

   v1.14.0: pełna historia 2012–2026 —
   - paginacja „Pokaż więcej” (BATCH albumów naraz),
   - chipy lat FB na żądanie (współpraca z js/galeria-fb.js
     przez window.__GALFB: lataFB / stanRoku / wczytajRok),
   - stany ładowania/błędu roku FB w miejscu albumów,
   - kotwica #album-slug rozszerza paginację, żeby dosięgnąć celu.
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
let POKAZ = 60;   // v1.14.0: ile albumów naraz w renderze (paginacja)
const BATCH = 60; // v1.14.0: przyrost po „Pokaż więcej”

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

/* 1.16.0 (decyzja właściciela): badge z liczbą albumów/zdjęć przy nagłówku
   „Galeria klubu” USUNIĘTY — liczby wczytanych lat nie były potrzebne
   (pełny licznik CAŁEJ galerii żyje na stronie głównej, zasilany przez bota).
   Wskaźnik ładowania roku = kręcąca się piłka KTS (sprite #pilka-kts,
   znacznik buduje wspólny silnik js/galeria-fb-core.js), nie tekst „dociągam…” */
const PILKA_LADOWANIA = window.KTSFB ? window.KTSFB.pilka() : "";

function renderFiltry() {
  /* v1.14.0: chipy = lata w danych + lata dostępne na żądanie z FB
     (window.__GALFB.lataFB — js/galeria-fb.js). Rok FB jeszcze
     niewczytany dostaje klasę gal-chip-fb (przerywana ramka — klik
     dociąga z Graph API). v1.16.0: bez dopiska „FB” (decyzja
     właściciela). v1.17.0: stan roku z __GALFB.stanRoku —
     „laduje” = malutka piłka w chipie (kolejka/klik pobiera rok),
     „blad” = chip przygaszony z podkreśleniem kropkowanym
     (klik = ponowna próba). v1.22.0 (właściciel 02.11): rok już
     WCZYTANY dostaje trwałą malutką piłeczkę (bez obrotu) — widać,
     które lata są już pobrane, a które dopiero czekają. */
  const lataGalerii = new Set(GALERIA.map((a) => (a.data || "").slice(0, 4)).filter(Boolean));
  const lataFB = (window.__GALFB && Array.isArray(window.__GALFB.lataFB))
    ? window.__GALFB.lataFB.map(String) : [];
  const stanRoku = (r) => (window.__GALFB && window.__GALFB.stanRoku)
    ? window.__GALFB.stanRoku(r) : null;
  const lata = [...new Set([...lataGalerii, ...lataFB])].sort().reverse();
  const wrap = $("#gal-filtry");
  const chip = (label, wartosc, aktywny, fb) => {
    const stan = fb ? stanRoku(wartosc) : null;
    const cls = "gal-chip" + (aktywny ? " is-aktywny" : "") + (fb ? " gal-chip-fb" : "")
      + (stan === "blad" ? " gal-chip-blad" : "");
    const dodatek = stan === "laduje"
      ? ` aria-label="Dociągam zdjęcia z roku ${esc(label)}"`
      : stan === "blad"
        ? ` aria-label="Rok ${esc(label)}: nie udało się pobrać — kliknij, aby spróbować ponownie"
           title="Nie udało się pobrać — kliknij, aby spróbować ponownie"`
        : fb ? ` aria-label="Dociągnij zdjęcia z roku ${esc(label)}"` : "";
    const pilka = stan === "laduje" && window.KTSFB
      ? window.KTSFB.pilka("gal-pilka gal-pilka--chip") : "";
    /* 1.22.0: piłeczka roku już wczytanego — tylko dla prawdziwych lat
       („Wszystkie” to filtr, nie rok); statyczna, bez cienia. */
    const gotowe = !fb && wartosc && stan !== "laduje" && window.KTSFB
      ? window.KTSFB.pilka("gal-pilka gal-pilka--gotowe") : "";
    const dodatekGotowe = gotowe ? ` title="Zdjęcia tego roku są już wczytane"` : "";
    return `<button class="${cls}" type="button" data-rok="${wartosc ?? ""}"${dodatek}${dodatekGotowe}>${esc(label)}${pilka}${gotowe}</button>`;
  };
  wrap.innerHTML = chip("Wszystkie", "", FILTR === null)
    + lata.map((r) => chip(r, r, FILTR === r, !lataGalerii.has(r))).join("");
  wrap.querySelectorAll(".gal-chip").forEach((b) => {
    b.addEventListener("click", () => {
      FILTR = b.dataset.rok === "" ? null : b.dataset.rok;
      POKAZ = BATCH;   // nowy widok = od pierwszej paczki
      renderFiltry();
      renderAlbumy();
      // rok dostępny tylko na FB → dociągnij (i pokaż stan ładowania)
      if (b.classList.contains("gal-chip-fb") && window.__GALFB) {
        window.__GALFB.wczytajRok(FILTR);
      }
    });
  });
}

function renderAlbumy() {
  const widoczne = GALERIA.filter((a) => !FILTR || (a.data || "").startsWith(FILTR));
  const kontener = $("#gal-albumy");
  if (widoczne.length === 0) {
    /* v1.14.0: rok FB w trakcie poboru / po błędzie → właściwy komunikat
       zamiast „brak albumów” (stan trzyma js/galeria-fb.js) */
    const stanFB = FILTR && window.__GALFB ? window.__GALFB.stanRoku(FILTR) : null;
    if (stanFB === "laduje") {
      kontener.innerHTML = `
        <div class="gal-ladowanie" role="status" aria-label="Dociągam zdjęcia z roku ${esc(FILTR)}">
          ${PILKA_LADOWANIA}
        </div>`;
      return;
    }
    if (stanFB === "blad") {
      kontener.innerHTML = `
        <div class="gal-ladowanie gal-blad" role="alert">
          <p>Zdjęcia z roku ${esc(FILTR)} nie udało się pobrać z Facebooka<br>
             (chwilowa awaria połączenia lub API).</p>
          <button class="gal-chip" id="gal-retry" type="button">Spróbuj ponownie</button>
        </div>`;
      const btn = $("#gal-retry");
      if (btn) btn.addEventListener("click", () => {
        if (window.__GALFB) window.__GALFB.wczytajRok(FILTR);
      });
      return;
    }
    kontener.innerHTML = `<p class="t-small muted">Brak albumów w tym roku.</p>`;
    return;
  }
  const pokazane = widoczne.slice(0, POKAZ);
  kontener.innerHTML = pokazane.map((a) => {
    const idx = GALERIA.indexOf(a);
    const fotosy = a.zdjecia.map((src, i) => {
      const mini = (a.miniatury && a.miniatury[i]) || src;   // v1.5.0: miniatura WebP
      const lqip = a.lqip && a.lqip[i];                       // v1.5.0: placeholder blur-up
      return `
      <button class="gal-foto" type="button" data-album="${idx}" data-foto="${i}"
              aria-label="Powiększ zdjęcie ${i + 1} z albumu ${esc(a.tytul)}">
        ${lqip ? `<span class="lqip" style="background-image:url('${lqip}')" aria-hidden="true"></span>` : ""}
        <img onload="this.classList.add('zalane')"
             onerror="if(this.dataset.org && this.src !== this.dataset.org){this.src=this.dataset.org}else{this.classList.add('zalane')}"
             src="${esc(mini)}" data-org="${esc(src)}"
             alt="${esc(a.tytul)} — zdjęcie ${i + 1}" loading="lazy" decoding="async">
      </button>`;
    }).join("");
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
  }).join("")
    /* v1.14.0: paginacja — DOM nie rozrasta się bez końca (galeria ma
       teraz ~1,6 tys. albumów potencjalnie; render paczkami po BATCH) */
    + (widoczne.length > POKAZ
      ? `<div class="gal-wiecej-wrap"><button class="gal-wiecej" id="gal-wiecej" type="button">
           Pokaż więcej · kolejne ${Math.min(BATCH, widoczne.length - POKAZ)}
           z pozostałych ${widoczne.length - POKAZ} albumów
         </button></div>`
      : "");

  kontener.querySelectorAll(".gal-foto").forEach((btn) => {
    btn.addEventListener("click", () => {
      otworzLightbox(Number(btn.dataset.album), Number(btn.dataset.foto));
    });
  });
  const wiecej = $("#gal-wiecej");
  if (wiecej) {
    wiecej.addEventListener("click", () => {
      const pierwszyNowy = widoczne[POKAZ];   // pierwszy album nowej paczki
      POKAZ += BATCH;
      renderAlbumy();
      const cel = pierwszyNowy ? document.getElementById("album-" + pierwszyNowy.slug) : null;
      if (cel) cel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

/* ===== lightbox ===== */
const LB = { album: 0, foto: 0 };

function lbPokaz() {
  const a = GALERIA[LB.album];
  if (!a) return;
  LB.foto = Math.max(0, Math.min(LB.foto, a.zdjecia.length - 1));
  const img = $("#gal-lb-img");
  const tlo = $("#gal-lb-tlo");
  // v1.5.0: LQIP jako rozmyte tło — natychmiastowa reakcja, oryginał wjeżdża na wierzchu
  if (tlo) {
    const lqip = a.lqip && a.lqip[LB.foto];
    tlo.style.backgroundImage = lqip ? `url('${lqip}')` : "none";
  }
  img.classList.remove("zalane");
  img.src = a.zdjecia[LB.foto];
  img.alt = `${a.tytul} — zdjęcie ${LB.foto + 1}`;
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

/* ===== wersja strony =====
   1.26.2: opis wersji trafia do STOPKI — jedno krótkie zdanie, bez atrybucji (konwencja, szczegóły: app.js pokazWersje)
   1.28.4: + komunikat, gdy na serwerze czeka nowsza wersja (WERSJA_KODU —
   konwencja i pełna historia w js/app.js; sprawdzamy PRZY WEJŚCIU, bo
   nawigacja po stronie to pełne przeładowania, a długo otwarte karty to
   wzorzec strony głównej z wynikami; „Odśwież stronę” omija cache
   przeglądarki — dociąga HTML, skrypty i styl, dopiero potem przeładowuje). */
const WERSJA_KODU = "1.28.5";

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

async function pokazWersje() {
  try {
    const res = await fetch("wersja.json", { cache: "no-cache" });
    if (!res.ok) return;
    const w = await res.json();
    if (w?.wersja) {
      $("#wersja-strony").textContent = `wersja v${w.wersja}${w.opis ? " · " + w.opis : ""}`;
      // ukryta przy otwieraniu karta pomija komunikat — dogoni go przy
      // kolejnym wejściu (nawigacja = pełne przeładowanie)
      if (!document.hidden && nowszaWersja(w.wersja, WERSJA_KODU)) zglosNowaWersje(w.wersja);
    }
  } catch (e) { /* brak pliku — zostaje „wersja —” */ }
}

/* ===== kotwica #album-slug (v1.14.0: współpracuje z paginacją) =====
   Cel w DOM → przewinięcie; cel w GALERIA, ale pozarenderowany →
   dołóż paczkę i spróbuj ponownie (odpalane też po dociągnięciu roku FB). */
function przewinDoAlbumu() {
  const hash = decodeURIComponent(location.hash.replace("#", ""));
  if (!hash.startsWith("album-")) return;
  const cel = document.getElementById(hash);
  if (cel) {
    cel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const slug = hash.replace(/^album-/, "");
  if (POKAZ < GALERIA.length && GALERIA.some((a) => a.slug === slug)) {
    POKAZ += BATCH;
    renderAlbumy();
    setTimeout(przewinDoAlbumu, 60);
  }
}
window.przewinDoAlbumu = przewinDoAlbumu;

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

  /* 1.26.8 (właściciel 04.11: „zaraz po wejściu w pełną galerię
     załadujesz tylko bieżący rok a potem czekamy czy użytkownik
     kliknie w przycisk”): podstrona NIE pobiera już galeria.json
     na starcie — wypełniacz 2023–24 znika. Danymi rządzi wyłącznie
     lustro FB (js/galeria-fb.js): wejście = piłka + bieżący rok,
     wcześniejsze lata = przycisk pod listą albo chip roku w filtrach.
     Archiwum statyczne (galeria.json) zostaje trybem awaryjnym —
     pobiera je galeria-fb.js dopiero po awarii startu FB. */
  renderFiltry();
  window.__GAL_START_ZAKONCZONY = true;   // sygnał dla galeria-fb.js: renderer gotowy
}

document.addEventListener("DOMContentLoaded", start);
