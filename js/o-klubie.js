/* ============================================================
   KTS Gliwice — O KLUBIE: lustro dokumentu Google + trójkącik (1.20.1)

   Sekcja #oklubie na stronie głównej. Dane: o-klubie.json w korzeniu
   strony, generowany automatycznie z dokumentu Google właściciela
   (skrypt scripts/sync_o_klubie.ts w GitHub Actions, co 2 h).
   Właściciel edytuje DOKUMENT — nie kod strony.

   ZASADY (decyzja właściciela 02.11):
   - 1.22.0: widoczny CAŁY WSTĘP dokumentu — wszystkie akapity przed
     pierwszym nagłówkiem sekcji (właściciel: „miałaś pokazywać cały
     pierwszy akapit” — w dokumencie wstęp to dwa akapity, a przycisk
     rozwalał tekst w pół zdania); po wstępie przycisk z TRÓJKĄCIKIEM
     (▾) rozwijający resztę treści; po rozwinięciu trójkącik obraca
     się do góry (▴), etykieta zmienia się na „Zwiń”;
   - 1.20.1: przyciski po PRAWEJ (strefa flex) + DOLNY „Zwiń” na końcu
     rozwiniętej treści — nie trzeba przewijać do góry, aby zwinąć;
     po zwinięciu dolnym przyciskiem strona wraca do początku sekcji
     (scroll-margin-top chroni nagłówek przed przyklejonym headerem);
   - dostępność: prawdziwe <button> + aria-expanded + aria-controls
     (oba przyciski współdzielą stan); zwinięta treść ma atrybut hidden
     (wypada z tabulacji i czytników) — dolny przycisk także, bo żyje
     WEWNĄTRZ rozwijanej treści;
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

      /* 1.22.0: wstęp = WSZYSTKIE elementy przed pierwszym nagłówkiem
         sekcji (typowo 2 akapity). Dokument bez wstępu (zaczyna się od
         nagłówka) → pokazujemy pierwszy element, żeby sekcja nie była
         pusta; dokument bez nagłówków w ogóle → całość widoczna,
         bez przycisku. */
      const granica = elementy.findIndex((e) => e.typ === "naglowek");
      const ileWstepu = granica > 0 ? granica : granica === 0 ? 1 : elementy.length;
      const czescWstepu = elementy.slice(0, ileWstepu);
      const reszta = elementy.slice(ileWstepu);

      pojemnik.textContent = ""; // znika statyczny fallback z HTML
      czescWstepu.forEach((e, i) => {
        const n = wezel(e);
        if (i === 0 && n.nodeName === "P") n.classList.add("oklubie-prowadzenie");
        pojemnik.appendChild(n);
      });

      if (reszta.length === 0) return; // wstęp = cały dokument — bez trójkącika

      const rozwijane = document.createElement("div");
      rozwijane.id = "oklubie-rozwijane";
      rozwijane.className = "oklubie-rozwijane";
      rozwijane.hidden = true;
      for (const e of reszta) rozwijane.appendChild(wezel(e));

      const zrobTrojkat = () => {
        const t = document.createElement("span");
        t.className = "oklubie-trojkat";
        t.setAttribute("aria-hidden", "true");
        return t;
      };

      /* górny przycisk: Rozwiń ↔ Zwiń (1.20.1: w strefie = po prawej) */
      const etykieta = document.createElement("span");
      etykieta.className = "oklubie-etykieta";
      etykieta.textContent = ETYKIETA_ROZWIN;

      const przycisk = document.createElement("button");
      przycisk.type = "button";
      przycisk.className = "oklubie-przelacz";
      przycisk.setAttribute("aria-expanded", "false");
      przycisk.setAttribute("aria-controls", "oklubie-rozwijane");
      przycisk.append(zrobTrojkat(), etykieta);

      const strefa = document.createElement("div");
      strefa.className = "oklubie-przelacz-strefa";
      strefa.appendChild(przycisk);

      /* 1.20.1 — dolny „Zwiń”: żyje wewnątrz rozwijanej treści, więc
         znika razem z nią; trójkącik wskazuje w górę (stan rozwinięcia
         = aria-expanded true na przycisku), klik zwija i wraca do
         początku sekcji */
      const etykietaDol = document.createElement("span");
      etykietaDol.className = "oklubie-etykieta";
      etykietaDol.textContent = ETYKIETA_ZWIN;

      const przyciskDol = document.createElement("button");
      przyciskDol.type = "button";
      przyciskDol.className = "oklubie-przelacz oklubie-przelacz--dol";
      przyciskDol.setAttribute("aria-expanded", "true");
      przyciskDol.setAttribute("aria-controls", "oklubie-rozwijane");
      przyciskDol.append(zrobTrojkat(), etykietaDol);

      const strefaDol = document.createElement("div");
      strefaDol.className = "oklubie-przelacz-strefa";
      strefaDol.appendChild(przyciskDol);
      rozwijane.appendChild(strefaDol);

      /* wspólny stan — oba przyciski tego samego regionu */
      const ustawStan = (otwarte) => {
        przycisk.setAttribute("aria-expanded", String(otwarte));
        przyciskDol.setAttribute("aria-expanded", String(otwarte));
        rozwijane.hidden = !otwarte;
        etykieta.textContent = otwarte ? ETYKIETA_ZWIN : ETYKIETA_ROZWIN;
      };

      const zwin = (doPoczatkuSekcji) => {
        ustawStan(false);
        if (doPoczatkuSekcji) {
          // po zwinięciu od dołu treść pod skokiem ucieka w górę —
          // przewijamy do nagłówka sekcji (scroll-margin-top w CSS
          // robi luz na przyklejony header); smooth z html{scroll-behavior}
          const sekcja = document.getElementById("oklubie");
          if (sekcja && sekcja.scrollIntoView) sekcja.scrollIntoView({ block: "start" });
        }
      };

      przycisk.addEventListener("click", () => {
        ustawStan(przycisk.getAttribute("aria-expanded") !== "true");
      });
      przyciskDol.addEventListener("click", () => zwin(true));

      pojemnik.append(strefa, rozwijane);
    })
    .catch(() => {
      /* błąd sieci/brak pliku → nic nie robimy: sekcja pokazuje
         statyczny pierwszy akapit z index.html (pełnia funkcji wróci
         razem z kolejnym udanym syncem) */
    });
})();
