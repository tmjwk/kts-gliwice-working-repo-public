/* ============================================================
   KTS Gliwice — LUSTRO GALERII FB (1.13.0)

   Albumy z lat 2025–2026 dociągane NA ŻYWO z Facebooka klubu —
   dokładnie tak samo jak aktualności (js/lustro-fb.js), tylko
   zamiast kafelków postów: albumy zdjęć w galerii.

   DLACZEGO LUSTRO, A NIE IMPORT (decyzja właściciela 1.11):
   - repo produkcyjne ma ograniczone miejsce (~324 MB, galeria
     statyczna 2023–2024 to 279 MB) — kopiowanie ~960 zdjęć
     z FB by je zapełniło;
   - do repo NIE trafia ani bajt danych z FB: przeglądarka gościa
     pobiera metadane + zdjęcia wprost z Graph API / CDN Facebooka
     przy każdej wizycie (świeże, podpisane URL-e CDN);
   - zero utrzymania: nowe albumy na FB pojawiają się w galerii
     SAME (bez re-importu, bez syncu, bez GitHub Actions).

   ARCHITEKTURA (2 równoległe pobory, potem scalenie):
   A) /{page}/posts  — posty od 2025-01-01 z załącznikami:
      grupowanie zdjęć w ALBUMY (1 post = 1 album), tytuł =
      pierwsza linia treści, permalink do oryginału;
   B) /{page}/photos?type=uploaded&since=2025-01-01 — mapa
      photo_id → warianty obrazów: miniatura ~480 px (siatka)
      + największy wariant (lightbox, do 1600 px).

   SCALANIE: albumy FB dostają kształt rekordów galeria.json
   (slug/tytul/data/zdjecia/miniatury/zrodlo), więc DOŁĄCZAJĄ
   SIĘ do istniejącego renderu js/galeria.js BEZ żadnej zmiany
   w tym pliku: te same filtry roku (2023–2026), ten sam
   lightbox, to samo sortowanie. Statyczne archiwum 2023–2024
   pozostaje nietknięte (bajt-w-bajt).

   TOKEN: page token z tokenu UŻYTKOWNIKA SYSTEMOWEGO biznesu
   klubowego (od właściciela, 1.11) — wieczny (expires = 0,
   data_access = 0, zweryfikowane debug_tokenem), read-only:
   pages_show_list + pages_read_engagement. Publiczne dane
   fanpage'a; token nie daje żadnych uprawnień do zapisu
   (audyt: próba zapisu → HTTP 403).

   BEZPIECZNIKI:
   - awaria API / timeout / brak sieci → galeria pokazuje
     statyczne archiwum 2023–2024 + notkę o niedostępności
     (nic się nie sypie);
   - zdjęcie bez wariantu w /photos → fallback na-src z posta;
   - post bez tytułu → „Zdjęcia z FB · DD.MM.RRRR”;
   - twarde limity stronicowania (12 stron) i timeouty fetch.
   ============================================================ */
"use strict";

(function () {
  const PAGE_ID = "167636963360765";
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS4LeihUEbKntpD59u4UFYZAuAXDKWg0U2OM9HkrtERFevhAM4ulaDyLfsoc1KufBoZB5XeIFTKZBE2eKMhWgWpHv9lidVxMLzh3bUek2SD59uZASM7WuvwpWmwZCySldscl3KZC3oCafaajgA9fR6PfNV9z9cE0ZBN0wqa3lQ5tTUCM6aVg2hZCLopMZD";
  const API = "https://graph.facebook.com/v22.0";
  const OD_ROKU = "2025";              // od tego roku lustro (wcześniej archiwum statyczne)
  const LIMIT_POSTOW = 100;
  const LIMIT_ZDJEC = 250;
  const MAX_STRON = 12;
  const TIMEOUT_MS = 25000;

  /* — notka statusu (galeria.html #gal-notatka) — */
  const ustawNote = (html) => {
    const n = document.getElementById("gal-notatka");
    if (n) n.innerHTML = html;
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  const fmData = (iso) => (iso ? iso.split("-").reverse().join(".") : "");

  async function pobierz(url) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      if (!r.ok) {
        let tresc = "";
        try { tresc = (await r.clone().text()).slice(0, 200); } catch (e) { /* ignore */ }
        const sciezka = (() => { try { return new URL(url).pathname; } catch (e) { return "?"; } })();
        throw new Error(`HTTP ${r.status} (${sciezka}) ${tresc}`);
      }
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  /* ===== A. posty 2025+ → grupowanie na albumy ===== */
  async function pobierzPosty() {
    const pola = "created_time,message,permalink_url,"
      + "attachments.limit(60){type,media{image{src}},target{id},"
      + "subattachments.limit(60){type,media{image{src}},target{id}}}";
    const out = [];
    let url = `${API}/${PAGE_ID}/posts?fields=${encodeURIComponent(pola)}`
      + `&limit=${LIMIT_POSTOW}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < MAX_STRON && url; s++) {
      const resp = await pobierz(url);
      let stop = false;
      for (const p of (resp.data || [])) {
        // stronicujemy do najstarszego postu roku OD_ROKU (posty idą od najnowszych)
        if ((p.created_time || "") < `${OD_ROKU}-01-01`) { stop = true; break; }
        out.push(p);
      }
      if (stop) break;
      url = (resp.paging || {}).next;
    }
    return out;
  }

  function zdjeciaZPosta(p) {
    const wynik = [];
    const zbierz = (att) => {
      if (att.type !== "photo") return;
      const src = ((att.media || {}).image || {}).src;
      if (src) wynik.push({ id: (att.target || {}).id || null, src });
    };
    for (const a of ((p.attachments || {}).data || [])) {
      zbierz(a);
      for (const s of ((a.subattachments || {}).data || [])) zbierz(s);
    }
    const widziane = new Set();
    return wynik.filter((z) => {
      const k = z.id || z.src;
      if (widziane.has(k)) return false;
      widziane.add(k);
      return true;
    });
  }

  function tytulZPosta(p) {
    const linie = (p.message || "").split("\n").map((l) => l.trim());
    const pierwsza = linie.find((l) => l.length > 1) || "";
    const bezUrl = pierwsza.replace(/https?:\/\/\S+/, "").trim();
    const t = bezUrl || pierwsza;
    if (!t) return "";
    return t.length > 90 ? t.slice(0, 87).replace(/\s+\S*$/, "") + "…" : t;
  }

  /* ===== B. mapa photo_id → warianty (mini do siatki, pełna do lightboksa) ===== */
  async function pobierzMapeZdjec() {
    const mapa = new Map();
    let url = `${API}/${PAGE_ID}/photos?type=uploaded&since=${OD_ROKU}-01-01`
      + `&fields=id,images&limit=${LIMIT_ZDJEC}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < MAX_STRON && url; s++) {
      const resp = await pobierz(url);
      for (const f of (resp.data || [])) {
        const ims = (f.images || [])
          .slice()
          .sort((a, b) => (b.width || 0) - (a.width || 0));
        if (!ims.length) continue;
        let mini = ims[ims.length - 1];          // najmniejszy ≥ 480 px (iterując od największego)
        for (const i of ims) if ((i.width || 0) >= 480) mini = i;
        mapa.set(String(f.id), { mini: mini.source, pelna: ims[0].source });
      }
      url = (resp.paging || {}).next;
    }
    return mapa;
  }

  /* ===== scalenie z galeria.js (bez zmian w tamtym pliku) =====
     GALERIA/renderStatystyki/renderFiltry/renderAlbumy to globalne
     deklaracje js/galeria.js — klasyczne skrypty współdzielą zakres. */
  const PERMALINKI = new Map();   // slug fb-* → permalink posta

  function czekajNaStatyczne(tryb) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (Array.isArray(GALERIA) && GALERIA.length > 0) return resolve(true);
        if (Date.now() - t0 > 30000) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

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
    renderStatystyki();
    renderFiltry();
    renderAlbumy();
    return dodane;
  }

  /* linki „Zobacz na Facebooku” — doklejane po każdym renderze
     (także po zmianie filtra roku, bo renderAlbumy przebudowuje DOM) */
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

  /* ===== start ===== */
  async function start() {
    ustawNote("<strong>Lata 2025–2026:</strong> dociągam albumy z Facebooka klubu…");

    let posty, mapa;
    try {
      [posty, mapa] = await Promise.all([pobierzPosty(), pobierzMapeZdjec()]);
    } catch (err) {
      console.error("Lustro galerii FB — błąd poboru:", err);
      ustawNote(
        "<strong>Zakres galerii: 2023–2024.</strong> " +
        "Albumy z lat 2025–2026 (Facebook) są chwilowo niedostępne — " +
        "odśwież stronę za chwilę. Archiwum działa normalnie.");
      return;
    }

    /* albumy: 1 post ze zdjęciami = 1 album */
    const albumy = [];
    const wykorzystane = new Set();   // zdjęcie należy do pierwszego posta, który je zawarł
    for (const p of posty) {
      const fotos = zdjeciaZPosta(p).filter((z) => {
        const k = z.id || z.src;
        if (wykorzystane.has(k)) return false;
        return true;
      });
      if (!fotos.length) continue;
      fotos.forEach((z) => wykorzystane.add(z.id || z.src));

      const data = (p.created_time || "").slice(0, 10);
      const tytul = tytulZPosta(p) || `Zdjęcia z FB${data ? " · " + fmData(data) : ""}`;
      const slug = `fb-${p.id}`;
      const zdjecia = [], miniatury = [];
      for (const z of fotos) {
        const w = z.id ? mapa.get(String(z.id)) : null;
        miniatury.push((w && w.mini) || z.src);
        zdjecia.push((w && w.pelna) || z.src);
      }
      albumy.push({
        slug,
        tytul,
        data: data || null,
        zdjecia,
        miniatury,
        zrodlo: "Facebook (na żywo)",
      });
      if (p.permalink_url) PERMALINKI.set(slug, p.permalink_url);
    }

    const czekal = await czekajNaStatyczne();
    const dodane = dolaczAlbumyFB(albumy);

    const nZdjec = albumy.reduce((s, a) => s + a.zdjecia.length, 0);
    ustawNote(
      "<strong>Zakres galerii: 2023–2026.</strong> " +
      "Lata 2023–2024 — archiwum starej strony klubu; lata 2025–2026 — " +
      `<span class="t-nums">${dodane} albumów · ${nZdjec} zdjęć</span> ` +
      "dociągnięte na żywo z Facebooka klubu. " +
      "Pliki nie są kopiowane do serwisu — nowe albumy pojawiają się automatycznie.");
    if (!czekal) {
      console.warn("Lustro galerii FB: statyczne archiwum się nie załadowało — pokazuję tylko albumy FB.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* diagnostyka (warsztat): ręczne odpalenie poborów z konsoli */
  window.__GFB = { pobierzPosty, pobierzMapeZdjec };
})();
