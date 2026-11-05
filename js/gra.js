/* js/gra.js — 1.29.0: GRA „PONG” — pobierana z repozytorium GitHub
   PRZY KAŻDYM WEJŚCIU (właściciel 05.11: „grę przy każdym ładowaniu
   site musisz pobierać bo jest w trakcie rozwoju i nie może być częścią
   stała kodu strony”).

   JAK TO DZIAŁA:
   - gra ŻYJE w repo github.com/tmjwk/pong (właściciel rozwija ją tam —
     commit = nowa wersja gry, bez deployu strony);
   - gra.html (ta podstrona) jest tylko PRZEKAŹNIKIEM: przy każdym
     otwarciu pobiera index.html gry z raw.githubusercontent.com
     (fetch cache:"no-store" + unikalny parametr ?bust= — omija
     cache CDN raw, który trzyma pliki ~5 min);
   - ścieżki względne z HTML-a gry (src/href/poster/srcset, url() w
     stylach) są przepisywane na ABSOLUTNE adresy raw z tym samym
     bust-em, do dokumentu wstawiany jest <base> — dzięki temu także
     zasoby dociągane w trakcie gry (fetch/img z JS gry) rozwiązują
     się do repo;
   - gotowy dokument trafia do iframe srcdoc (gra działa w pełni:
     skrypty, canvas, dźwięk, localStorage z rekordami — origin
     dziedziczony ze strony klubu);
   - gałęzie: najpierw „main”, przy 404 próba „master”;
   - gdy repo jest PRYWATNE lub sieć padła — czytelny ekran
     „chwilowo niedostępna” z przyciskiem ponownej próby (zero
     białych kart, zero konsoli błędów na stronie).

   DLACZEGO REPO MUSI BYĆ PUBLICZNE: strona jest statyczna (GitHub
   Pages) — nie ma serwera, który mógłby dołożyć token. Pobranie
   z repo prywatnego wymagałoby PAT w kodzie strony, a kod strony
   jest publiczny = wyciek tokena. Repo gry = publiczne, gra i tak
   jest openness-friendly.

   Wersja strony: konwencja jak na innych podstronach (WERSJA_KODU
   + toast o nowszej wersji; pełna historia w js/app.js). Od 1.29.0
   js/gra.js DOŁĄCZA do zestawu plików podnoszonych przy KAŻDYM
   deployu (reguła z v1.28.4). */
"use strict";

/* ===== konfiguracja ===== */
const GRA_REPO = "tmjwk/pong";
const GRA_RAW = "https://raw.githubusercontent.com/" + GRA_REPO;
const GRA_BRANCHE = ["main", "master"]; /* próba po kolei (404 → następna) */

/* ===== wersja strony (konwencja v1.28.4) ===== */
const WERSJA_KODU = "1.29.1";

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

/* unikalny znacznik na jedno wejście — omija ~5-minutowy cache CDN raw;
   „Odśwież grę” losuje NOWY, żeby pociągnąć świeżą wersję bez F5 */
let GRA_BUST = Date.now().toString(36);

/** Dopisz parametr omijający cache (zachowuje istniejące ?zapytania). */
function zBust(url) {
  return url + (url.includes("?") ? "&" : "?") + "bust=" + GRA_BUST;
}

/** Adres względny do przepisania? (http/data/blob/mailto/tel//# → nie) */
function wzgledna(v) {
  return !!v && !/^\s*(https?:|data:|blob:|mailto:|tel:|\/\/|#)/i.test(v);
}

/** Pobierz index.html gry — po kolei z kandydackich gałęzi. */
async function pobierzGre() {
  const problemy = [];
  for (const branch of GRA_BRANCHE) {
    try {
      const res = await fetch(`${GRA_RAW}/${branch}/index.html?bust=${GRA_BUST}`,
                             { cache: "no-store" });
      if (res.status === 404) { problemy.push(`brak index.html w „${branch}”`); continue; }
      if (!res.ok) { problemy.push(`HTTP ${res.status} (gałąź „${branch}”)`); continue; }
      const html = await res.text();
      if (!html || html.length < 20) { problemy.push(`pusty plik (gałąź „${branch}”)`); continue; }
      return { html, branch };
    } catch (e) {
      problemy.push(`sieć (${branch}): ${e.message || e}`);
    }
  }
  return { blad: problemy.join(" · ") || "nieznany błąd" };
}

/** Przepisz ścieżki względne na absolutne adresy raw (+bust) i zbuduj
 *  dokument do srcdoc. <base> gwarantuje, że też zasoby dociągane
 *  później przez JS gry (fetch/img) trafiają do repo. */
function zbudujDokument(html, branch) {
  const baza = `${GRA_RAW}/${branch}/`;
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
    if (wzgledna(v)) el.setAttribute("src", zBust(absolut(v)));
  });

  doc.querySelectorAll("[href]").forEach((el) => {
    const v = el.getAttribute("href");
    if (!wzgledna(v)) return;
    if (el.tagName === "USE") return; /* sprite’y #fragment zostają */
    el.setAttribute("href", zBust(absolut(v)));
  });

  doc.querySelectorAll("[poster]").forEach((el) => {
    const v = el.getAttribute("poster");
    if (wzgledna(v)) el.setAttribute("poster", zBust(absolut(v)));
  });

  doc.querySelectorAll("[srcset]").forEach((el) => {
    const v = el.getAttribute("srcset");
    if (!v) return;
    const nowe = v.split(",").map((czesc) => {
      const czesci = czesc.trim().split(/\s+/);
      if (!czesci[0] || !wzgledna(czesci[0])) return czesc.trim();
      czesci[0] = zBust(absolut(czesci[0]));
      return czesci.join(" ");
    }).join(", ");
    el.setAttribute("srcset", nowe);
  });

  doc.querySelectorAll("style").forEach((st) => {
    st.textContent = st.textContent.replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
      (caly, cudzyslow, url) => (wzgledna(url) ? `url("${zBust(absolut(url))}")` : caly)
    );
  });

  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
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

  const dokument = zbudujDokument(wynik.html, wynik.branch);
  ramka.addEventListener("load", function raz() {
    ramka.removeEventListener("load", raz);
    status.hidden = true;
    scena.hidden = false;
    try { ramka.contentWindow.focus(); } catch (e) { /* cross-origin — nie przeszkadza */ }
  });
  ramka.srcdoc = dokument;
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

  /* kontrolki nad planszą */
  $("#gra-odswiez").addEventListener("click", () => {
    GRA_BUST = Date.now().toString(36); /* nowy znacznik = świeże pobranie */
    zaladujGre();
  });
  $("#gra-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("#gra-scena").requestFullscreen();
    } catch (e) { /* przeglądarka odmówiła — gra działa dalej w oknie */ }
  });
  $("#gra-probij").addEventListener("click", () => {
    GRA_BUST = Date.now().toString(36);
    zaladujGre();
  });

  pokazWersje();
  zaladujGre();
}

document.addEventListener("DOMContentLoaded", start);
