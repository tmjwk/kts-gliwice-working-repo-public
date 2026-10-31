/* ============================================================
   KTS Gliwice — LUSTRO FB (1.10.5)
   Aktualności z Facebooka na żywo + archiwum na podstronie.

   1.10.5 (31.10, wieczór — „wieczny token”):
   - ACCESS_TOKEN = page token wygenerowany z tokenu UŻYTKOWNIKA
     SYSTEMOWEGO (system user „Tomasz Jaworski” w biznesie klubowym
     „Akademia Tenisa Stołowego”) — debug_token: typ PAGE,
     expires_at = 0 ORAZ data_access_expires_at = 0, czyli BEZ
     zegara zgody OAuth, który w tokenie user-based katował
     26.01.2027. Koniec kalendarzowych odnowień — pełna automatyka.
   - token nadal read-only: pages_show_list +
     pages_read_engagement (audyt 29.10: próba zapisu → HTTP 403),
   - regeneracja (gdyby trzeba): skrypt fb_system_user_page_token.py
     w warsztacie — token systemowy w sejfie, NIE w repo.

   1.10.1 (zgłoszenia właściciela 31.10 wieczór):
   - hero = SZEROKI PASEK o wysokości zwykłego kafla (był za wysoki):
     tytuł t-h4 + 4 linie zajawki, zdjęcie rozciągnięte na wysokość
     treści; na mobile pion z media 10rem jak zwykłe kafelki,
   - dialog centrowany na środku ekranu (margin:auto — reset
     "* {margin:0}" zabijał domyślne centrowanie <dialog>),
   - stopka dialogu: przyciski systemowe .btn — „Zamknij" (outline)
     i „Zobacz na Facebooku" (accent, CTA wg 60-30-10).

   Architektura (decyzje właściciela, 29–31.10):
   - MIRROR na żywo: przeglądarka gościa pobiera posty
     bezpośrednio z Graph API przy każdej wizycie; do repo NIE
     trafia ani bajt danych z FB (zdjęcia = świeże, podpisane
     URL-e CDN, ważne dla bieżącej sesji),
   - read-only: token ma wyłącznie pages_show_list +
     pages_read_engagement (audyt 29.10: próba zapisu → HTTP 403),
   - STRONA GŁÓWNA (#lustro-fb): posty młodsze niż 30 dni
     (rolling), minimum 10 (1 hero + 9 kafelków) — przy deficycie
     dopełniamy starszymi (decyzja Q1b),
   - ARCHIWUM (#archiwum-fb na archiwum.html): wszystkie posty
     chronologicznie, nagłówki miesięcy, porcje po 25,
     „Starsze wpisy” dokłada kolejne (paginacja API),
   - FORMA: klik w kafelek → <dialog> z pełną treścią posta;
     klik w powiększenie lub przycisk → oryginał na Facebooku
     w nowej karcie (target=_blank),
   - skeleton podczas poboru; awaria = kafel zastępczy z linkiem
     do fanpage'a; zero cookie/localStorage/SDK (RODO-clean),
   - posty bez tekstu (zdjęcia/reele) pokazujemy z datą i obrazem.
   ============================================================ */
"use strict";

(() => {
  /* ---- KONFIGURACJA ---- */
  const PAGE_ID = "167636963360765";            // KTS Gliwice (fanpage klubu)
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS92XpZBQ1q2tZBg8sTbTHnTz4kJqgjQuZAlt2Ku83tWkKu0bY9cFMNPZA3q5N3DgccCldMQIU1qZCyzyIVN08H0kLMZAcSI4O5Gn6p27dJ27EjuchVBKmL5x6avkkeMt50ZBLUNflAFdSGlet1b57IGIfFMvI86r9NTJH3drt0JP6LwQsylXlqbIgZDZD";    // page token KTS z SYSTEM USERA (read-only, bez zegara danych — 1.10.5)
  const API = "https://graph.facebook.com/v22.0";
  const FIELDS = "id,message,story,created_time,permalink_url,full_picture";
  const OKNO_DNI = 30;            // rolling window głównej (Q2)
  const MIN_POSTOW = 10;          // 1 hero + 9 kafelków (P1 + decyzja 31.10)
  const LIMIT_GLOWNA = 50;        // wystarcza na okno + dopełnienie
  const PORCJA_ARCHIWUM = 25;     // porcja „Starsze wpisy” (Q4a)
  const FANPAGE_URL = "https://www.facebook.com/AkademiaTenisaStolowego";

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  /* ---- daty ---- */
  const formatujDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pl-PL",
      { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /** „wczoraj”, „3 dni temu”, „2 tyg. temu”, „rok temu”… (P4) */
  const dataWzgledna = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "właśnie teraz";
    if (s < 3600) return `${Math.floor(s / 60)} min temu`;
    if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
    const dni = Math.floor(s / 86400);
    if (dni === 1) return "wczoraj";
    if (dni < 7) return `${dni} dni temu`;
    if (dni < 30) {
      const t = Math.floor(dni / 7);
      return t === 1 ? "tydzień temu" : `${t} tyg. temu`;
    }
    if (dni < 365) {
      const m = Math.floor(dni / 30);
      return m === 1 ? "miesiąc temu" : `${m} mies. temu`;
    }
    const l = Math.floor(dni / 365);
    if (l === 1) return "rok temu";
    if (l % 10 >= 2 && l % 10 <= 4 && (l % 100 < 12 || l % 100 > 14)) {
      return `${l} lata temu`;
    }
    return `${l} lat temu`;
  };

  /** Tytuł = pierwsza niepusta linijka (ucięta do 90 zn.). */
  const tytulZPostu = (p) => {
    const pierwsza = String(p.message || p.story || "")
      .split("\n").map((l) => l.trim()).filter(Boolean)[0];
    const t = pierwsza || "(wpis bez tekstu)";
    return t.length > 90 ? t.slice(0, 87) + "…" : t;
  };

  /** Zajawka = reszta treści po pierwszej linijce. */
  const zajawkaZPostu = (p, max = 150) => {
    const lines = String(p.message || p.story || "")
      .split("\n").map((l) => l.trim()).filter(Boolean);
    const reszta = lines.slice(1).join(" ");
    const t = (reszta || lines[0] || "").slice(0, max);
    return (t.length >= max ? t.slice(0, max - 3) + "…" : t) || "—";
  };

  /** Pełna treść do dialogu: linijka → akapit. */
  const akapityPostu = (p) =>
    String(p.message || p.story || "")
      .split(/\n+/).map((l) => l.trim()).filter(Boolean);

  /* ---- pobieranie (tylko GET) ---- */
  async function pobierzPosty({ limit, url } = {}) {
    const cel = url || `${API}/${PAGE_ID}/posts`
      + `?fields=${encodeURIComponent(FIELDS)}`
      + `&limit=${limit}&access_token=${ACCESS_TOKEN}`;
    const kontrola = new AbortController();
    const zegar = setTimeout(() => kontrola.abort(), 12000);
    try {
      const r = await fetch(cel, { signal: kontrola.signal });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return { posty: Array.isArray(d.data) ? d.data : [],
               next: d.paging && d.paging.next || null };
    } finally {
      clearTimeout(zegar);
    }
  }

  /* ---- kafelki ---- */
  const mediaHTML = (p) => p.full_picture
    ? `<img src="${esc(p.full_picture)}" alt="" loading="lazy" decoding="async">`
    : `<span aria-hidden="true">🏓</span>`;

  const karta = (p) => `
    <article class="card news-card news-klik lustro-karta" data-post-id="${esc(p.id)}"
             tabindex="0" role="button" aria-label="Powiększ wpis: ${esc(tytulZPostu(p))}">
      <div class="news-media${p.full_picture ? " news-media-img" : " news-media-brak"}">${mediaHTML(p)}</div>
      <div class="card-body">
        <span class="t-small t-nums text-primary" title="${esc(formatujDate(p.created_time))}">${esc(dataWzgledna(p.created_time))}</span>
        <h3 class="t-h4">${esc(tytulZPostu(p))}</h3>
        <p class="t-small muted">${esc(zajawkaZPostu(p))}</p>
        <span class="lustro-wiecej t-small">Powiększ wpis&nbsp;↗</span>
      </div>
    </article>`;

  const kartaHero = (p) => `
    <article class="card news-card news-klik lustro-karta lustro-hero" data-post-id="${esc(p.id)}"
             tabindex="0" role="button" aria-label="Powiększ wpis: ${esc(tytulZPostu(p))}">
      <div class="news-media${p.full_picture ? " news-media-img" : " news-media-brak"}">${mediaHTML(p)}</div>
      <div class="card-body">
        <span class="t-small t-nums text-primary" title="${esc(formatujDate(p.created_time))}">${esc(dataWzgledna(p.created_time))}</span>
        <h3 class="t-h4">${esc(tytulZPostu(p))}</h3>
        <p class="t-small muted">${esc(zajawkaZPostu(p, 240))}</p>
        <span class="lustro-wiecej t-small">Powiększ wpis&nbsp;↗</span>
      </div>
    </article>`;

  const kartaFallback = () => `
    <a class="card news-card lustro-fallback" href="${FANPAGE_URL}"
       target="_blank" rel="noopener">
      <div class="news-media news-media-brak">🏓</div>
      <div class="card-body">
        <h3 class="t-h4">Chwilowo nie można pobrać aktualności</h3>
        <p class="t-small muted">Zobacz wpisy bezpośrednio na Facebooku klubu.</p>
        <span class="lustro-wiecej t-small">Otwórz fanpage&nbsp;↗</span>
      </div>
    </a>`;

  const skeleton = (klasa, wysokosc) => `
    <div class="lustro-skeleton ${klasa}" aria-hidden="true">
      <div class="skel-media" style="min-height:${wysokosc}"></div>
      <div class="skel-linie"><div class="skel-line"></div><div class="skel-line skel-line--krotka"></div><div class="skel-line skel-line--mini"></div></div>
    </div>`;

  /* ---- dialog: pełny wpis (FORMA — decyzja 31.10) ---- */
  const cache = new Map();   // id → post (klik w kartę)
  let dialogPodpiety = false;

  function otworzPost(p) {
    const dlg = $("#aktualnosci-dialog");
    if (!dlg || !p) return;
    const okladka = dlg.querySelector('[data-pole="okladka"]');
    if (okladka) {
      okladka.innerHTML = p.full_picture
        ? `<a href="${esc(p.permalink_url)}" target="_blank" rel="noopener"
              title="Otwórz post na Facebooku">
             <img src="${esc(p.full_picture)}" alt="" decoding="async"></a>`
        : "";
    }
    const elData = dlg.querySelector('[data-pole="data"]');
    if (elData) {
      elData.textContent =
        `${formatujDate(p.created_time)} · ${dataWzgledna(p.created_time)}`;
    }
    const elTytul = dlg.querySelector('[data-pole="tytul"]');
    if (elTytul) elTytul.textContent = tytulZPostu(p);
    const elTresc = dlg.querySelector('[data-pole="tresc"]');
    if (elTresc) {
      const akapity = akapityPostu(p);
      elTresc.innerHTML = akapity.length
        ? akapity.map((a) => `<p>${esc(a)}</p>`).join("")
        : "<p>(wpis bez treści tekstowej — zobacz zdjęcie/wideo na Facebooku)</p>";
    }
    const oryginal = dlg.querySelector('[data-pole="oryginal"]');
    if (oryginal) oryginal.href = p.permalink_url || FANPAGE_URL;

    if (!dialogPodpiety) {
      const zamykanie = dlg.querySelector('[data-akcja="zamknij"]');
      if (zamykanie) zamykanie.addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg) dlg.close();      // klik w tło zamyka
      });
      dialogPodpiety = true;
    }
    dlg.showModal();
  }

  /** Delegacja klików/klawiatury na kontenerze kart. */
  function podpiezKarty(kontener) {
    kontener.addEventListener("click", (e) => {
      const kartaEl = e.target.closest(".news-klik");
      if (!kartaEl) return;
      otworzPost(cache.get(kartaEl.dataset.postId));
    });
    kontener.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const kartaEl = e.target.closest(".news-klik");
      if (!kartaEl) return;
      e.preventDefault();
      otworzPost(cache.get(kartaEl.dataset.postId));
    });
  }

  /* ===== STRONA GŁÓWNA ===== */
  async function initGlowna() {
    const kontener = $("#lustro-fb");
    const hero = $("#lustro-fb-hero");
    const grid = $("#lustro-fb-grid");
    if (!kontener || !hero || !grid) return;
    podpiezKarty(kontener);

    // skeleton od razu (P2) — sekcja żyje, zanim dojadą dane
    // (1.10.1: hero-pasek płaski, 10rem jak zwykłe kafelki)
    hero.innerHTML = skeleton("lustro-skeleton--hero", "10rem");
    grid.innerHTML = Array.from({ length: MIN_POSTOW - 1 },
      () => skeleton("", "10rem")).join("");

    try {
      const { posty } = await pobierzPosty({ limit: LIMIT_GLOWNA });
      if (!posty.length) throw new Error("brak postów");

      const granica = Date.now() - OKNO_DNI * 86400 * 1000;
      const wOknie = posty.filter(
        (p) => new Date(p.created_time).getTime() >= granica).length;
      // Q1b: przy deficycie dopełniamy starszymi do MIN_POSTOW
      const ile = Math.max(Math.min(wOknie, posty.length), Math.min(MIN_POSTOW, posty.length));
      const widoczne = posty.slice(0, ile);

      widoczne.forEach((p) => cache.set(p.id, p));
      hero.innerHTML = kartaHero(widoczne[0]);
      grid.innerHTML = widoczne.slice(1).map(karta).join("");
    } catch (e) {
      console.warn("[lustro-fb] pominięto:", e.message);
      hero.innerHTML = "";
      grid.innerHTML = kartaFallback();      // P3: kafel awaryjny
    }
  }

  /* ===== ARCHIWUM (podstrona) ===== */
  const MIESIACE = ["styczeń", "luty", "marzec", "kwiecień", "maj",
    "czerwiec", "lipiec", "sierpień", "wrzesień", "październik",
    "listopad", "grudzień"];

  async function initArchiwum() {
    const arch = $("#archiwum-fb");
    const lista = $("#archiwum-lista");
    const przycisk = $("#archiwum-more");
    const licznik = $("#archiwum-count");
    if (!arch || !lista) return;
    podpiezKarty(arch);

    let nastepnyUrl = null;
    let wczytane = 0;
    let biezacaGrupa = null;

    const naglowekMiesiaca = (iso) => {
      const [r, m] = iso.slice(0, 7).split("-");
      return `${MIESIACE[Number(m) - 1]} ${r}`;
    };

    function dodajPosty(posty) {
      for (const p of posty) {
        cache.set(p.id, p);
        const klucz = p.created_time.slice(0, 7);
        if (!biezacaGrupa || biezacaGrupa.dataset.miesiac !== klucz) {
          biezacaGrupa = document.createElement("section");
          biezacaGrupa.dataset.miesiac = klucz;
          biezacaGrupa.className = "archiwum-grupa";
          biezacaGrupa.innerHTML =
            `<h3 class="archiwum-miesiac">${esc(naglowekMiesiaca(p.created_time))}</h3>
             <div class="grid grid-3"></div>`;
          lista.appendChild(biezacaGrupa);
        }
        biezacaGrupa.querySelector(".grid").insertAdjacentHTML("beforeend", karta(p));
        wczytane += 1;
      }
      if (licznik) {
        licznik.textContent = `Wczytano ${wczytane} ${wczytane === 1 ? "wpis" : "wpisów"} — od najnowszych`;
      }
    }

    try {
      const pierwsza = await pobierzPosty({ limit: PORCJA_ARCHIWUM });
      if (!pierwsza.posty.length) throw new Error("brak postów");
      dodajPosty(pierwsza.posty);
      nastepnyUrl = pierwsza.next;
    } catch (e) {
      console.warn("[archiwum] pominięto:", e.message);
      lista.innerHTML = kartaFallback();
      if (licznik) licznik.textContent = "";
      return;
    }

    if (przycisk) {
      if (!nastepnyUrl) {
        przycisk.hidden = true;
      } else {
        przycisk.hidden = false;
        przycisk.addEventListener("click", async () => {
          przycisk.disabled = true;
          przycisk.textContent = "Wczytuję…";
          try {
            const { posty, next } = await pobierzPosty({ url: nastepnyUrl });
            dodajPosty(posty);
            nastepnyUrl = next;
            przycisk.textContent = "Starsze wpisy";
            przycisk.disabled = false;
            if (!nastepnyUrl) {
              przycisk.hidden = true;
              const koniec = document.createElement("p");
              koniec.className = "t-small muted center archiwum-koniec";
              koniec.textContent = "To wszystkie wpisy w historii fanpage’a 🏓";
              arch.appendChild(koniec);
            }
          } catch (e) {
            przycisk.textContent = "Błąd — spróbuj ponownie";
            przycisk.disabled = false;
          }
        });
      }
    }
  }

  /* ---- start ---- */
  const start = () => { initGlowna(); initArchiwum(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
