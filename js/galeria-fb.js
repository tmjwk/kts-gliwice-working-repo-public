/* ============================================================
   KTS Gliwice — LUSTRO GALERII FB (1.17.0)

   DECYZJA WŁAŚCICIELA („rzucam”, 02.11.2026): ŁADOWANIE
   PRZYROSTOWE OD NAJNOWSZEGO ROKU W DÓŁ (2026 → 2012).

   Jak to działa (uzgodnione z właścicielem, „klatka po klatce”):
   - START: statyczne archiwum 2023–24 renderuje się od razu jako
     wypełniacz na pierwsze sekundy (js/galeria.js, bez zmian);
     równolegle leci pobór BIEŻĄCEGO ROKU z FB (a gdyby pusty,
     np. w styczniu — kolejnego w dół, aż znajdzie albumy) i po
     dojściu ZASTĘPUJE archiwum (wypełniacz znika, wjeżdżają
     najnowsze albumy — najlżejszy możliwy pierwszy pakiet).
   - KOLEJKA: lata schodzą pojedynczo w dół (2025 → 2012), ale
     kolejny rok rusza DOPIERO, gdy gość realnie konsumuje galerię:
     przewija przy dnie wyświetlonych albumów (margines ~1,5 ekranu,
     liczone od przycisku „Pokaż więcej”/ostatniego albumu). Rok
     „cienki” (mało albumów) → po dołączeniu warunek wciąż spełniony
     → kolejny rusza od razu (łańcuch).
   - KLIK WYGRYWA: rok niewczytany kliknięty w filtrach → pobór
     NATYCHMIAST, RÓWNOLEGLE do kolejki (stany per rok pilnują
     podwójnego startu); kolejka później pomija rok „ok”.
   - KARTA W TLE: nowy rok nie startuje, dopóki karta jest ukryta
     (visibilitychange); pobór w trakcie dobiega do końca.
   - AWARIE: kolejka po cichu ponawia pobór 2 razy (3 próby); rok
     po porażce = stan „blad” (chip przygaszony, klik = ponowna
     próba), a kolejka jedzie dalej. Trzy porażki z rzędu = kolejka
     staje (nie młócimy martwego API; chipy pozostają klikane).
     Awaria STARTU (bieżący rok) = tryb awaryjny jak dotychczas:
     archiwum zostaje z notką; klik w chip roku może go uratować
     (pierwszy udany pobór zastępuje archiwum i startuje kolejkę).
   - DUPLIKATY NIEMOŻLIWE: pierwsze zastąpienie usuwa całe archiwum
     (zachowując albumy FB dołączone wcześniej kliknięciami), a każdy
     dolaczany rok wyrzuwa beforehand archiwalne albumy SWOJEGO roku.
   - WSKAŹNIKI (zero tekstów — decyzja 1.16.0): piłka w chipie roku
     (pobór w trakcie), piłka pod listą #gal-dol (gość przy dnie i
     coś leci), chip stanu „blad” = przygaszony z podkreśleniem
     kropkowanym + title „kliknij, aby spróbować ponownie”.

   DLACZEGO TAK (koszty, zmierzone 01–02.11): pełne metadane zdjęcia
   z Graph API ≈ 5,2 KB (FB dołącza 9 wariantów rozmiarów), więc:
   okno 2 lat ≈ 5 MB, sam bieżący rok ≈ 2 MB, cała galeria
   2012–2026 ≈ 80 MB. Przyrost + kolejka pod przewijanie = gość
   na 10 s pobiera ~2 MB, a maratończyk przewijający całą historię
   dostaje ją wszystką — ale wtedy faktycznie ją konsumuje.
   Miniatury i tak tylko lazy (loading="lazy") — niezmiennie.

   Pobór i grupowanie żyją we WSPÓLNYM silniku js/galeria-fb-core.js
   (używa go też teaser galerii na stronie głównej — app.js).
   GRUPOWANIE w albumy: post > album nazwany > miesiąc (bez zmian).

   DLACZEGO LUSTRO, A NIE IMPORT (decyzja właściciela 1.11): do repo
   NIE trafia ani bajt danych z FB; przeglądarka gościa pobiera
   metadane + zdjęcia wprost z Graph API / CDN Facebooka. Nowe
   zdjęcia na FB pojawiają się w galerii SAME.

   BEZPIECZNIKI: awaria API przy roku → stan „blad” + klikalny chip;
   awaria startu → archiwum lokalne + notka; posty roku to tylko
   metadane (ich błąd NIE wywala roku — spada na albumy/miesiące);
   twarde limity stronicowania (12 stron ≈ 3 000 zdjęć/rok, silnik)
   i timeouty fetch 25 s.
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

  /* kolejka: 3 porażki z rzędu = stop (chipy pozostają klikane) */
  let KOLEJKA_ZATRZYMANA = false;

  /* — notka statusu (galeria.html #gal-notatka) — */
  const ustawNote = (html) => {
    const n = document.getElementById("gal-notatka");
    if (n) n.innerHTML = html;
  };

  /* — silnik wspólny (js/galeria-fb-core.js) — */
  const FB = window.KTSFB;

  /* ===== scalenie z galeria.js (render wspólny) =====
     GALERIA/FILTR/POKAZ/BATCH/renderFiltry/renderAlbumy to globalne
     deklaracje js/galeria.js — klasyczne skrypty współdzielą zakres. */

  /* zgoda galeria.js na rozpoczęcie zastępowania (bez zmian vs 1.15) */
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

  /* zastąpienie archiwum pierwszym rokiem FB (1.17: JEDEN rok, nie okno).
     Albumy FB dołączone wcześniej (klik podczas awarii startu) —
     zachowywane; archiwum wylatuje w całości. */
  function zastapStatyczne(albumyFB) {
    const byloStatyczne = GALERIA.length > 0;
    const zachowajFB = GALERIA.filter((a) => a.zrodlo === ZRODLO_FB);
    window.__GALFB_ZASTAPIONE = true;   // galeria.js nie nadpisze wyniku wolnym poborem
    GALERIA.length = 0;
    for (const a of [...albumyFB, ...zachowajFB]) GALERIA.push(a);
    GALERIA.sort((a, b) => {
      const da = a.data ?? "", db = b.data ?? "";
      return da > db ? -1 : da < db ? 1 : 0;
    });
    POKAZ = BATCH;                       // nowy widok = od pierwszej paczki
    renderFiltry();
    /* filtr ustawiony na rok, którego dane właśnie zniknęły z archiwum
       (np. 2023/2024) → dociągnij ten rok z FB od razu, bez klepania */
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
    + "dociągana na żywo — start od najnowszego roku, a starsze "
    + "dobiegają same, gdy przewijasz (albo wczytasz je jednym "
    + "kliknięciem w filtrach powyżej). Pliki nie są kopiowane "
    + "do serwisu.";
  const NOTKA_AWARIA = "<strong>Zakres galerii: 2023–2024 (archiwum zapasowe).</strong> "
    + "Zdjęcia z Facebooka są chwilowo niedostępne — odśwież stronę "
    + "za chwilę albo kliknij rok w filtrach, aby spróbować ponownie. "
    + "Na Facebooku klub ma zdjęcia od 2012 roku.";

  const PILKA_NOTKI = FB.pilka("gal-pilka gal-pilka--notka");

  /* ===== C. pobór roku (wspólny dla startu, kolejki i kliknięć) ===== */
  function spanie(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ponawianie po cichu: proby = 1 (klik — gość ma przycisk „Spróbuj
     ponownie”) lub 3 (start/kolejka — po cichu 2 ponowienia) */
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
     zamiast doklejać — zastępuje archiwum i startuje kolejkę. */
  async function pobierzRok(rok, opt) {
    const o = opt || {};
    const r = Number(rok);
    if (!(r >= ROK_NAJSTARSZY && r <= ROK_BIEZACY)) return false;
    const stan = STAN_LAT.get(r);
    if (stan === "ok" || stan === "laduje") return stan === "ok";

    STAN_LAT.set(r, "laduje");
    renderFiltry();                                  // piłka w chipie roku
    if (FILTR === String(r)) renderAlbumy();         // widok filtra: piłka w miejscu albumów
    odswiezDol();
    try {
      const albumy = await sprobuj(() => pobierzDaneRoku(r), o.kolejka ? 3 : 1, 1200);
      zapiszPermalinki(albumy);
      STAN_LAT.set(r, "ok");                         // pusty rok też „ok” (filtr pokaże „brak albumów”)
      if (o.pierwszy && albumy.length) {
        const czekal = await czekajNaStatyczne();
        if (!czekal) console.warn("Lustro galerii FB: archiwum nie potwierdziło startu — zastępuję bez niego.");
        zastapStatyczne(albumy);
        ustawNote(NOTKA_ZAKRESU);
        kolejka(r - 1);                              // od teraz schodzimy w dół
        return true;
      }
      dolaczAlbumyFB(albumy);
      renderFiltry();
      if (FILTR === String(r)) renderAlbumy();
      if (typeof window.przewinDoAlbumu === "function") window.przewinDoAlbumu();
      odswiezDol();
      return true;
    } catch (err) {
      console.error(`Lustro galerii FB — rok ${r} błąd poboru:`, err);
      STAN_LAT.set(r, "blad");
      renderFiltry();                                // chip przygaszony, klikalny
      if (FILTR === String(r)) renderAlbumy();       // panel „Spróbuj ponownie”
      odswiezDol();
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

  /* ===== D. kolejka: rok po roku w dół, pod przewijanie gościa ===== */
  const MARGINES = () => Math.max(900, Math.round(window.innerHeight * 1.5));

  /* gość przy dnie wyświetlonych albumów? (dno = spód #gal-albumy,
     czyli ostatni album albo przycisk „Pokaż więcej”) */
  function goscPrzyDnie() {
    const el = document.getElementById("gal-albumy");
    if (!el) return false;
    return el.getBoundingClientRect().bottom - window.innerHeight < MARGINES();
  }

  /* warunek ruszenia kolejki: karta widoczna, bez filtra roku (gość
     w „Wszystkie” realnie przewija galerię), przy dnie ORAZ z
     skonsumowaną paginacją — dopóki wisi „Pokaż więcej”, gość ma
     jeszcze zapas albumów w pamięci i kolejka nie pali danych
     wyprzedzająco (inaczej dno listy nie przesuwa się po dołączeniu
     roku i kolejka rozładowałaby całą galerię do 2012) */
  function warunekKolejki() {
    if (document.hidden || FILTR !== null) return false;
    const widoczne = GALERIA.filter((a) => !FILTR || (a.data || "").startsWith(FILTR)).length;
    if (widoczne > POKAZ) return false;            // „Pokaż więcej” wisi = jest zapas
    return goscPrzyDnie();
  }

  /* czekaj, aż rok będzie potrzebny — albo aż ktoś ubiegnie kolejkę
     (klik): wtedy stan „ok” i kolejka rok pomija */
  async function czekajAzPotrzebny(rok) {
    for (;;) {
      const stan = STAN_LAT.get(rok);
      if (stan === "ok") return false;               // już jest (klik ubiegł kolejkę)
      if (stan === "laduje") { await spanie(400); continue; }   // klik w trakcie — czekaj na wynik
      if (warunekKolejki()) return true;
      await spanie(400);
    }
  }

  async function kolejka(odRoku) {
    let porazki = 0;
    for (let r = odRoku; r >= ROK_NAJSTARSZY; r--) {
      if (KOLEJKA_ZATRZYMANA) break;
      const potrzebny = await czekajAzPotrzebny(r);
      if (!potrzebny) continue;                      // rok już wczytany (klik)
      const ok = await pobierzRok(r, { kolejka: true });
      porazki = ok ? 0 : porazki + 1;
      if (porazki >= 3) {
        KOLEJKA_ZATRZYMANA = true;
        console.warn("Lustro galerii FB: 3 porażki z rzędu — kolejka zatrzymana (chipy lat pozostają klikane).");
        break;
      }
    }
    odswiezDol();                                    // koniec kolejki — gaś piłkę na dole
  }

  /* ===== piłka pod listą (#gal-dol): „kolejny rok w drodze” ===== */
  function odswiezDol() {
    const el = document.getElementById("gal-dol");
    if (!el) return;
    const wLocie = [...STAN_LAT.values()].includes("laduje");
    el.hidden = !(wLocie && !document.hidden && FILTR === null && goscPrzyDnie());
  }
  window.addEventListener("scroll", odswiezDol, { passive: true });
  window.addEventListener("resize", odswiezDol, { passive: true });
  document.addEventListener("visibilitychange", odswiezDol);

  /* interfejs dla js/galeria.js — dostępny od razu po sparsowaniu
     (galeria.js startuje na DOMContentLoaded, więc zawsze zdąży) */
  window.__GALFB = { lataFB: LATA_FB, stanRoku, wczytajRok };

  /* ===== E. start: bieżący rok (lub pierwszy z albumami) ===== */
  async function start() {
    ustawNote(PILKA_NOTKI);
    STAN_LAT.set(ROK_BIEZACY, "laduje");
    renderFiltry();                                  // piłka w chipie bieżącego roku od razu

    let albumyStart = null;
    let rokStart = null;
    for (let r = ROK_BIEZACY; r >= ROK_NAJSTARSZY; r--) {
      try {
        const a = await sprobuj(() => pobierzDaneRoku(r), 3, 1200);
        STAN_LAT.set(r, "ok");
        if (a.length) { albumyStart = a; rokStart = r; break; }
        /* pusty rok (styczeń) — schodzimy niżej po pierwszy z albumami */
      } catch (err) {
        console.error("Lustro galerii FB — błąd poboru startowego:", err);
        /* tryb awaryjny: archiwum lokalne zostaje wyrenderowane;
           chipy lat (bez 2023/2024 — są w archiwum jako solidne)
           pozostają klikane: pierwszy udany pobór zastąpi archiwum */
        STAN_LAT.set(r, "blad");
        renderFiltry();
        odswiezDol();
        ustawNote(NOTKA_AWARIA);
        return;                                      // kolejka NIE rusza — FB prawdopodobnie leży
      }
    }

    if (!rokStart) {
      /* FB odpowiada, ale 0 zdjęć w wszystkich latach — bardzo nieprawdopodobne */
      ustawNote(NOTKA_AWARIA);
      return;
    }

    zapiszPermalinki(albumyStart);
    const czekal = await czekajNaStatyczne();
    if (!czekal) {
      console.warn("Lustro galerii FB: statyczne archiwum nie potwierdziło startu — zastępuję bez niego.");
    }
    zastapStatyczne(albumyStart);
    ustawNote(NOTKA_ZAKRESU);
    /* od teraz lata schodzą same — pod przewijanie gościa */
    kolejka(rokStart - 1);
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
    kolejkaZatrzymana: () => KOLEJKA_ZATRZYMANA,
  };
})();
