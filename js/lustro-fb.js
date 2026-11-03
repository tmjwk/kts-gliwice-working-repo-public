/* ============================================================
   KTS Gliwice — LUSTRO FB (1.20.0)
   Aktualności z Facebooka na żywo + archiwum na podstronie.

   1.26.9 (właściciel 04.11: „może 20 to nawet lepszy pomysł — daje
   sumę 21 kafelków, a to szczęśliwa liczba — ale załaduj je w tle,
   bo wtedy animacja będzie naprawdę płynna”): pula = 20 KAFELKÓW
   + hero (21 najnowszych wpisów) = 5 pełnych rzędów po 4; po
   wyrenderowaniu sekcji obrazy CAŁEJ puli są DOGRZEWANE W TLE
   (new Image() po requestIdleCallback) — kafelki ukrytych stron
   mają loading="lazy" i w display:none nie pobierają się same,
   więc bez dogrzewki obrót strony czekałby na sieć; z dogrzewką
   HTTP cache jest gotowy i animacja wjazdu jest płynna od razu.

   1.26.8 (właściciel 04.11: „mamy teraz miejsce na 12 ostatnich
   wpisów — trzy kliknięcia w stecz. tak to zaprogramowałeś?”):
   STAŁA PULA sekcji głównej (wtedy: 12 kafelków + hero) — dokładnie
   pełne rzędy po 4 na desktopie (kropki, kliknięcia do końca osi
   czasu). ZASTĄPIŁA płynne okno 30 dni (Q2) i minimum 10 wpisów
   (P1/31.10) — pula nie zależy od aktywności klubu; „Pokaż starsze
   wpisy” (stopka → archiwum.html) pojawia się na ostatniej stronie
   jak dotychczas.

   1.26.7 (właściciel 04.11: „wróć do 4 — w drugim wierszu, tym pod
   hero, mają być 4 kafelki a nie 5; dodaj strzałki < i > do
   przewijania w czasie wstecz i z powrotem”): DESKTOP (≥64rem)
   = 4 KOLUMNY + STRZAŁKI CZASU po bokach sekcji — „>” po PRAWEJ
   cofa WSTECZ W CZASIE o cały rząd (4 kafelki), „<” po LEWEJ
   wraca do nowszych (kierunek celowo „odwrotny” niż w klasycznej
   karuzeli — decyzja właściciela); na krańcach osi czasu strzałka
   NIEAKTYWNA (półprzezroczysta, cursor: not-allowed); pod rzędem
   ZNACZNIK POZYCJI = klikalne kropki stron + zakres dat widocznych
   kafelków („25–29 paź”); klawiatura: → wstecz, ← powrót (gdy fokus
   w scenie). „Rozwiń” na desktopie znika — zastępują go strzałki;
   TABLET (40–64rem) i MOBILE bez zmian (tury + „Rozwiń” jak 1.26.6).
   Mechanika: wszystkie kafelki są w DOM, widocznością strony rządzi
   klasa .lustro-poza-strona (tylko ≥64rem), wejście strony = animacja
   z kierunku podróży (data-kierunek). Kadrowanie wideo: pomiary
   nieudane (obraz jeszcze ukryty) nie trafiają do cache — ponawiane
   po przewinięciu.

   1.26.6 (właściciel 04.11: „5 kafelków w wierszu zamiast 3 — będą
   bardziej kwadratowe, łatwiejsze do wypełnienia zdjęciem bez
   ramek”): 5 kolumn na desktopie (zastąpione w 1.26.7), tablet
   3 kolumny (koniec sieroty 2+1), nowa tura .lustro-tura-4
   (kafelki 4–5): tablet po „Rozwiń”, mobile nigdy.

   1.20.0 (02.11, decyzja właściciela: „kafelki zajmują za dużo
   miejsca”): STRONA GŁÓWNA w PORCJACH ROZWIJANYCH — desktop (≥40 rem)
   start = hero + 3 kafelki, „Rozwiń” dokłada 6 (do 10); mobile
   (<40 rem) start = hero + 1, „Rozwiń” dokłada 2 (do 4); reszta tylko
   przez „Pokaż starsze wpisy” → archiwum.html. Mechanika: renderer
   przydziela kartom TURY (.lustro-tura-2 / .lustro-tura-3), a widoczność
   reguluje CSS (media query + klasa .rozwinieta na kontenerze) — ten sam
   kod serwuje oba układy bez przerenderowania. Przycisk „Rozwiń” =
   trójkącik z „O klubie” (obrót 180°, aria-expanded, po rozwinięciu
   etykieta „Zwiń”); jego widoczność liczy się na żywo pod viewport
   (matchMedia) — znika, gdy poza porcją nie ma już nic.

   1.11.0 (31.10, noc — „reel bez pasów”):
   - KADROWANIE MINIATUR WIDEO w przeglądarce: FB wypala poziomy
     film w pionowe płótno 9:16, więc plik miniatury reela ma
     wypalone czarne pasy (zweryfikowane: 61% pikseli hero-reela
     to ramka; żaden wariant z Graph API nie daje wersji czystej).
     CDN FB wysyła access-control-allow-origin: * (zweryfikowane
     dla scontent- i external-), więc miniaturę da się wczytać
     do <canvas> z crossOrigin="anonymous" i zmierzyć pasy
     deterministycznie (RGB ≤ 20 = rząd ramki; zero AI, zero
     zapytań dodatkowych poza jednym obrazkiem).
   - wynik pomiaru = środek TREŚCI w % → CSS (img.news-crop)
     stosuje object-fit: cover + object-position — pasy wypadają
     poza ramkę, obraz wypełnia kafelek/hero/okładkę dialogu;
   - bezpieczniki: kadrowane WYŁĄCZNIE media_type=video (zdjęcia
     pasów nie mają, a ciemne foto nocne złapałoby fałszywe
     pasy); pas > 45% wymiaru albo treść < 15% wymiaru = rezygnacja;
     pomiar nieudany (CORS/timeout/awaria) = wygląd jak dotąd.

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
  const ACCESS_TOKEN = "EAAgzJl0ZC6ZBIBS3EIBlIZCLF0j63uEDSZCZBB8L4GWfXowpf6T8via0Xtzg00hrZCSI12nArcbamySv1Ttj8nCN6IfdE1UkOxxJ5zPCzyh1PrlhU10LfIrZCl9MheWt5YBs52jd65PHV1s5gYzlBFbh3jQLmIi6B6i7iPHMYoRrOKfXqHaYonMLMSGXZBrRYAsu9NcZD";    // page token KTS z SYSTEM USERA (read-only, bez zegara danych — 1.10.5)
  const API = "https://graph.facebook.com/v22.0";
  const FIELDS = "id,message,story,created_time,permalink_url,full_picture,attachments{media_type}";
  /* 1.26.9: stała pula sekcji głównej (decyzja właściciela 04.11:
     „może 20 to nawet lepszy pomysł — daje sumę 21 kafelków, a to
     szczęśliwa liczba” — hero + 20 = 21) = 5 pełnych rzędów po 4.
     Zastępuje okno 30 dni (Q2), minimum 10 (P1/31.10) i pulę 12
     z 1.26.8. */
  const PULA_KAFELKOW = 20;       // kafelki siatki (hero osobno) — suma 21
  const LIMIT_GLOWNA = 50;        // zapas poboru (pula + marża na awarie)
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

  /** Czy wpis ma załącznik wideo (reel/YouTube) — tylko takie kadrujemy. */
  const jestVideo = (p) =>
    !!(p.attachments && p.attachments.data && p.attachments.data[0]
       && p.attachments.data[0].media_type === "video");

  /* ---- 1.11.0: pomiar czarnych pasów miniatury (patrz nagłówek) ---- */
  const POMIARY_KADRU = new Map();   // url → Promise<{x, y, ar} | null>

  /** Procentowa pozycja środka treści + proporcje treści bez pasów.
   *  Zwraca null, gdy pomiar się nie uda albo pasy wyglądają na
   *  fałszywe (ciemny kadr zamiast letterboxu) — wtedy kafelek
   *  zostaje w wyglądzie bazowym (contain). */
  function zmierzPasy(url) {
    if (POMIARY_KADRU.has(url)) return POMIARY_KADRU.get(url);
    const pomiar = new Promise((resolve) => {
      const img = new Image();
      const stop = setTimeout(() => resolve(null), 8000);
      img.crossOrigin = "anonymous";          // wymagane do odczytu pikseli
      img.onload = () => {
        clearTimeout(stop);
        try {
          const iw = img.naturalWidth, ih = img.naturalHeight;
          if (!iw || !ih) return resolve(null);
          // pomiar w miniaturze ~160 px — dokładność wystarcza,
          // koszt dekodowania pomijalny
          const skala = Math.min(1, 160 / Math.max(iw, ih));
          const w = Math.max(2, Math.round(iw * skala));
          const h = Math.max(2, Math.round(ih * skala));
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          const cx = cv.getContext("2d", { willReadFrequently: true });
          cx.drawImage(img, 0, 0, w, h);
          const px = cx.getImageData(0, 0, w, h).data;
          const czarny = (i) => px[i] <= 20 && px[i + 1] <= 20 && px[i + 2] <= 20;
          const rzad = (y) => {
            for (let x = 0; x < w; x++) if (!czarny((y * w + x) * 4)) return false;
            return true;
          };
          const kolumna = (x) => {
            for (let y = 0; y < h; y++) if (!czarny((y * w + x) * 4)) return false;
            return true;
          };
          let gora = 0; while (gora < h && rzad(gora)) gora++;
          let dol = 0; while (dol < h && rzad(h - 1 - dol)) dol++;
          let lewa = 0; while (lewa < w && kolumna(lewa)) lewa++;
          let prawa = 0; while (prawa < w && kolumna(w - 1 - prawa)) prawa++;
          // bezpieczniki: pas dłuższy niż 45% wymiaru albo treść
          // węższa/niższa niż 15% wymiaru to nie letterbox, tylko
          // ciemny kadr — kadrowanie odstaje (wygląd bazowy)
          if (gora > h * 0.45 || dol > h * 0.45) return resolve(null);
          if (lewa > w * 0.45 || prawa > w * 0.45) return resolve(null);
          const trescW = w - lewa - prawa, trescH = h - gora - dol;
          if (trescW < w * 0.15 || trescH < h * 0.15) return resolve(null);
          resolve({
            x: +(((lewa + trescW / 2) / w) * 100).toFixed(2),
            y: +(((gora + trescH / 2) / h) * 100).toFixed(2),
            ar: +(trescW / trescH).toFixed(4),
          });
        } catch (e) {
          resolve(null);   // canvas tainted (brak CORS) — wygląd bazowy
        }
      };
      img.onerror = () => { clearTimeout(stop); resolve(null); };
      img.src = url;
    });
    /* 1.26.7: porażki NIE trafiają do cache — kafelek mógł być ukryty
       (strona 2+ na desktopie, obraz „lazy” się nie załadował);
       po przewinięciu pomiar zostanie ponowiony */
    pomiar.then((w) => { if (!w) POMIARY_KADRU.delete(url); });
    POMIARY_KADRU.set(url, pomiar);
    return pomiar;
  }

  /** Wpis pomiaru w obrazek: klasa + zmienne CSS (patrz style.css). */
  function zastosujKadry(img, kadr) {
    if (!img || !kadr) return;
    img.style.setProperty("--kadruj-x", kadr.x + "%");
    img.style.setProperty("--kadruj-y", kadr.y + "%");
    img.style.setProperty("--kadruj-ar", String(kadr.ar));
    img.classList.add("news-crop");
  }

  /** Kadruje wszystkie wideo w kontenerze (hero/siatka/archiwum). */
  function kadrujWideo(kontener) {
    if (!kontener) return;
    kontener.querySelectorAll('article[data-video="1"] img').forEach((img) => {
      const url = img.getAttribute("src");
      if (!url) return;
      zmierzPasy(url).then((kadr) => zastosujKadry(img, kadr));
    });
  }

  const karta = (p, dodatkowaKlasa = "") => `
    <article class="card news-card news-klik lustro-karta${dodatkowaKlasa ? " " + dodatkowaKlasa : ""}" data-post-id="${esc(p.id)}" data-czas="${esc(p.created_time)}"${jestVideo(p) ? ' data-video="1"' : ""}
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
    <article class="card news-card news-klik lustro-karta lustro-hero" data-post-id="${esc(p.id)}"${jestVideo(p) ? ' data-video="1"' : ""}
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
      // 1.11.0: okładka wideo bez pasów — ten sam pomiar (cache),
      // proporcje ramki = proporcje treści (patrz style.css)
      if (p.full_picture && jestVideo(p)) {
        const img = okladka.querySelector("img");
        zmierzPasy(p.full_picture).then((kadr) => zastosujKadry(img, kadr));
      }
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
  /* 1.26.7: dwa tryby sekcji — DESKTOP (≥64rem) = STRZAŁKI CZASU
     (stronicowanie po NA_STRONIE=4 kafelkach, „>” prawa = wstecz,
     „<” lewa = powrót), TABLET/MOBILE = porcje „Rozwiń/Zwiń” jak
     w 1.26.6 (MOBILE 2 = hero+1, TABLET 4 = hero+3). Granice
     40/64 rem — te same co w CSS (#lustro-fb-grid, .lustro-tura-*,
     .lustro-scena). */
  const MOBILE_MQ = window.matchMedia("(max-width: 40rem)");
  const SZEROKI_MQ = window.matchMedia("(min-width: 64rem)");
  const START_MOBILE = 2;    // hero + 1 kafelek (porcje mobilne)
  const START_TABLET = 4;    // hero + 3 (3 kolumny, 40–64rem)
  const NA_STRONIE = 4;      // 1.26.7: rząd desktopu = 4 kafelki

  /* 1.26.7: skrócone miesiące zakresu dat pod rzędem */
  const MIESIACE_KROTKIE = ["sty", "lut", "mar", "kwi", "maj", "cze",
    "lip", "sie", "wrz", "paź", "lis", "gru"];

  /** Zakres dat strony: „30 paź – 2 lis”; ten sam miesiąc =
   *  „25–29 paź”; rok dopisywany tylko gdy inny niż bieżący. */
  const formatujZakres = (isoOd, isoDo) => {
    const f = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null
        : { dzien: d.getDate(), miesiac: d.getMonth(), rok: d.getFullYear() };
    };
    const a = f(isoOd), b = f(isoDo);          // a = starsza, b = nowsza
    if (!a || !b) return "";
    const rok = (r) => (r !== new Date().getFullYear() ? ` ${r}` : "");
    if (a.rok === b.rok && a.miesiac === b.miesiac) {
      return a.dzien === b.dzien
        ? `${a.dzien} ${MIESIACE_KROTKIE[a.miesiac]}${rok(a.rok)}`
        : `${a.dzien}–${b.dzien} ${MIESIACE_KROTKIE[a.miesiac]}${rok(a.rok)}`;
    }
    if (a.rok === b.rok) {
      return `${a.dzien} ${MIESIACE_KROTKIE[a.miesiac]} – `
        + `${b.dzien} ${MIESIACE_KROTKIE[b.miesiac]}${rok(a.rok)}`;
    }
    return `${a.dzien} ${MIESIACE_KROTKIE[a.miesiac]}${rok(a.rok)} – `
      + `${b.dzien} ${MIESIACE_KROTKIE[b.miesiac]}${rok(b.rok)}`;
  };

  async function initGlowna() {
    const kontener = $("#lustro-fb");
    const hero = $("#lustro-fb-hero");
    const grid = $("#lustro-fb-grid");
    const strefaPrzycisku = $("#lustro-rozwin-strefa");
    const przycisk = $("#lustro-rozwin");
    const etykieta = przycisk ? przycisk.querySelector(".etykieta") : null;
    const stopka = $("#lustro-starsze");   // 1.20.1: „Pokaż starsze wpisy” po rozwinięciu
    /* 1.26.7: scena strzałek + znacznik pozycji (desktop); ID celowo
       z przedrostkiem „strzalka-” — goły #lustro-starsze to stopka
       „Pokaż starsze wpisy” (kolizja ID = ukryta strzałka, wykryta
       testami v1.26.7) */
    const scena = $("#lustro-scena");
    const strzalkaNowsze = $("#lustro-strzalka-nowsze");     // „<” lewa — powrót
    const strzalkaStarsze = $("#lustro-strzalka-starsze");  // „>” prawa — wstecz w czasie
    const pager = $("#lustro-pager");
    const kropki = $("#lustro-kropki");
    const zakres = $("#lustro-zakres");
    if (!kontener || !hero || !grid) return;
    podpiezKarty(kontener);

    /* stan: rozwinięcie (tablet/mobile) + stronicowanie (desktop) */
    let rozwinieta = false;
    let ilePostow = 0;
    let daneGotowe = false;                 // dane albo kafel awaryjny
    let kafelkiEl = [];                     // kafelki siatki (bez hero)
    let strona = 0;                         // bieżąca strona (0 = najnowsze)
    let liczbaStron = 1;
    let trybStrzalek = SZEROKI_MQ.matches;  // desktop ≥64rem

    /* kropki stron znacznika pozycji (klikalne = skok do strony) */
    const renderKropki = () => {
      if (!kropki) return;
      kropki.innerHTML = "";
      for (let i = 0; i < liczbaStron; i++) {
        const k = document.createElement("button");
        k.type = "button";
        k.className = "lustro-kropka";
        k.setAttribute("aria-label", `Strona ${i + 1} z ${liczbaStron}`);
        if (i === strona) k.setAttribute("aria-current", "page");
        k.addEventListener("click", () =>
          idzNaStrone(i, i > strona ? "starsze" : "nowsze"));
        kropki.appendChild(k);
      }
    };

    /* zakres dat widocznej strony (kafelki = newest→oldest) */
    const pokazZakres = () => {
      if (!zakres) return;
      const daty = kafelkiEl
        .slice(strona * NA_STRONIE, (strona + 1) * NA_STRONIE)
        .map((el) => el.dataset.czas).filter(Boolean);
      zakres.textContent = daty.length
        ? formatujZakres(daty[daty.length - 1], daty[0]) : "";
    };

    /* widoczność strony startowej (bez animacji) — też po zmianie
       trybu (desktop ↔ tablet) i po dojechaniu danych */
    const zastosujStartowaStrone = () => {
      strona = 0;
      kafelkiEl.forEach((el, i) => {
        el.classList.toggle("lustro-poza-strona",
          trybStrzalek && Math.floor(i / NA_STRONIE) !== 0);
        el.classList.remove("lustro-anim");
        el.style.animationDelay = "";
      });
      renderKropki();
      pokazZakres();
    };

    /* STRZAŁKI CZASU: przestawienie strony o cały rząd (4 kafelki).
       Kierunek podróży trafia w data-kierunek → CSS animuje wejście
       kafelków z właściwej strony (starsze = z prawej). */
    function idzNaStrone(n, kierunek) {
      if (!trybStrzalek) return;
      const cel = Math.max(0, Math.min(liczbaStron - 1, n));
      if (cel === strona) return;
      strona = cel;
      kontener.dataset.kierunek = kierunek === "nowsze" ? "nowsze" : "starsze";
      kafelkiEl.forEach((el, i) => {
        const nr = i - strona * NA_STRONIE;      // 0–3 = bieżący rząd
        const naStronie = nr >= 0 && nr < NA_STRONIE;
        el.classList.toggle("lustro-poza-strona", !naStronie);
        el.classList.remove("lustro-anim");
        el.style.animationDelay = "";
        if (naStronie) {
          /* restart animacji wejścia + stagger 40 ms na kolumnę */
          void el.offsetWidth;
          el.style.animationDelay = `${nr * 0.04}s`;
          el.classList.add("lustro-anim");
        }
      });
      renderKropki();
      pokazZakres();
      kadrujWideo(grid);   // 1.26.7: pomiary wideo ukrytych dotąd kafelków
      /* fokus nie może zginąć: kafelek, w którym stał, właśnie zniknął
         (display:none przerzuca fokus na <body> i klawiatura by zdechła)
         — prowadź go na pierwszy kafelek nowej strony */
      const aktywny = document.activeElement;
      if (aktywny && grid.contains(aktywny)
          && aktywny.classList.contains("lustro-poza-strona")) {
        const pierwszy = kafelkiEl[strona * NA_STRONIE];
        if (pierwszy) pierwszy.focus();
      }
      stanSterowania();
    }

    /* jeden wspólny licznik stanu przycisków obu trybów */
    const stanSterowania = () => {
      if (SZEROKI_MQ.matches) {
        /* DESKTOP — strzałki czasu: krańce osi czasu = nieaktywna
           strzałka (półprzezroczysta, cursor: not-allowed w CSS) */
        if (strzalkaNowsze) strzalkaNowsze.disabled = strona <= 0;
        if (strzalkaStarsze) strzalkaStarsze.disabled = strona >= liczbaStron - 1;
        if (pager) pager.hidden = liczbaStron <= 1;
        /* „Pokaż starsze wpisy” na OSTATNIEJ stronie (wyczerpany zasób
           sekcji) albo gdy stronicować nie ma czego — duch decyzji
           1.20.1; przed dojazdem danych nie świeci (skeleton) */
        if (stopka) {
          stopka.hidden = !daneGotowe
            || (liczbaStron > 1 && strona < liczbaStron - 1);
        }
        if (strefaPrzycisku) strefaPrzycisku.hidden = true;  // „Rozwiń” nie na desktopie
      } else {
        /* TABLET/MOBILE — porcje jak w 1.26.6 */
        const start = MOBILE_MQ.matches ? START_MOBILE : START_TABLET;
        const maRozwijac = ilePostow > start;
        // „Zwiń” wisi po rozwinięciu (nawet gdy w nowym porcie nie ma
        // czego dokładać — da się wrócić do porcji startowej)
        if (strefaPrzycisku) strefaPrzycisku.hidden = !maRozwijac && !rozwinieta;
        // 1.20.1: „Pokaż starsze wpisy” dopiero PO ROZWINIĘCIU;
        // wyjątek: gdy rozwijać nie ma czego — od razu
        if (stopka) stopka.hidden = maRozwijac && !rozwinieta;
        if (pager) pager.hidden = true;
      }
      if (etykieta) etykieta.textContent = rozwinieta ? "Zwiń" : "Rozwiń";
    };

    if (strzalkaStarsze) {
      strzalkaStarsze.addEventListener("click", () =>
        idzNaStrone(strona + 1, "starsze"));
    }
    if (strzalkaNowsze) {
      strzalkaNowsze.addEventListener("click", () =>
        idzNaStrone(strona - 1, "nowsze"));
    }
    /* klawiatura (gdy fokus w scenie aktualności): → = wstecz w
       czasie, ← = powrót — jak strzałki na ekranie */
    if (scena) {
      scena.addEventListener("keydown", (e) => {
        if (!trybStrzalek) return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          idzNaStrone(strona + 1, "starsze");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          idzNaStrone(strona - 1, "nowsze");
        }
      });
    }

    if (przycisk) {
      przycisk.addEventListener("click", () => {
        rozwinieta = !rozwinieta;
        kontener.classList.toggle("rozwinieta", rozwinieta);
        przycisk.setAttribute("aria-expanded", String(rozwinieta));
        stanSterowania();
      });
    }
    /* obrót telefonu / zmiana okna: przelicz progi, a przy zmianie
       trybu (desktop ↔ tablet) wróć do porcji startowej —
       strzałki i „Rozwiń” nigdy nie walczą o te same kafelki */
    const zmianaPortu = () => {
      const terazDesktop = SZEROKI_MQ.matches;
      if (terazDesktop !== trybStrzalek) {
        trybStrzalek = terazDesktop;
        rozwinieta = false;
        kontener.classList.remove("rozwinieta");
        if (przycisk) przycisk.setAttribute("aria-expanded", "false");
        if (trybStrzalek) {
          zastosujStartowaStrone();
        } else {
          kafelkiEl.forEach((el) => {
            el.classList.remove("lustro-poza-strona", "lustro-anim");
            el.style.animationDelay = "";
          });
          strona = 0;
          renderKropki();
        }
      }
      stanSterowania();
    };
    [MOBILE_MQ, SZEROKI_MQ].forEach((mq) => {
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", zmianaPortu);
      } else if (typeof mq.addListener === "function") {
        mq.addListener(zmianaPortu);   // starsze Safari
      }
    });

    // skeleton od razu (P2) — sekcja żyje, zanim dojadą dane
    // (1.10.1: hero-pasek płaski, 10rem jak zwykłe kafelki;
    //  1.26.7: 4 kostki — wiersz startowy desktopu = 4 kafelki,
    //  tablet pokazuje 3 z nich, mobile 1 — tury te same co dla danych)
    hero.innerHTML = skeleton("lustro-skeleton--hero", "10rem");
    grid.innerHTML = ["", "lustro-tura-2", "lustro-tura-2", "lustro-tura-4"]
      .map((tura) => skeleton(tura, "10rem")).join("");

    try {
      const { posty } = await pobierzPosty({ limit: LIMIT_GLOWNA });
      if (!posty.length) throw new Error("brak postów");

      /* 1.26.9: STAŁA PULA — 21 najnowszych wpisów (hero + 20 kafelków),
         niezależnie od wieku postów i aktywności klubu. Przy krótkim
         zasobie FB (mniej niż 21) bierzemy wszystko, co jest. */
      const ile = Math.min(1 + PULA_KAFELKOW, posty.length);
      const widoczne = posty.slice(0, ile);

      widoczne.forEach((p) => cache.set(p.id, p));
      hero.innerHTML = kartaHero(widoczne[0]);
      // tury porcji (tablet/mobile, jak 1.26.6) — pozycja wśród
      // postów (hero = 0): 1 = zawsze widoczna, 2–3 = tablet od razu /
      // mobile po „Rozwiń”, 4–5 = tablet po „Rozwiń” / mobile nigdy,
      // 6+ = tablet po „Rozwiń” / mobile tylko archiwum.
      // Na desktopie tury są martwe (CSS ≥64rem) — rządzi stronicowanie.
      grid.innerHTML = widoczne.slice(1).map((p, i) => {
        const nr = i + 1;
        const tura = nr >= 6 ? "lustro-tura-3"
          : nr >= 4 ? "lustro-tura-4"
          : nr >= 2 ? "lustro-tura-2" : "";
        return karta(p, tura);
      }).join("");
      kadrujWideo(kontener);   // 1.11.0: pomiary pasów wideo (hero + siatka)

      /* 1.26.9: DOGRZEWKA OBRAZÓW W TLE (właściciel 04.11: „załaduj je
         w tle — bo wtedy animacja będzie naprawdę płynna”). Kafelki
         ukrytych stron noszą loading="lazy" w .lustro-poza-strona
         (display:none) — przeglądarka NIE pobiera ich, dopóki strona
         nie stanie się widoczna, więc obrót strony czekałby na sieć
         i animacja wjazdu odbywałaby się na pustych kafelkach. Dogrzewka
         (new Image() na URL pełnej puli, po requestIdleCallback)
         zapełnia HTTP cache poza głównym pasmem ładowania — a lazy
         <img> przy odsłonięciu strony błyskawicznie zdejmuje obraz
         z cache. Zero dodatkowych zapytań do FB (te same URL-e co
         w kartach), dekodowanie async, licznik dla testów. */
      const dogrzewka = () => {
        let n = 0;
        widoczne.forEach((p) => {
          if (!p.full_picture) return;
          const img = new Image();
          img.decoding = "async";
          img.src = p.full_picture;
          n += 1;
        });
        window.__LUSTRO_DODGRZANE = n;   // widok dla testów (wzór __GALFB)
      };
      if (typeof window.requestIdleCallback === "function") {
        requestIdleCallback(dogrzewka, { timeout: 3000 });
      } else {
        setTimeout(dogrzewka, 900);
      }

      ilePostow = widoczne.length;
      /* 1.26.7: kafelki + strony — desktop od razu pokazuje stronę 0
         (najnowsze), kropki i zakres dat gotowe */
      kafelkiEl = [...grid.querySelectorAll(".lustro-karta")];
      liczbaStron = Math.max(1, Math.ceil(kafelkiEl.length / NA_STRONIE));
      daneGotowe = true;
      zastosujStartowaStrone();
      stanSterowania();
    } catch (e) {
      console.warn("[lustro-fb] pominięto:", e.message);
      rozwinieta = false;
      kontener.classList.remove("rozwinieta");
      ilePostow = 0;
      if (strefaPrzycisku) strefaPrzycisku.hidden = true;
      if (stopka) stopka.hidden = false;   // kafel awaryjny — zostaw drogę do archiwum
      hero.innerHTML = "";
      grid.innerHTML = kartaFallback();      // P3: kafel awaryjny
      /* 1.26.7: stan końcowy awaryjny — strzałki zgaszone, pager schowany */
      kafelkiEl = [];
      strona = 0;
      liczbaStron = 1;
      daneGotowe = true;
      stanSterowania();
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
      kadrujWideo(lista);   // 1.11.0: pomiary pasów wideo — CAŁA lista
                             // (pomiar cache'owany per URL, więc dosypywanie
                             // „Starszych wpisów” nic nie kosztuje podwójnie)
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
