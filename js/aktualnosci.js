/* ============================================================
   KTS Gliwice — strona statyczna: sekcja Aktualności
   — migracja WordPress 2025–26 (1.6.5).

   Dane: aktualnosci.json (85 wpisów, wygenerowany przez
   scripts/aktualnosci_staging.py). Docelowo ten sam plik
   będzie karmiony przez lustro FB (wariant B) — wtedy
   fbPostId przejmie deduplikację i nic tu się nie zmienia.

   Zachowanie:
   - 9 kart na start, „Pokaż więcej" dokłada po 9,
   - klik na karcie otwiera <dialog> z pełnym wpisem
     (akapity; markery [OBRAZ: 💪] → emoji),
   - brak pliku/błąd sieci = zostają placeholdery HTML
     (sekcja nie umiera, gdy dane nie dojadą).
   ============================================================ */
"use strict";

(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const NA_START = 9;
  const PORCJA = 9;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  const formatujDate = (iso) => {
    const [r, m, d] = iso.split("-");
    return `${d}.${m}.${r}`;
  };

  /** Markery [OBRAZ: 💪] → emoji; treść → akapity (split \n\n). */
  const akapity = (tresc) => tresc
    .replace(/\[OBRAZ:\s*([^\]]*)\]/g, "$1")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const stan = { posty: [], widoczne: NA_START };

  function karta(p) {
    const media = p.okladka
      ? `<img src="${esc(p.okladka)}" alt="${esc(p.tytul)}" loading="lazy" decoding="async">`
      : `<span aria-hidden="true">🏓</span>`;
    const lqipStyle = p.lqip ? ` style="background-image:url('${p.lqip}')"` : "";
    return `
      <article class="card news-card news-klik" data-slug="${esc(p.slug)}"
               tabindex="0" role="button"
               aria-label="Czytaj: ${esc(p.tytul)}">
        <div class="news-media news-media-img${p.okladka ? "" : " news-media-brak"}"${lqipStyle}>${media}</div>
        <div class="card-body">
          <span class="t-small t-nums text-primary">${formatujDate(p.data)}</span>
          <h3 class="t-h4">${esc(p.tytul)}</h3>
          <p class="t-small muted">${esc(p.zajawka)}</p>
        </div>
      </article>`;
  }

  function render() {
    const grid = $("#aktualnosci-grid");
    if (!grid) return;
    const podglad = stan.posty.slice(0, stan.widoczne);
    grid.innerHTML = podglad.map(karta).join("");

    const przycisk = $("#aktualnosci-more");
    if (przycisk) {
      const zostalo = stan.posty.length - stan.widoczne;
      przycisk.hidden = zostalo <= 0;
      if (zostalo > 0) {
        przycisk.querySelector("#aktualnosci-more-n").textContent = zostalo;
      }
    }
    grid.querySelectorAll(".news-klik").forEach((el) => {
      const slug = el.getAttribute("data-slug");
      const otworz = () => otworzWpis(stan.posty.find((p) => p.slug === slug));
      el.addEventListener("click", otworz);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); otworz(); }
      });
    });
  }

  function otworzWpis(p) {
    if (!p) return;
    const dlg = $("#aktualnosci-dialog");
    if (!dlg) return;
    dlg.querySelector('[data-pole="okladka"]').innerHTML = p.okladka
      ? `<img src="${esc(p.okladka)}" alt="${esc(p.tytul)}">`
      : "";
    dlg.querySelector('[data-pole="data"]').textContent = formatujDate(p.data);
    dlg.querySelector('[data-pole="tytul"]').textContent = p.tytul;
    dlg.querySelector('[data-pole="tresc"]').innerHTML = akapity(p.tresc)
      .map((a) => `<p>${esc(a).replace(/\n/g, "<br>")}</p>`).join("");
    const orig = dlg.querySelector('[data-pole="oryginal"]');
    if (orig) { orig.href = p.staryUrl; orig.hidden = false; }
    dlg.showModal();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dlg = $("#aktualnosci-dialog");
    if (dlg) {
      dlg.addEventListener("click", (e) => {
        // klik w tło (nie w treść) zamyka — standard dostępnych dialogów
        if (e.target === dlg) dlg.close();
      });
      const zamykacz = dlg.querySelector('[data-akcja="zamknij"]');
      if (zamykacz) zamykacz.addEventListener("click", () => dlg.close());
    }

    const more = $("#aktualnosci-more");
    if (more) {
      more.addEventListener("click", () => {
        stan.widoczne += PORCJA;
        render();
      });
    }

    fetch("aktualnosci.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!Array.isArray(json.posty) || json.posty.length === 0) return;
        stan.posty = json.posty;
        const zrodlo = $("#aktualnosci-zrodlo");
        if (zrodlo) {
          zrodlo.textContent = `Migracja WordPress 2025–26 · ${json.posty.length} wpisów · docelowo mirror FB (wariant B)`;
        }
        render();
      })
      .catch(() => { /* brak danych = zostają placeholdery */ });
  });
})();
