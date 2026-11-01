/* ============================================================
   KTS Gliwice — O KLUBIE: lustro dokumentu Google + trójkącik (1.19.0)

   Sekcja #oklubie na stronie głównej. Dane: o-klubie.json w korzeniu
   strony, generowany automatycznie z dokumentu Google właściciela
   (skrypt scripts/sync_o_klubie.ts w GitHub Actions, co 2 h).
   Właściciel edytuje DOKUMENT — nie kod strony.

   ZASADY (decyzja właściciela 02.11):
   - widoczny PIERWSZY AKAPIT dokumentu, po nim przycisk z TRÓJKĄCIKIEM
     (▾) rozwijający resztę treści; po rozwinięciu trójkącik obraca się
     do góry (▴), etykieta zmienia się na „Zwiń”;
   - dostępność: prawdziwy <button> + aria-expanded + aria-controls;
     zwinięta treść ma atrybut hidden (wypada z tabulacji i czytników);
   - HTML w index.html zawiera STATYCZNY pierwszy akapit (SEO, brak JS);
     ten moduł podmienia go na treść z o-klubie.json i dopiero wtedy
     dokłada rozwijanie — brak pliku / błąd sieci = zostaje fallback;
   - treść budujemy przez createElement + textContent (nigdy innerHTML
     z danych zdalnych — zero ryzyka wstrzyknięcia HTML z dokumentu).

   Samowystarczalny moduł, zero zależności od app.js/sponsorzy.js.
   ============================================================ */
"use strict";

(function () {
  /* podwójne podpięcie (skrypt na stronie dwa razy?) — nic nie robić */
  if (window.__KTS_OKLUBIE) return;
  window.__KTS_OKLUBIE = true;

  const pojemnik = document.getElementById("oklubie-tresc");
  if (!pojemnik) return;

  const ETYKIETA_ROZWIN = "Rozwiń";
  const ETYKIETA_ZWIN = "Zwiń";

  /* pojedynczy element dokumentu → węzeł DOM (nagłówek / lista / akapit) */
  const wezel = (e) => {
    if (e.typ === "naglowek") {
      const h = document.createElement("h3");
      h.className = "oklubie-naglowek";
      h.textContent = e.tekst;
      return h;
    }
    if (e.typ === "ul") {
      const ul = document.createElement("ul");
      ul.className = "oklubie-lista";
      for (const p of Array.isArray(e.punkty) ? e.punkty : []) {
        const li = document.createElement("li");
        li.textContent = p;
        ul.appendChild(li);
      }
      return ul;
    }
    const p = document.createElement("p");
    p.className = "oklubie-akapit";
    p.textContent = e.tekst || "";
    return p;
  };

  /* no-cache = rewalidacja ETag (304, kilkadziesiąt bajtów) — ten sam
     wzorzec co wersja.json, dane.json i sponsorzy.json */
  fetch("o-klubie.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((d) => {
      const elementy = Array.isArray(d && d.elementy) ? d.elementy : [];
      if (elementy.length === 0) return; // pusty plik → zostaje fallback statyczny

      const wstep = wezel(elementy[0]);
      if (wstep.nodeName === "P") wstep.classList.add("oklubie-prowadzenie");
      const reszta = elementy.slice(1);

      pojemnik.textContent = ""; // znika statyczny fallback z HTML
      pojemnik.appendChild(wstep);

      if (reszta.length === 0) return; // jednoakapitowy dokument — bez trójkącika

      const rozwijane = document.createElement("div");
      rozwijane.id = "oklubie-rozwijane";
      rozwijane.className = "oklubie-rozwijane";
      rozwijane.hidden = true;
      for (const e of reszta) rozwijane.appendChild(wezel(e));

      const trojkat = document.createElement("span");
      trojkat.className = "oklubie-trojkat";
      trojkat.setAttribute("aria-hidden", "true");

      const etykieta = document.createElement("span");
      etykieta.className = "oklubie-etykieta";
      etykieta.textContent = ETYKIETA_ROZWIN;

      const przycisk = document.createElement("button");
      przycisk.type = "button";
      przycisk.className = "oklubie-przelacz";
      przycisk.setAttribute("aria-expanded", "false");
      przycisk.setAttribute("aria-controls", "oklubie-rozwijane");
      przycisk.append(trojkat, etykieta);

      przycisk.addEventListener("click", () => {
        const otwarte = przycisk.getAttribute("aria-expanded") === "true";
        przycisk.setAttribute("aria-expanded", String(!otwarte));
        rozwijane.hidden = otwarte;
        etykieta.textContent = otwarte ? ETYKIETA_ROZWIN : ETYKIETA_ZWIN;
      });

      pojemnik.append(przycisk, rozwijane);
    })
    .catch(() => {
      /* błąd sieci/brak pliku → nic nie robimy: sekcja pokazuje
         statyczny pierwszy akapit z index.html (pełnia funkcji wróci
         razem z kolejnym udanym syncem) */
    });
})();
