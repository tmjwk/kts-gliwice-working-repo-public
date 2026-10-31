/* ============================================================
   KTS Gliwice — LUSTRO GALERII FB (1.14.0)

   PEŁNA HISTORIA KLUBU 2012–2026, ładowana INTELIGENTNIE
   (decyzja właściciela 2.11: „galeria sięgająca wstecz do 2012,
   ale zrobiona inteligentnie — użytkownik musi mieć możliwość
   cofnięcia się, jeśli zechce"):

   - start (jak 1.13.x): statyczne archiwum 2023–2024 z galeria.json
     + na żywo zdjęcia 2025–2026 (zakładka „Zdjęcia" na FB);
   - lata 2012–2022: NIE są pobierane na starcie. W filtrach roku
     czekają chipy z ramką przerywaną i znaczkiem „FB" — kliknięcie
     dociąga DANY ROK z Graph API (zdjęcia + tytuły postów) i dokładnie
     go renderuje. Chcesz 2016? Klikasz 2016. Nie chcesz — nic nie kosztuje.
   - paginacja „Pokaż więcej" (w js/galeria.js) pilnuje, żeby DOM
     nie rozrósł się do 14 tys. zdjęć naraz.

   ŹRÓDŁO PRAWDY (od 1.13.1): /photos?type=uploaded — dokładnie
   zakładka „Zdjęcia" fanpage'a (13 898 zdjęć od 2012). Posty służą
   TYLKO jako metadane: tytuł albumu + permalink „Zobacz na Facebooku"
   (przy udostępnieniach własnych wygrywa post pierwotny).

   GRUPOWANIE ZDJĘĆ W ALBUMY (hierarchia, wszystkie lata tak samo):
   1. post zawierający zdjęcie → tytuł = 1. linia treści posta,
      data = data posta, link = permalink posta;
   2. nazwany album FB (typ normal, np. „Gilowice 2016 — Sierpień")
      → tytuł = nazwa albumu (takie albumy klub zakładał do 2018);
   3. pozostałe (ściana/mobile) → grupa miesięczna
      „Zdjęcia · sierpień 2016", link do pierwszego zdjęcia.

   Zdjęcia między latami są deduplikowane globalnie (photo_id),
   więc granice since/until nie dublują niczego.

   DIAGNOSTYKA 2.11 (fb_stare_lata_diag.py): since/until działa na
   /photos i /posts; 2016 = 1 619 zdjęć / 7 stron / 119 postów
   (1 543 zdjęć z tytułami); 2012 = 132 zdjęcia, wszystkie w nazwanych
   albumach; najcięższy rok 2022 = 1 681 zdjęć / 7 stron.

   DLACZEGO LUSTRO, A NIE IMPORT (decyzja właściciela 1.11):
   repo ma ograniczone miejsce — do repo NIE trafia ani bajt danych
   z FB; przeglądarka gościa pobiera metadane + zdjęcia wprost
   z Graph API / CDN Facebooka. Zero utrzymania: nowe zdjęcia na FB
   pojawiają się w galerii SAME.

   ROLKI: to wideo (na stronie 6 szt.) — świadomie POZA galerią
   zdjęć; żyją w lustro-fb.js (aktualności).

   TOKEN: page token z tokenu użytkownika systemowego biznesu
   klubowego — wieczny (expires = 0, data_access = 0), read-only:
   pages_show_list + pages_read_engagement (audyt: zapis → HTTP 403).

   BEZPIECZNIKI:
   - awaria API / timeout → komunikat + „Spróbuj ponownie" przy roku;
     awaria przy starcie → galeria pokazuje statyczne archiwum
     2023–2024 + notkę (nic się nie sypie);
   - posty roku to tylko metadane — ich błąd NIE wywala roku
     (grupowanie spada na albumy nazwane/miesiące);
   - twarde limity stronicowania (12 stron ≈ 3 000 zdjęć/rok)
     i timeouty fetch 25 s.
   ============================================================ */
"use strict";

(function () {
  const PAGE_ID = "167636963360765";
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS4LeihUEbKntpD59u4UFYZAuAXDKWg0U2OM9HkrtERFevhAM4ulaDyLfsoc1KufBoZB5XeIFTKZBE2eKMhWgWpHv9lidVxMLzh3bUek2SD59uZASM7WuvwpWmwZCySldscl3KZC3oCafaajgA9fR6PfNV9z9cE0ZBN0wqa3lQ5tTUCM6aVg2hZCLopMZD";
  const API = "https://graph.facebook.com/v22.0";
  const OD_ROKU = "2025";                     // od tego roku lustro startowe (wcześniej: 2023–24 lokalnie)
  const FB_LATA = ["2012", "2013", "2014", "2015", "2016", "2017",
                   "2018", "2019", "2020", "2021", "2022"];  // lata TYLKO na FB (na żądanie)
  const LIMIT_POSTOW = 100;
  const LIMIT_ZDJEC = 250;
  const MAX_STRON = 12;                       // ≈ 3 000 zdjęć / rok (max realny: 1 681)
  const MAX_STRON_POSTOW = 12;
  const TIMEOUT_MS = 25000;
  const MIESIACE = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
                    "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

  /* lata na żądanie: rok → 'laduje' | 'blad' | 'ok' */
  const STAN_LAT = new Map();
  /* globalny dedup photo_id między latami (granice since/until) */
  const WIDZIANE_FOTO = new Set();

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

  /* ===== A. zdjęcia z zakładki „Zdjęcia" (uploaded) — dowolny zakres =====
     odIso: od dnia (np. "2016-01-01"); doIso: do dnia wyłącznie (null = bez końca) */
  async function pobierzZdjecia(odIso, doIso, naPostep) {
    const mapa = new Map();   // photo_id → { ct, link, album, mini, pelna }
    let url = `${API}/${PAGE_ID}/photos?type=uploaded&since=${odIso}`
      + (doIso ? `&until=${doIso}` : "")
      + `&fields=id,created_time,link,images,album{id,name,type}`
      + `&limit=${LIMIT_ZDJEC}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < MAX_STRON && url; s++) {
      const resp = await pobierz(url);
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
      if (typeof naPostep === "function") naPostep(mapa.size);
    }
    return mapa;
  }

  /* ===== B. posty — TYLKO metadane (tytuł, permalink, przypisanie) =====
     odIso/doIso jak wyżej; doIso === null → startowe 2025+ ze stopem po dacie */
  async function pobierzPosty(odIso, doIso) {
    const pola = "created_time,message,permalink_url,"
      + "attachments.limit(60){type,target{id},"
      + "subattachments.limit(60){type,target{id}}}";
    const out = [];
    let url = `${API}/${PAGE_ID}/posts?fields=${encodeURIComponent(pola)}`
      + `&since=${odIso}` + (doIso ? `&until=${doIso}` : "")
      + `&limit=${LIMIT_POSTOW}&access_token=${ACCESS_TOKEN}`;
    for (let s = 0; s < MAX_STRON_POSTOW && url; s++) {
      const resp = await pobierz(url);
      let stop = false;
      for (const p of (resp.data || [])) {
        if (!doIso) {
          // startowe: stronicujemy do najstarszego postu OD_ROKU (idą od najnowszych)
          if ((p.created_time || "") < `${OD_ROKU}-01-01`) { stop = true; break; }
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
  function mapaFotoPost(posty) {
    const mapa = new Map();
    for (const p of posty) {
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

  /* ===== C. budowa albumów: post > album nazwany > miesiąc ===== */
  const PERMALINKI = new Map();   // slug fb-* → URL oryginału (post/zdjęcie/album)

  function zbudujAlbumy(zdjecia, fotoPost) {
    const grupy = new Map();
    for (const [id, z] of zdjecia) {
      if (WIDZIANE_FOTO.has(id)) continue;          // dedup między latami
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
      g.fotos.forEach((f) => WIDZIANE_FOTO.add(f.id));
      albumy.push({
        slug: g.klucz,
        tytul: g.tytul || `Zdjęcia z FB${g.data ? " · " + fmData(g.data) : ""}`,
        data: g.data || null,
        zdjecia: g.fotos.map((f) => f.pelna),
        miniatury: g.fotos.map((f) => f.mini),
        zrodlo: "Facebook (na żywo)",
      });
      const url = g.link || g.fotos[0].link;
      if (url) PERMALINKI.set(g.klucz, url);
    }
    return albumy;
  }

  /* ===== scalenie z galeria.js (render wspólny, bez zmian w tamtym pliku) =====
     GALERIA/renderStatystyki/renderFiltry/renderAlbumy to globalne
     deklaracje js/galeria.js — klasyczne skrypty współdzielą zakres. */
  function czekajNaStatyczne() {
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
     (także po zmianie filtra roku / paginacji, bo renderAlbumy przebudowuje DOM) */
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

  /* ===== notka zakresu ===== */
  function noteZakresu(nowe) {
    return "<strong>Zakres galerii: 2012–2026.</strong> "
      + "Lata 2023–2024 — archiwum starej strony klubu; lata 2025–2026 — "
      + "zdjęcia z zakładki „Zdjęcia” na Facebooku klubu, dociągnięte na żywo. "
      + "Starsze lata (2012–2022) — wybierz rok w filtrach powyżej: zdjęcia "
      + "dociągną się z Facebooka w kilka–kilkanaście sekund."
      + (nowe ? ` <strong>Ostatnio: ${nowe}.</strong>` : "")
      + " Pliki nie są kopiowane do serwisu.";
  }

  /* ===== D. rok na żądanie (2012–2022) ===== */
  async function wczytajRok(rok) {
    const r = Number(rok);
    if (!FB_LATA.includes(String(r))) return;
    const stan = STAN_LAT.get(r);
    if (stan === "ok" || stan === "laduje") return;   // już wczytany / w trakcie
    STAN_LAT.set(r, "laduje");
    renderAlbumy();                                    // pokaż spinner roku
    ustawNote(`<strong>Rok ${r}:</strong> dociągam zdjęcia z Facebooka klubu…`);
    try {
      const od = `${r}-01-01`, doIso = `${r + 1}-01-01`;
      const naPostep = (n) => {
        const el = document.getElementById("gal-ladowanie-txt");
        if (el) el.textContent = `Dociągam zdjęcia z roku ${r} z Facebooka… (dotąd: ${n} zdjęć)`;
      };
      // posty to tylko metadane — ich awaria nie wywala roku (spada na albumy/miesiące)
      const [posty, zdjecia] = await Promise.all([
        pobierzPosty(od, doIso).catch((e) => {
          console.warn(`Lustro galerii FB — posty roku ${r} niedostępne (grupuję po albumach/miesiącach):`, e);
          return [];
        }),
        pobierzZdjecia(od, doIso, naPostep),
      ]);
      const albumy = zbudujAlbumy(zdjecia, mapaFotoPost(posty));
      const dodane = dolaczAlbumyFB(albumy);
      STAN_LAT.set(r, "ok");
      const nZdjec = albumy.reduce((s, a) => s + a.zdjecia.length, 0);
      ustawNote(noteZakresu(dodane ? `rok ${r}: ${dodane} albumów · ${nZdjec} zdjęć` : null));
      // po dociągnięciu roku: dosięgnij celu, jeśli w URL czeka kotwica #album-…
      if (typeof window.przewinDoAlbumu === "function") window.przewinDoAlbumu();
    } catch (err) {
      console.error(`Lustro galerii FB — rok ${r} błąd poboru:`, err);
      STAN_LAT.set(r, "blad");
      renderAlbumy();                                  // komunikat + „Spróbuj ponownie”
      ustawNote(`<strong>Rok ${r}:</strong> nie udało się pobrać zdjęć z Facebooka — `
        + "spróbuj ponownie za chwilę. Archiwum 2023–2024 działa normalnie.");
    }
  }

  function stanRoku(rok) {
    return STAN_LAT.get(Number(rok)) || null;
  }

  /* interfejs dla js/galeria.js — dostępny od razu po sparsowaniu
     (galeria.js startuje na DOMContentLoaded, więc zawsze zdąży) */
  window.__GALFB = { lataFB: FB_LATA, stanRoku, wczytajRok };

  /* ===== E. start: statyczne 2023–24 + na żywo 2025–26 ===== */
  async function start() {
    ustawNote("<strong>Lata 2025–2026:</strong> dociągam zdjęcia z Facebooka klubu…");

    let posty, zdjecia;
    try {
      [posty, zdjecia] = await Promise.all([
        pobierzPosty(`${OD_ROKU}-01-01`, null),
        pobierzZdjecia(`${OD_ROKU}-01-01`, null),
      ]);
    } catch (err) {
      console.error("Lustro galerii FB — błąd poboru:", err);
      ustawNote(
        "<strong>Zakres galerii: 2023–2024.</strong> "
        + "Zdjęcia z lat 2025–2026 (Facebook) są chwilowo niedostępne — "
        + "odśwież stronę za chwilę. Archiwum działa normalnie.");
      return;
    }

    const albumy = zbudujAlbumy(zdjecia, mapaFotoPost(posty));

    const czekal = await czekajNaStatyczne();
    const dodane = dolaczAlbumyFB(albumy);

    const nZdjec = albumy.reduce((s, a) => s + a.zdjecia.length, 0);
    ustawNote(noteZakresu(dodane ? `lata 2025–2026: ${dodane} albumów · ${nZdjec} zdjęć` : null));
    if (!czekal) {
      console.warn("Lustro galerii FB: statyczne archiwum się nie załadowało — pokazuję tylko zdjęcia FB.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* diagnostyka (warsztat): ręczne odpalenie z konsoli */
  window.__GFB = { pobierzPosty, pobierzZdjecia, wczytajRok };
})();
