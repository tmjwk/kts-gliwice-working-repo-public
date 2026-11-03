/* ============================================================
   KTS Gliwice — LUSTRO GALERII FB (1.17.0 → 1.26.8)

   DECYZJA WŁAŚCICIELA (04.11.2026): „zaraz po wejściu w pełną
   galerię załadujesz tylko bieżący rok a potem czekamy czy
   użytkownik kliknie w przycisk”.

   Jak to działa (1.26.8):
   - START: ZERO wypełniacza — archiwum statyczne (galeria.json,
     lata 2023–24) NIE renderuje się na wejściu. W miejscu albumów
     kręci się piłka, równolegle leci pobór BIEŻĄCEGO ROKU z FB
     (a gdyby pusty, np. w styczniu — kolejnego w dół, aż znajdzie
     albumy); po dojeździe wjeżdżają albumy bieżącego roku.
   - STARSZE LATA = WYŁĄCZNIE KLIK: pod listą siedzi przycisk
     „Pokaż rok {YYYY} ↓” — jeden klik doładowuje KOLEJNY rok
     w dół (puste lata pomijane sama, aż trafi na albumy), po czym
     etykieta przeskakuje na następny rok. Po dojściu do 2012
     przycisk znika. Chipy lat w filtrach działają jak dotychczas
     (klik = natychmiastowy pobór roku, równolegle do wszystkiego).
     KONIEC automatycznej kolejki pod przewijanie (1.17.0) — dane
     plyną tylko po jawnym kliknięciu gościa.
   - ODSŁONIĘCIE: po dołączeniu roku POKAZ = całość wczytanego
     zasobu (albumy roku widoczne od razu, nie za kolejnym
     „Pokaż więcej”) + delikatne przewinięcie do pierwszego nowego
     albumu (tylko bez aktywnego filtra).
   - AWARIE: pobór roku ponawiany po cichu (klik = 1 próba,
     start = 3 próby); rok po porażce = stan „blad” (chip
     przygaszony, klik = ponowna próba, przycisk też retry-uje
     najwyższy rok w stanie „blad”). Awaria STARTU (bieżący rok)
     = tryb awaryjny: DOPIERO TERAZ pobieramy archiwum statyczne
     z repo (galeria.json, 2023–24) + notka; klik w chip/przycisk
     może je zastąpić (pierwszy udany pobór = zastąpienie,
     jak dotychczas).
   - DUPLIKATY NIEMOŻLIWE: zastąpienie usuwa archiwum w całości,
     a każdy doładowany rok wyrzuca beforehand albumy SWOJEGO
     roku z innych źródeł.
   - WSKAŹNIKI (zero tekstów — decyzja 1.16.0): piłka w chipie
     roku (pobór w trakcie), piłka w przycisku (doładowanie),
     piłka w miejscu albumów (start / filtr roku w trakcie),
     chip „blad” = przygaszony z podkreśleniem kropkowanym.

   DLACZEGO TAK (koszty, zmierzone 01–02.11): pełne metadane zdjęcia
   z Graph API ≈ 5,2 KB (FB dołącza 9 wariantów rozmiarów), więc:
   sam bieżący rok ≈ 2 MB, okno 2 lat ≈ 5 MB, cała galeria
   2012–2026 ≈ 80 MB. Gość na wejściu pobiera ~2 MB i ani bajtu
   więcej, dopóki sam nie poprosi o starsze lata. Miniatury i tak
   tylko lazy (loading="lazy") — niezmiennie.

   Pobór i grupowanie żyją we WSPÓLNYM silniku js/galeria-fb-core.js
   (używa go też teaser galerii na stronie głównej — app.js).
   GRUPOWANIE w albumy: post > album nazwany > miesiąc (bez zmian).

   DLACZEGO LUSTRO, A NIE IMPORT (decyzja właściciela 1.11): do repo
   NIE trafia ani bajt danych z FB; przeglądarka gościa pobiera
   metadane + zdjęcia wprost z Graph API / CDN Facebooka. Nowe
   zdjęcia na FB pojawiają się w galerii SAME.

   BEZPIECZNIKI: awaria API przy roku → stan „blad” + klikalny chip
   i przycisk; awaria startu → archiwum lokalne + notka; posty roku
   to tylko metadane (ich błąd NIE wywala roku — spada na
   albumy/miesiące); twarde limity stronicowania (12 stron ≈ 3 000
   zdjęć/rok, silnik) i timeouty fetch 25 s.
   ============================================================ */
"use strict";

(function () {
  /* ===== lata i stany ===== */
  const ROK_NAJSTARSZY = 2012;
  const ROK_BIEZACY = new Date().getFullYear();   // 2026 — dynamicznie (2027+ samo się przesunie)
  /* pełna lista lat oferowanych w chipach (kolejność dowolna —
     renderFiltry i tak sortuje); solidne zrobią się z danymi */
  const LATA_FB = [];
  for (let r = ROK_BIEZACY; r >= ROK_NAJSTARSZY; r--) LATA_FB.push(String(r));

  /* rok → 'laduje' | 'blad' | 'ok' */
  const STAN_LAT = new Map();
  /* globalny dedup photo_id między latami (granice since/until) */
  const WIDZIANE_FOTO = new Set();
  const ZRODLO_FB = "Facebook (na żywo)";         // musi zgadzać się z galeria-fb-core.js

  /* — notka statusu (galeria.html #gal-notatka) — */
  const ustawNote = (html) => {
    const n = document.getElementById("gal-notatka");
    if (n) n.innerHTML = html;
  };

  /* — silnik wspólny (js/galeria-fb-core.js) — */
  const FB = window.KTSFB;

  /* piłka w miejscu albumów podczas startu (własna nazwa —
     PILKA_LADOWANIA żyje w zakresie js/galeria.js) */
  const PILKA_STARTU = FB ? FB.pilka("gal-pilka gal-pilka--notka") : "";

  /* ===== scalenie z galeria.js (render wspólny) =====
     GALERIA/FILTR/POKAZ/BATCH/renderFiltry/renderAlbumy to globalne
     deklaracje js/galeria.js — klasyczne skrypty współdzielą zakres. */

  /* zgoda galeria.js na rozpoczęcie (renderer gotowy — 1.26.8:
     galeria.js nie pobiera już danych, sygnał zapada po inicjacji
     UI, więc czekanie jest krótkie i formalne) */
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

  /* ===== B. dolączanie albumów roku (z obroną przed duplikatami) =====
     Zanim albumy FB roku wjadą do GALERIA, wyrzucamy archiwalne
     albumy TEGO roku — archiwum i FB nie mogą pokazać się obok
     siebie (przypadek: start padł, gość kliknął 2024 przy wciąż
     wyświetlonym archiwum 2023–24). */
  function dolaczAlbumyFB(albumy) {
    const lataRoku = new Set(
      albumy.map((a) => (a.data || "").slice(0, 4)).filter(Boolean)
    );
    if (lataRoku.size) {
      for (let i = GALERIA.length - 1; i >= 0; i--) {
        const a = GALERIA[i];
        if (a.zrodlo !== ZRODLO_FB && lataRoku.has((a.data || "").slice(0, 4))) {
          GALERIA.splice(i, 1);
        }
      }
    }
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

  /* zastąpienie zawartości pierwszym rokiem FB (1.17: JEDEN rok).
     Albumy FB dołączone wcześniej (klik podczas awarii startu) —
     zachowywane; reszta wylatuje w całości. */
  function zastapStatyczne(albumyFB) {
    const zachowajFB = GALERIA.filter((a) => a.zrodlo === ZRODLO_FB);
    window.__GALFB_ZASTAPIONE = true;   // archiwum awaryjne nie nadpisze wyniku FB
    GALERIA.length = 0;
    for (const a of [...albumyFB, ...zachowajFB]) GALERIA.push(a);
    GALERIA.sort((a, b) => {
      const da = a.data ?? "", db = b.data ?? "";
      return da > db ? -1 : da < db ? 1 : 0;
    });
    POKAZ = BATCH;                       // nowy widok = od pierwszej paczki
    renderFiltry();
    /* filtr ustawiony na rok, którego dane właśnie zniknęły
       (np. 2023/2024 z archiwum awaryjnego) → dociągnij ten rok
       z FB od razu, bez klepania */
    if (FILTR && !GALERIA.some((a) => (a.data || "").startsWith(FILTR))
        && LATA_FB.includes(String(FILTR))) {
      wczytajRok(FILTR);
      return;
    }
    renderAlbumy();
    if (typeof window.przewinDoAlbumu === "function") {
      window.przewinDoAlbumu();
    }
  }

  /* linki „Zobacz na Facebooku” — doklejane po każdym renderze */
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

  /* ===== notka zakresu (teksty statyczne; piłka tylko przy starcie) ===== */
  const NOTKA_ZAKRESU = "<strong>Zakres galerii: 2012–2026.</strong> "
    + "Wszystkie lata to zakładka „Zdjęcia” na Facebooku klubu, "
    + "dociągana na żywo. Na start wczytuje się bieżący rok — "
    + "wcześniejsze doładujesz przyciskiem pod listą albo klikając "
    + "rok w filtrach powyżej. Pliki nie są kopiowane do serwisu.";
  const NOTKA_AWARIA = "<strong>Zakres galerii: 2023–2024 (archiwum zapasowe).</strong> "
    + "Zdjęcia z Facebooka są chwilowo niedostępne — odśwież stronę "
    + "za chwilę albo kliknij rok w filtrach, aby spróbować ponownie. "
    + "Na Facebooku klub ma zdjęcia od 2012 roku.";

  const PILKA_NOTKI = FB ? FB.pilka("gal-pilka gal-pilka--notka") : "";

  /* ===== C. pobór roku (wspólny dla startu, przycisku i kliknięć) ===== */
  function spanie(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ponawianie po cichu: start = 3 próby (gość czeka na piłce),
     klik = 1 próba (jest widoczny retry: chip „blad” / przycisk) */
  async function sprobuj(fn, proby, przerwaMs) {
    let ostatni;
    for (let i = 0; i < proby; i++) {
      try { return await fn(); }
      catch (e) { ostatni = e; if (i < proby - 1) await spanie(przerwaMs); }
    }
    throw ostatni;
  }

  /* dane jednego roku: zdjęcia (twarde) + posty (miękkie — tylko
     metadane; ich awaria nie wywala roku, spada na albumy/miesiące) */
  async function pobierzDaneRoku(r) {
    const od = `${r}-01-01`;
    const doIso = r < ROK_BIEZACY ? `${r + 1}-01-01` : null;
    const [listaPostow, mapaZdjec] = await Promise.all([
      FB.posty(od, doIso, doIso ? undefined : { stopPrzedIso: od })
        .catch((e) => {
          console.warn(`Lustro galerii FB — posty roku ${r} pominięte (grupuję po albumach/miesiącach):`, e);
          return [];
        }),
      FB.zdjecia(od, doIso),
    ]);
    return FB.zbudujAlbumy(mapaZdjec, FB.mapaFotoPost(listaPostow), WIDZIANE_FOTO);
  }

  /* pobór + wpięcie roku w GALERIA. Zwraca true/false.
     opt.pierwszy = to pierwszy udany kontakt z FB po awarii startu:
     zamiast doklejać — zastępuje archiwum awaryjne. */
  async function pobierzRok(rok, opt) {
    const o = opt || {};
    const r = Number(rok);
    if (!(r >= ROK_NAJSTARSZY && r <= ROK_BIEZACY)) return false;
    const stan = STAN_LAT.get(r);
    if (stan === "ok" || stan === "laduje") return stan === "ok";

    STAN_LAT.set(r, "laduje");
    renderFiltry();                                  // piłka w chipie roku
    if (FILTR === String(r)) renderAlbumy();         // widok filtra: piłka w miejscu albumów
    odswiezPrzycisk();
    try {
      const albumy = await sprobuj(() => pobierzDaneRoku(r), 1, 1200);
      zapiszPermalinki(albumy);
      STAN_LAT.set(r, "ok");                         // pusty rok też „ok” (filtr pokaże „brak albumów”)
      if (o.pierwszy && albumy.length) {
        const czekal = await czekajNaStatyczne();
        if (!czekal) console.warn("Lustro galerii FB: renderer nie potwierdził startu — zastępuję bez niego.");
        zastapStatyczne(albumy);
        ustawNote(NOTKA_ZAKRESU);
        odswiezPrzycisk();
        return true;
      }
      dolaczAlbumyFB(albumy);
      renderFiltry();
      if (FILTR === String(r)) renderAlbumy();
      if (typeof window.przewinDoAlbumu === "function") window.przewinDoAlbumu();
      odswiezPrzycisk();
      return true;
    } catch (err) {
      console.error(`Lustro galerii FB — rok ${r} błąd poboru:`, err);
      STAN_LAT.set(r, "blad");
      renderFiltry();                                // chip przygaszony, klikalny
      if (FILTR === String(r)) renderAlbumy();       // panel „Spróbuj ponownie”
      odswiezPrzycisk();
      return false;
    }
  }

  /* publiczny interfejs kliknięcia (galeria.js renderFiltry): pierwszy
     udany pobór po awarii startu zostaje ZASTĄPIENIEM archiwum */
  function wczytajRok(rok) {
    return pobierzRok(rok, { pierwszy: window.__GALFB_ZASTAPIONE !== true });
  }

  function stanRoku(rok) {
    return STAN_LAT.get(Number(rok)) || null;
  }

  /* ===== D. PRZYCISK „Pokaż rok …” (1.26.8) =====
     Zastępuje automatyczną kolejkę pod przewijanie (1.17.0): starsze
     lata lecą z FB WYŁĄCZNIE po kliknięciu. Jeden klik = jeden rok
     z albumami (puste lata przeskakujemy sama w dół). Etykieta
     pokazuje rok, który doładuje następne kliknięcie; rok w stanie
     „blad” też trafia na przycisk (klik = ponowna próba). Po 2012
     przycisk znika. */
  let przyciskPracuje = false;

  function nastepnyRokDoWczytania() {
    for (let r = ROK_BIEZACY; r >= ROK_NAJSTARSZY; r--) {
      const stan = STAN_LAT.get(r);
      if (stan === "ok" || stan === "laduje") continue;
      return r;                      // undefined (nie dotknięty) albo „blad” (retry)
    }
    return null;                     // wszystkie lata wczytane
  }

  function odswiezPrzycisk() {
    const wrap = document.getElementById("gal-starsze-wrap");
    const btn = document.getElementById("gal-starsze");
    if (!wrap || !btn) return;
    const rok = nastepnyRokDoWczytania();
    const wLocie = przyciskPracuje
      || [...STAN_LAT.values()].includes("laduje");
    wrap.hidden = rok === null;
    btn.disabled = wLocie;
    btn.innerHTML = wLocie
      ? "Dociągam… " + (FB ? FB.pilka("gal-pilka gal-pilka--chip") : "")
      : `Pokaż rok ${rok} ↓`;
    btn.setAttribute("aria-label",
      wLocie ? "Dociągam wcześniejszy rok z Facebooka"
             : `Wczytaj zdjęcia z roku ${rok}`);
  }

  async function przyciskStarsze() {
    const btn = document.getElementById("gal-starsze");
    if (!btn || btn.disabled || przyciskPracuje) return;
    przyciskPracuje = true;
    odswiezPrzycisk();               // piłka w przycisku
    const slugiPrzed = new Set(GALERIA.map((a) => a.slug));
    let r = nastepnyRokDoWczytania();
    while (r !== null) {
      const ok = await wczytajRok(r);
      if (!ok) break;                // błąd poboru — przycisk wróci jako retry
      if (GALERIA.some((a) => (a.data || "").startsWith(String(r)))) {
        break;                       // rok z albumami — koniec tej tury
      }
      /* pusty rok (np. przerwa zimowa) — schodzimy niżej po albumy */
      r -= 1;
      while (r >= ROK_NAJSTARSZY
             && ["ok", "laduje"].includes(STAN_LAT.get(r))) r -= 1;
      if (r < ROK_NAJSTARSZY) r = null;
    }
    przyciskPracuje = false;
    /* gość kliknął „Pokaż rok X” — albumy X widoczne OD RAZU, nie za
       kolejnym „Pokaż więcej”: odsłaniamy cały wczytany zasób.
       Paginacja wraca dopiero przy własnym zapasie (przypadek
       pierwszej paczki startowej > BATCH albumów). */
    if (GALERIA.length && FILTR === null) POKAZ = GALERIA.length;
    renderFiltry();
    renderAlbumy();
    odswiezPrzycisk();
    /* delikatne przewinięcie do pierwszego NOWEGO albumu — tylko bez
       aktywnego filtra (z filtrem nie wyrywamy gościa z widoku) */
    if (FILTR === null) {
      const nowy = [...document.querySelectorAll(".gal-album")]
        .find((el) => !slugiPrzed.has((el.id || "").replace(/^album-/, "")));
      if (nowy) nowy.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const btnStarsze = document.getElementById("gal-starsze");
  if (btnStarsze) btnStarsze.addEventListener("click", przyciskStarsze);

  /* interfejs dla js/galeria.js — dostępny od razu po sparsowaniu
     (galeria.js startuje na DOMContentLoaded, więc zawsze zdąży) */
  window.__GALFB = { lataFB: LATA_FB, stanRoku, wczytajRok };

  /* ===== E. archiwum awaryjne (1.26.8: dopiero po awarii startu) ===== */
  async function wczytajArchiwumZapasowe() {
    try {
      const res = await fetch("galeria.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dane = await res.json();
      if (window.__GALFB_ZASTAPIONE === true) return;   // FB już wygrał (klik ubiegł awarię)
      GALERIA.length = 0;
      for (const a of dane) GALERIA.push(a);
      GALERIA.sort((a, b) => {
        const da = a.data ?? "", db = b.data ?? "";
        return da > db ? -1 : da < db ? 1 : 0;
      });
      POKAZ = BATCH;
      renderFiltry();
      renderAlbumy();
      ustawNote(NOTKA_AWARIA);
    } catch (e) {
      console.error("Lustro galerii FB — archiwum zapasowe niedostępne:", e);
      const el = document.getElementById("gal-albumy");
      if (el) el.innerHTML =
        '<p class="t-small muted">Galeria chwilowo niedostępna — odśwież stronę.</p>';
      ustawNote(NOTKA_AWARIA);
    }
  }

  /* ===== F. start: bieżący rok (lub pierwszy z albumami) ===== */
  async function start() {
    /* 1.26.8: wejście = TYLKO bieżący rok (właściciel 04.11). Zero
       wypełniacza z archiwum — w miejscu albumów kręci się piłka,
       aż dojedzie FB. galeria.json wraca wyłącznie w trybie
       awaryjnym (wczytajArchiwumZapasowe). */
    ustawNote(PILKA_NOTKI);
    const miejsce = document.getElementById("gal-albumy");
    if (miejsce) {
      miejsce.innerHTML = `<div class="gal-ladowanie" role="status"`
        + ` aria-label="Dociągam bieżący rok z Facebooka">${PILKA_STARTU}</div>`;
    }
    STAN_LAT.set(ROK_BIEZACY, "laduje");
    renderFiltry();                                  // piłka w chipie bieżącego roku od razu
    odswiezPrzycisk();

    let albumyStart = null;
    let rokStart = null;
    for (let r = ROK_BIEZACY; r >= ROK_NAJSTARSZY; r--) {
      STAN_LAT.set(r, "laduje");                     // chip/przycisk widzą pobór
      renderFiltry();
      try {
        const a = await sprobuj(() => pobierzDaneRoku(r), 3, 1200);
        STAN_LAT.set(r, "ok");
        if (a.length) { albumyStart = a; rokStart = r; break; }
        /* pusty rok (styczeń) — schodzimy niżej po pierwszy z albumami */
      } catch (err) {
        console.error("Lustro galerii FB — błąd poboru startowego:", err);
        /* tryb awaryjny: archiwum lokalne z repo + notka; chipy lat
           pozostają klikane — pierwszy udany pobór zastąpi archiwum */
        STAN_LAT.set(r, "blad");
        renderFiltry();
        odswiezPrzycisk();
        await wczytajArchiwumZapasowe();
        return;
      }
    }

    if (!rokStart) {
      /* FB odpowiada, ale 0 zdjęć we wszystkich latach — bardzo
         nieprawdopodobne; pokaż archiwum awaryjne z notką */
      ustawNote(NOTKA_AWARIA);
      await wczytajArchiwumZapasowe();
      return;
    }

    zapiszPermalinki(albumyStart);
    const czekal = await czekajNaStatyczne();
    if (!czekal) {
      console.warn("Lustro galerii FB: renderer nie potwierdził startu — zastępuję bez niego.");
    }
    zastapStatyczne(albumyStart);
    ustawNote(NOTKA_ZAKRESU);
    odswiezPrzycisk();
    /* wejście z linku #album-slug (np. teaser na stronie głównej):
       cel w bieżącym roku — przewiń; cel w starszym roku doczeka
       na klik w chip roku (pobierzRok po drodze wywoła przewin) */
    if (typeof window.przewinDoAlbumu === "function") {
      window.przewinDoAlbumu();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* diagnostyka (warsztat): ręczne odpalanie z konsoli */
  window.__GFB = {
    wczytajRok,
    stan: () => Object.fromEntries(STAN_LAT),
    nastepnyRok: nastepnyRokDoWczytania,
  };
})();
