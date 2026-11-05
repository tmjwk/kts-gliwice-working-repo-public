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
const WERSJA_KODU = "1.29.3";

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

/** Metadane mirroru (gra/.mirror.json) — skąd i kiedy ta wersja gry. */
async function pokazInfoMirroru(baza) {
  const el = $("#gra-mirror");
  if (!el) return;
  try {
    const res = await fetch(`${baza}.mirror.json`, { cache: "no-store" });
    if (!res.ok) return;
    const m = await res.json();
    if (m?.mirrored) el.textContent = m.mirrored;
  } catch (e) { /* zostaje „—” — nieistotne dla gry */ }
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

/** Pełny cykl: status → pobierz → zbuduj → wstrzyknij (albo fallback). */
async function zaladujGre() {
  const status = $("#gra-status");
  const scena = $("#gra-scena");
  const blad = $("#gra-blad");
  const ramka = $("#gra-ramka");
  status.hidden = false;
  scena.hidden = true;
  blad.hidden = true;

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
    try { ramka.contentWindow.focus(); } catch (e) { /* cross-origin — nie przeszkadza */ }
  });
  ramka.srcdoc = dokument;
  pokazInfoMirroru(wynik.baza);
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

  pokazWersje();
  zaladujGre();
}

document.addEventListener("DOMContentLoaded", start);
