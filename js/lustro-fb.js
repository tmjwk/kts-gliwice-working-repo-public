/* ============================================================
   KTS Gliwice — LUSTRO FB (1.9.0 — TEST)
   Najnowsze posty z Facebooka renderowane NA ŻYWO w przeglądarce.

   Architektura (decyzja właściciela, 29.10):
   - MIRROR: dane pobierane bezpośrednio z Graph API przy każdej
     wizycie; do repo NIE trafia ani jeden bajt danych z FB
     (żadnych JSON-ów ani zdjęć — obrazki to świeże, podpisane
     URL-e CDN, ważne dla bieżącej sesji),
   - read-only: token ma wyłącznie pages_show_list +
     pages_read_engagement (audyt 29.10: próba zapisu → HTTP 403),
   - TRYB TESTOWY: źródłem jest fanpage klubu (KTS Gliwice,
     rola z biznesu klubowego potwierdzona 30.10) — podmiana
     testowego Stek Chaty wykonana; token read-only,
   - fail-safe: kontener #lustro-fb jest domyślnie hidden;
     jeśli pobór się nie uda (sieć, token, limit), sekcja po
     prostu się nie pokazuje — reszta strony działa jak dawniej,
   - zero cookie, zero localStorage, zero SDK (RODO-clean).

   Wycofanie: usunąć <script> + kontener z index.html (albo
   samo wywołanie init() poniżej) — sekcja znika bez śladu.
   ============================================================ */
"use strict";

(() => {
  /* ---- KONFIGURACJA (jedyne miejsce do podmiany test→produkcja) ---- */
  const PAGE_ID = "167636963360765";         // KTS Gliwice (fanpage klubu)
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS7DZB6gwLbQMnd9ZAECEojkZBqnW8Mw8yP1eZBrIz1b3H21nkLegyL2GZAsB8LKJLaWSAObAZAxwqWyHzFBcuT46kczo6DLrd3YVhofKwJpQkM0lsZCW01zkUYSZBVZBiFhY783c4lZAzMykcBRfIOuvLYZClOyoehMQTGPL06mny6OeIt2SCkwI3ZCLZAy8ZD";  // page token KTS (read-only)
  const LIMIT = 3;                            // kart w pasku
  const API = "https://graph.facebook.com/v22.0";

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  const formatujDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pl-PL",
      { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /** Tytuł = pierwsza niepusta linijka postu (ucięta do 90 znaków). */
  const tytulZPostu = (msg) => {
    const pierwsza = String(msg || "").split("\n")
      .map((l) => l.trim()).filter(Boolean)[0] || "(wpis bez tekstu)";
    return pierwsza.length > 90 ? pierwsza.slice(0, 87) + "…" : pierwsza;
  };

  /** Zajawka = reszta treści (bez pierwszej linijki), ok. 150 znaków. */
  const zajawkaZPostu = (msg) => {
    const lines = String(msg || "").split("\n")
      .map((l) => l.trim()).filter(Boolean);
    const reszta = lines.slice(1).join(" ");
    const t = (reszta || lines[0] || "").slice(0, 150);
    return (t.length >= 150 ? t.slice(0, 147) + "…" : t) || "—";
  };

  const karta = (p) => `
    <a class="card news-card lustro-karta" href="${esc(p.permalink_url)}"
       target="_blank" rel="noopener"
       aria-label="Post na Facebooku: ${esc(tytulZPostu(p.message))}">
      <div class="news-media${p.full_picture ? " news-media-img" : " news-media-brak"}">
        ${p.full_picture
          ? `<img src="${esc(p.full_picture)}" alt="" loading="lazy" decoding="async">`
          : `<span aria-hidden="true">🏓</span>`}
      </div>
      <div class="card-body">
        <span class="t-small t-nums text-primary">${formatujDate(p.created_time)}</span>
        <h3 class="t-h4">${esc(tytulZPostu(p.message))}</h3>
        <p class="t-small muted">${esc(zajawkaZPostu(p.message))}</p>
        <span class="lustro-wiecej t-small">Zobacz na Facebooku&nbsp;↗</span>
      </div>
    </a>`;

  async function init() {
    const kontener = $("#lustro-fb");
    const grid = $("#lustro-fb-grid");
    if (!kontener || !grid) return;            // brak kontenera = stop

    const url = `${API}/${PAGE_ID}/posts`
      + `?fields=id,message,created_time,permalink_url,full_picture`
      + `&limit=${LIMIT}&access_token=${ACCESS_TOKEN}`;

    const kontrola = new AbortController();
    const zegar = setTimeout(() => kontrola.abort(), 10000);
    try {
      const r = await fetch(url, { signal: kontrola.signal });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const posty = Array.isArray(d.data) ? d.data : [];
      if (!posty.length) throw new Error("brak postów");

      grid.innerHTML = posty.map(karta).join("");
      kontener.hidden = false;                  // pokaz dopiero po sukcesie
    } catch (e) {
      /* fail-safe: sekcja zostaje ukryta, strona działa jak bez lustra */
      console.warn("[lustro-fb] pominięto:", e.message);
    } finally {
      clearTimeout(zegar);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
