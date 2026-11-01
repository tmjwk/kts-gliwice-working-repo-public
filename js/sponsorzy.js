/* ============================================================
   KTS Gliwice — SPONSORZY I PARTNERZY (1.18.0)

   Sekcja na stronie głównej. Dane: sponsorzy.json w korzeniu strony,
   generowany automatycznie z arkusza Google właściciela (skrypt
   scripts/sync_sponsorzy.ts w GitHub Actions, co 2 h). Właściciel
   edytuje ARKUSZ — nie kod strony.

   ZASADY (decyzje właściciela 02.11, domknięte Q11):
   - układ PŁASKI: wszystkie aktywne podmioty w jednym rzędzie,
     kolejność jak w arkuszu (kolumna LP), bez nagłówków grup;
   - kafelka: biała, cienka ramka, logo o jednolitej wysokości,
     delikatnie przygaszone → pełny kolor po najechaniu;
   - klik = strona sponsora w NOWEJ KARCIE (klikalna cała kafelka);
   - loga HOTLINKIEM z adresów z arkusza. Gdy cudzy serwer odmówi
     (404, 429, blokada hotlinków), kafelka NIE pokazuje zepsutego
     obrazka — degraduje się elegancko do nazwy tekstowej;
   - brak pliku / pusta lista / błąd sieci = cała sekcja znika
     (sekcja.hidden) — bez pustej ramki w środku strony.

   Samowystarczalny moduł, zero zależności od app.js/galeria.js.
   ============================================================ */
"use strict";

(function () {
  /* podwójne podpięcie (skrypt na stronie dwa razy?) — nic nie robić */
  if (window.__KTS_SPONSORZY) return;
  window.__KTS_SPONSORZY = true;

  const sekcja = document.querySelector("section.sponsors");
  const rzad = document.querySelector(".sponsors-row");

  /* sekcja znika w całości — atrybut hidden ma !important w stylach
     strony (wygrywa z display z klas), więc zadziała też na future-klasach */
  const ukryjSekcje = () => { if (sekcja) sekcja.hidden = true; };

  /* degradacja hotlinku: kafelka bez obrazka, za to z nazwą */
  const zamienNaTekst = (kafelka, nazwa) => {
    kafelka.classList.add("sponsor-tile--tekst");
    kafelka.textContent = "";
    const n = document.createElement("span");
    n.className = "sponsor-nazwa";
    n.textContent = nazwa;
    kafelka.appendChild(n);
  };

  const kafelka = (s) => {
    const klikalna = Boolean(s.url);
    const el = document.createElement(klikalna ? "a" : "span");
    el.className = "sponsor-tile";
    if (klikalna) {
      el.href = s.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
    if (s.logo) {
      const img = document.createElement("img");
      img.src = s.logo;
      img.alt = s.nazwa; // dostępność: nazwa firmy czytana przez czytniki
      img.loading = "lazy"; // sekcja na dole strony — loga ściągnięte dopiero przy scrollu
      img.decoding = "async";
      img.addEventListener("error", () => zamienNaTekst(el, s.nazwa));
      el.appendChild(img);
    } else {
      zamienNaTekst(el, s.nazwa); // wpis bez logo w arkuszu → od razu tekstowo
    }
    return el;
  };

  /* no-cache = rewalidacja ETag (304, kilkadziesiąt bajtów) — ten sam
     wzorzec co wersja.json i dane.json w app.js: świeżość bez szumu */
  fetch("sponsorzy.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((d) => {
      const lista = Array.isArray(d && d.sponsorzy) ? d.sponsorzy : [];
      if (!rzad || lista.length === 0) { ukryjSekcje(); return; }
      rzad.textContent = ""; // znika placeholder projektowy [LOGO 1]…
      for (const s of lista) rzad.appendChild(kafelka(s));
    })
    .catch(ukryjSekcje);
})();
