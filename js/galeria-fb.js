/* ============================================================
   KTS Gliwice — LUSTRO GALERII FB (1.15.0)

   DECYZJA WŁAŚCICIELA 2.11 (podejście B z trzech rozważanych):
   lata 2023–2024 też pochodzą z Facebooka — galeria jest JEDNYM
   lustrem zakładki „Zdjęcia” fanpage'a w pełnym zakresie 2012–2026.

   Architektura po 1.15.0:
   - start: na żywo ładowane są najnowsze lata (2025–2026);
   - wszystkie pozostałe lata (2012–2024) czekają w filtrach jako
     chipy z ramką przerywaną i znaczkiem „FB” — klik dociąga DANY
     rok z Graph API (zdjęcia + tytuły postów), ze stanem ładowania
     i obsługą błędu („Spróbuj ponownie”);
   - statyczne archiwum starej strony (galeria.json, 131 albumów /
     916 zdjęć, 2023–24) NIE jest już renderowane — po starcie lustra
     jest ZASTĘPOWANE danymi FB. Zostaje jako AWARYJNY ZASILIK:
     gdy Graph API nie odpowie, galeria pokazuje archiwum lokalne
     zamiast pustej strony (a liczby zawsze opisują to, co widać);
   - paginacja „Pokaż więcej” (js/galeria.js) pilnuje DOM-a.

   Pobór i grupowanie żyją we WSPÓLNYM silniku js/galeria-fb-core.js
   (używa go też teaser galerii na stronie głównej — app.js).

   GRUPOWANIE ZDJĘĆ W ALBUMY (hierarchia, wszystkie lata tak samo):
   1. post zawierający zdjęcie → tytuł = 1. linia treści posta,
      data = data posta, link = permalink posta;
   2. nazwany album FB (typ normal, np. „Gilowice 2016 — Sierpień”)
      → tytuł = nazwa albumu (takie albumy klub zakładał do 2018);
   3. pozostałe (ściana/mobile) → grupa miesięczna
      „Zdjęcia · sierpień 2016”, link do pierwszego zdjęcia.

   DLACZEGO LUSTRO, A NIE IMPORT (decyzja właściciela 1.11):
   repo ma ograniczone miejsce — do repo NIE trafia ani bajt danych
   z FB; przeglądarka gościa pobiera metadane + zdjęcia wprost
   z Graph API / CDN Facebooka. Zero utrzymania: nowe zdjęcia na FB
   pojawiają się w galerii SAME.

   ROLKI: to wideo (na stronie 6 szt.) — świadomie POZA galerią
   zdjęć; żyją w lustro-fb.js (aktualności).

   BEZPIECZNIKI:
   - awaria API / timeout przy roku → komunikat + „Spróbuj ponownie”;
   - awaria przy starcie → galeria pokazuje statyczne archiwum
     2023–2024 + notkę (nic się nie sypie); 2023–24 nie są wtedy
     oferowane z FB (by nie dublować archiwum);
   - posty roku to tylko metadane — ich błąd NIE wywala roku;
   - twarde limity stronicowania (12 stron ≈ 3 000 zdjęć/rok)
     i timeouty fetch 25 s.
   ============================================================ */
"use strict";

(function () {
  /* okno startowe = dwa ostatnie lata (liczone od bieżącego roku —
     architektura nie starzeje się w 2027+); reszta lat na żądanie */
  const OD_ROKU = String(Math.max(2012, new Date().getFullYear() - 1));
  /* lata do dociągnięcia z FB: 2012 … rok przed oknem startowym
     (dziś 2012–2024, w tym 2023–2024 z decyzji B). W trybie awaryjnym
     (archiwum lokalne wyrenderowane) lata 2023–2024 są z listy
     usuwane — chipy FB zdublowałyby archiwum */
  const LATA_FB = [];
  for (let r = 2012; r < Number(OD_ROKU); r++) LATA_FB.push(String(r));

  /* lata na żądanie: rok → 'laduje' | 'blad' | 'ok' */
  const STAN_LAT = new Map();
  /* globalny dedup photo_id między latami (granice since/until) */
  const WIDZIANE_FOTO = new Set();

  /* — notka statusu (galeria.html #gal-notatka) — */
  const ustawNote = (html) => {
    const n = document.getElementById("gal-notatka");
    if (n) n.innerHTML = html;
  };

  /* — silnik wspólny (js/galeria-fb-core.js) — */
  const FB = window.KTSFB;

  /* ===== scalenie z galeria.js (render wspólny) =====
     GALERIA/renderFiltry/renderAlbumy to globalne deklaracje
     js/galeria.js — klasyczne skrypty współdzielą zakres. */

  /* zgoda galeria.js na rozpoczęcie zastępowania: start() tamtego
     pliku na końcu.resolve'uje window.__GAL_START (także po błędzie
     ładowania galeria.json) — thanks temu zastąpienie nie ściga się
     z `GALERIA = await res.json()`. Zabezpieczenie: timeout 8 s. */
  function czekajNaStatyczne() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const gotowe = (Array.isArray(GALERIA) && GALERIA.length > 0)
          || (window.__GAL_START_ZAKONCZONY === true);
        if (gotowe) return resolve(true);
        if (Date.now() - t0 > 8000) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  /* 1.15.0: start lustra ZASTĘPUJE statyczne archiwum (podejście B) —
     lata 2023–24 przestają być renderowane z galeria.json */
  function zastapStatyczne(albumyFB) {
    const byloStatyczne = GALERIA.length > 0;
    window.__GALFB_ZASTAPIONE = true;   // galeria.js nie nadpisze wyniku wolnym poborem
    GALERIA.length = 0;
    for (const a of albumyFB) GALERIA.push(a);
    GALERIA.sort((a, b) => {
      const da = a.data ?? "", db = b.data ?? "";
      return da > db ? -1 : da < db ? 1 : 0;
    });
    POKAZ = BATCH;                       // nowy widok = od pierwszej paczki
    renderFiltry();
    /* filtr ustawiony na rok, którego dane właśnie zniknęły (np. 2023
       z archiwum) → dociągnij ten rok z FB od razu, bez klepania */
    if (FILTR && !GALERIA.some((a) => (a.data || "").startsWith(FILTR))
        && LATA_FB.includes(String(FILTR))) {
      wczytajRok(FILTR);
      return;
    }
    renderAlbumy();
    if (byloStatyczne && typeof window.przewinDoAlbumu === "function") {
      window.przewinDoAlbumu();
    }
  }

  /* dociągnięty rok: tylko dokłada albumy (dedup po slug) */
  function dolaczAlbumyFB(albumy) {
    const widziane = new Set(GALERIA.map((a) => a.slug));
    let dodane = 0;
    for (const a of albumy) {
      if (widziane.has(a.slug)) continue;
      GALERIA.push(a);
      widziane.add(a.slug);
      dodane++;
    }
    GALERIA.sort((a, b) => {
      const da = a.data ?? "", db = b.data ?? "";
      return da > db ? -1 : da < db ? 1 : 0;
    });
    renderFiltry();
    renderAlbumy();
    return dodane;
  }

  /* linki „Zobacz na Facebooku” — doklejane po każdym renderze
     (także po zmianie filtra roku / paginacji, bo renderAlbumy przebudowuje DOM) */
  const PERMALINKI = new Map();
  function zapiszPermalinki(albumy) {
    for (const a of albumy) {
      if (a.fbLink) PERMALINKI.set(a.slug, a.fbLink);
    }
  }

  function oznaczAlbumyFB() {
    document.querySelectorAll(".gal-album").forEach((art) => {
      const slug = (art.id || "").replace(/^album-/, "");
      const link = PERMALINKI.get(slug);
      if (!link || art.querySelector(".gal-fb-link")) return;
      const meta = art.querySelector(".gal-album-meta");
      if (!meta) return;
      const a = document.createElement("a");
      a.className = "gal-fb-link";
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Zobacz na Facebooku ↗";
      meta.appendChild(a);
    });
  }

  const orgRenderAlbumy = window.renderAlbumy;
  if (typeof orgRenderAlbumy === "function") {
    window.renderAlbumy = function () {
      orgRenderAlbumy();
      oznaczAlbumyFB();
    };
  }

  /* ===== notka zakresu =====
     1.16.0: bez liczników (decyzja właściciela — liczby na stronie galerii
     zbędne; pełny licznik całej galerii żyje na stronie głównej) i bez
     tekstów ładowania — podczas poboru notka pokazuje kręcącą się piłkę. */
  const NOTKA_ZAKRESU = "<strong>Zakres galerii: 2012–2026.</strong> "
    + "Wszystkie lata to zakładka „Zdjęcia” na Facebooku klubu, "
    + "dociągana na żywo — start pokazuje najnowsze lata, a starsze "
    + "(w tym 2023–2024) doładujesz jednym kliknięciem w filtrach "
    + "powyżej. Pliki nie są kopiowane do serwisu.";

  const PILKA_NOTKI = FB.pilka("gal-pilka gal-pilka--notka");

  /* ===== D. rok na żądanie (2012–2024) ===== */
  async function wczytajRok(rok) {
    const r = Number(rok);
    if (!LATA_FB.includes(String(r))) return;
    const stan = STAN_LAT.get(r);
    if (stan === "ok" || stan === "laduje") return;   // już wczytany / w trakcie
    STAN_LAT.set(r, "laduje");
    renderAlbumy();                                    // pokaż piłkę ładowania
    ustawNote(PILKA_NOTKI);
    try {
      const od = `${r}-01-01`, doIso = `${r + 1}-01-01`;
      // posty to tylko metadane — ich awaria nie wywala roku (spada na albumy/miesiące)
      const [listaPostow, mapaZdjec] = await Promise.all([
        FB.posty(od, doIso).catch((e) => {
          console.warn(`Lustro galerii FB — posty roku ${r} niedostępne (grupuję po albumach/miesiącach):`, e);
          return [];
        }),
        FB.zdjecia(od, doIso),
      ]);
      const albumy = FB.zbudujAlbumy(mapaZdjec, FB.mapaFotoPost(listaPostow), WIDZIANE_FOTO);
      zapiszPermalinki(albumy);
      dolaczAlbumyFB(albumy);
      STAN_LAT.set(r, "ok");
      ustawNote(NOTKA_ZAKRESU);
      // po dociągnięciu roku: dosięgnij celu, jeśli w URL czeka kotwica #album-…
      if (typeof window.przewinDoAlbumu === "function") window.przewinDoAlbumu();
    } catch (err) {
      console.error(`Lustro galerii FB — rok ${r} błąd poboru:`, err);
      STAN_LAT.set(r, "blad");
      renderAlbumy();                                  // komunikat + „Spróbuj ponownie”
      ustawNote(`<strong>Rok ${r}:</strong> nie udało się pobrać zdjęć — `
        + "spróbuj ponownie za chwilę.");
    }
  }

  function stanRoku(rok) {
    return STAN_LAT.get(Number(rok)) || null;
  }

  /* interfejs dla js/galeria.js — dostępny od razu po sparsowaniu
     (galeria.js startuje na DOMContentLoaded, więc zawsze zdąży) */
  window.__GALFB = { lataFB: LATA_FB, stanRoku, wczytajRok };

  /* ===== E. start: lustro najnowszych lat (zastępuje archiwum) ===== */
  async function start() {
    ustawNote(PILKA_NOTKI);

    let listaPostow, mapaZdjec;
    try {
      [listaPostow, mapaZdjec] = await Promise.all([
        FB.posty(`${OD_ROKU}-01-01`, null, { stopPrzedIso: `${OD_ROKU}-01-01` }),
        FB.zdjecia(`${OD_ROKU}-01-01`, null),
      ]);
    } catch (err) {
      console.error("Lustro galerii FB — błąd poboru:", err);
      /* tryb awaryjny: archiwum lokalne 2023–24 zostaje wyrenderowane —
         te dwa lata nie mogą być jednocześnie chipami FB (duplikaty) */
      for (const r of ["2023", "2024"]) {
        const i = LATA_FB.indexOf(r);
        if (i !== -1) LATA_FB.splice(i, 1);
      }
      ustawNote(
        "<strong>Zakres galerii: 2023–2024 (archiwum zapasowe).</strong> "
        + "Zdjęcia z Facebooka są chwilowo niedostępne — odśwież stronę "
        + "za chwilę. Na Facebooku klub ma zdjęcia od 2012 roku.");
      return;   // archiwum lokalne zostaje wyrenderowane (galeria.js)
    }

    const albumy = FB.zbudujAlbumy(mapaZdjec, FB.mapaFotoPost(listaPostow), WIDZIANE_FOTO);
    if (!albumy.length) {
      for (const r of ["2023", "2024"]) {
        const i = LATA_FB.indexOf(r);
        if (i !== -1) LATA_FB.splice(i, 1);
      }
      ustawNote(
        "<strong>Zakres galerii: 2023–2024 (archiwum zapasowe).</strong> "
        + "Facebook nie zwrócił zdjęć — odśwież stronę za chwilę.");
      return;
    }
    zapiszPermalinki(albumy);

    const czekal = await czekajNaStatyczne();
    if (!czekal) {
      console.warn("Lustro galerii FB: statyczne archiwum nie potwierdziło startu — zastępuję bez niego.");
    }
    zastapStatyczne(albumy);
    ustawNote(NOTKA_ZAKRESU);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* diagnostyka (warsztat): ręczne odpalenie z konsoli */
  window.__GFB = { wczytajRok };
})();
