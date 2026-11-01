/* ============================================================
   KTS Gliwice — GALERIA FB: WSPÓLNY SILNIK (1.15.0)

   Jedno źródło prawdy dla poboru i grupowania zdjęć z zakładki
   „Zdjęcia” fanpage'a, używane przez:
   - js/galeria-fb.js  (podstrona galeria.html — pełne lustra lat),
   - js/app.js         (strona główna — teaser okładek na żywo).

   Względem 1.14.x logicznie bez zmian (źródło = /photos?type=uploaded,
   posty TYLKO jako metadane: tytuł + permalink; grupowanie
   post > album nazwany > miesiąc; dedup photo_id), dorzucone:
   - albumy niosą własny link FB (pole fbLink) zamiast mapy z boku,
   - pomocniki tekstu: liczba() — polska odmiana liczebnika
     (1 album / 2–4 albumy / 5+ albumów), zakresLat() — „2012, 2023–2026”,
     fmtLiczba() — separator tysięcy spacją nierozdzielającą.

   TOKEN: page token z tokenu użytkownika systemowego biznesu klubowego
   — wieczny (expires = 0, data_access = 0), read-only
   (pages_show_list + pages_read_engagement; audyt: zapis → HTTP 403).
   ============================================================ */
"use strict";

window.KTSFB = (function () {
  const PAGE_ID = "167636963360765";
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS4LeihUEbKntpD59u4UFYZAuAXDKWg0U2OM9HkrtERFevhAM4ulaDyLfsoc1KufBoZB5XeIFTKZBE2eKMhWgWpHv9lidVxMLzh3bUek2SD59uZASM7WuvwpWmwZCySldscl3KZC3oCafaajgA9fR6PfNV9z9cE0ZBN0wqa3lQ5tTUCM6aVg2hZCLopMZD";
  const API = "https://graph.facebook.com/v22.0";
  const MIESIACE = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
                    "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

  /* ---- pobór JSON z timeoutem ---- */
  async function pobierz(url, timeoutMs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs || 25000);
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

  /* ---- A. zdjęcia z zakładki „Zdjęcia” (uploaded) — dowolny zakres ----
     odIso: od dnia (np. "2016-01-01"); doIso: do dnia wyłącznie (null = bez końca).
     opt: { limit, maxStron, naPostep } */
  async function zdjecia(odIso, doIso, opt) {
    const o = opt || {};
    const limit = o.limit || 250;
    const maxStron = o.maxStron || 12;          // ≈ 3 000 zdjęć / rok (max realny: 1 681)
    const mapa = new Map();                     // photo_id → { ct, link, album, mini, pelna }
    let url = `${API}/${PAGE_ID}/photos?type=uploaded&since=${odIso}`
      + (doIso ? `&until=${doIso}` : "")
      + `&fields=id,created_time,link,images,album{id,name,type}`
      + `&limit=${limit}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < maxStron && url; s++) {
      const resp = await pobierz(url, o.timeoutMs);
      for (const f of (resp.data || [])) {
        const ims = (f.images || [])
          .slice()
          .sort((a, b) => (b.width || 0) - (a.width || 0));
        if (!ims.length) continue;
        let mini = ims[ims.length - 1];          // najmniejszy ≥ 480 px (iterując od największego)
        for (const i of ims) if ((i.width || 0) >= 480) mini = i;
        mapa.set(String(f.id), {
          ct: f.created_time || "",
          link: f.link || null,                  // URL zdjęcia na FB (fallback linku grupy)
          album: f.album || null,
          mini: mini.source,
          pelna: ims[0].source,
        });
      }
      url = (resp.paging || {}).next;
      if (typeof o.naPostep === "function") o.naPostep(mapa.size);
    }
    return mapa;
  }

  /* ---- B. posty — TYLKO metadane (tytuł, permalink, przypisanie) ----
     opt: { limit, maxStron, stopPrzedIso } — przy poborze „do teraz”
     stronicowanie kończy się na postach starszych niż stopPrzedIso. */
  async function posty(odIso, doIso, opt) {
    const o = opt || {};
    const limit = o.limit || 100;
    const maxStron = o.maxStron || 12;
    const pola = "created_time,message,permalink_url,"
      + "attachments.limit(60){type,target{id},"
      + "subattachments.limit(60){type,target{id}}}";
    const out = [];
    let url = `${API}/${PAGE_ID}/posts?fields=${encodeURIComponent(pola)}`
      + `&since=${odIso}` + (doIso ? `&until=${doIso}` : "")
      + `&limit=${limit}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < maxStron && url; s++) {
      const resp = await pobierz(url, o.timeoutMs);
      let stop = false;
      for (const p of (resp.data || [])) {
        if (!doIso && o.stopPrzedIso) {
          // stronicujemy od najnowszych — kończymy poniżej progu (np. start roku)
          if ((p.created_time || "") < o.stopPrzedIso) { stop = true; break; }
        }
        out.push(p);
      }
      if (stop) break;
      url = (resp.paging || {}).next;
    }
    return out;
  }

  /* photo_id → post (iterujemy od najnowszych i nadpisujemy, więc
     przy udostępnieniach własnych albumów wygrywa post PIERWOTNY) */
  function mapaFotoPost(listaPostow) {
    const mapa = new Map();
    for (const p of listaPostow) {
      const zbierz = (att) => {
        if (att.type !== "photo") return;
        const tid = ((att.target || {}).id);
        if (tid) mapa.set(String(tid), p);
      };
      for (const a of ((p.attachments || {}).data || [])) {
        zbierz(a);
        for (const s of ((a.subattachments || {}).data || [])) zbierz(s);
      }
    }
    return mapa;
  }

  function tytulZPosta(p) {
    const linie = (p.message || "").split("\n").map((l) => l.trim());
    const pierwsza = linie.find((l) => l.length > 1) || "";
    const bezUrl = pierwsza.replace(/https?:\/\/\S+/, "").trim();
    const t = bezUrl || pierwsza;
    if (!t) return "";
    return t.length > 90 ? t.slice(0, 87).replace(/\s+\S*$/, "") + "…" : t;
  }

  /* ---- C. budowa albumów: post > album nazwany > miesiąc ----
     widziane: Set photo_id już wykorzystanych (dedup między zakresami);
     każdy album dostaje fbLink (post / zdjęcie / album na FB). */
  function zbudujAlbumy(mapaZdjec, fotoPost, widziane) {
    const widz = widziane || new Set();
    const grupy = new Map();
    for (const [id, z] of mapaZdjec) {
      if (widz.has(id)) continue;                    // dedup między latami
      const post = fotoPost.get(id) || null;
      const alb = z.album || null;
      const dataFoto = (z.ct || "").slice(0, 10);
      const mies = (z.ct || "").slice(0, 7);
      let klucz, tytul, data, link;
      if (post) {
        klucz = `fb-${post.id}`;
        tytul = tytulZPosta(post) || null;
        data = (post.created_time || "").slice(0, 10);
        link = post.permalink_url || null;
      } else if (alb && alb.type === "normal" && alb.name) {
        klucz = `fb-alb-${alb.id}`;
        tytul = alb.name;
        data = dataFoto;
        link = z.link || null;
      } else {
        klucz = `fb-m-${mies}`;
        const nr = Number(mies.slice(5, 7));
        tytul = `Zdjęcia · ${MIESIACE[nr - 1] || mies} ${mies.slice(0, 4)}`;
        data = dataFoto;
        link = z.link || null;
      }
      let g = grupy.get(klucz);
      if (!g) { g = { klucz, tytul, data, link, fotos: [] }; grupy.set(klucz, g); }
      g.fotos.push({ id, ct: z.ct, mini: z.mini, pelna: z.pelna, link: z.link });
    }
    const albumy = [];
    for (const g of grupy.values()) {
      if (!g.fotos.length) continue;
      g.fotos.sort((a, b) => (a.ct < b.ct ? -1 : a.ct > b.ct ? 1 : 0)); // chronologicznie
      g.fotos.forEach((f) => widz.add(f.id));
      albumy.push({
        slug: g.klucz,
        tytul: g.tytul || `Zdjęcia z FB${g.data ? " · " + g.data.split("-").reverse().join(".") : ""}`,
        data: g.data || null,
        zdjecia: g.fotos.map((f) => f.pelna),
        miniatury: g.fotos.map((f) => f.mini),
        zrodlo: "Facebook (na żywo)",
        fbLink: g.link || g.fotos[0].link || null,
      });
    }
    return albumy;
  }

  /* ---- pomocniki tekstu (wspólne dla badge'ów galerii i teasera) ---- */

  /* polska odmiana: liczba(3, ["album","albumy","albumów"]) → "3 albumy" */
  function liczba(n, formy) {
    n = Number(n) || 0;
    if (n === 1) return `1 ${formy[0]}`;
    const r10 = n % 10, r100 = n % 100;
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return `${fmtLiczba(n)} ${formy[1]}`;
    return `${fmtLiczba(n)} ${formy[2]}`;
  }

  /* 2015 → "2 015" (spacja nierozdzielająca) */
  function fmtLiczba(n) {
    return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  }

  /* ["2012","2023","2024","2025","2026"] → "2012, 2023–2026" */
  function zakresLat(albumy) {
    const lata = [...new Set(
      (albumy || []).map((a) => (a.data || "").slice(0, 4)).filter(Boolean)
    )].sort();
    if (!lata.length) return "";
    const czesci = [];
    let start = lata[0], poprz = lata[0];
    for (let i = 1; i <= lata.length; i++) {
      const r = lata[i];
      if (r && Number(r) === Number(poprz) + 1) { poprz = r; continue; }
      czesci.push(start === poprz ? start : `${start}–${poprz}`);
      start = poprz = r;
    }
    return czesci.join(", ");
  }

  return {
    PAGE_ID, API,
    pobierz, zdjecia, posty, mapaFotoPost, tytulZPosta, zbudujAlbumy,
    liczba, fmtLiczba, zakresLat,
  };
})();
