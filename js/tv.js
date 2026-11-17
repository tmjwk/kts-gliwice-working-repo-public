/* ============================================================
 * KTS TV · js/tv.js · v1.0 (wdrożenie testowe, Task 210)
 * ------------------------------------------------------------
 * Podstrona tv.html: renderuje stany transmisji z tv.json.
 *
 * DWIE WARSTWY ŚWIEŻOŚCI:
 *   1) tv.json (Actions co ~15 min w oknach meczowych — pewny bas);
 *   2) BEZPOŚREDNI odczyt arkusza gviz z przeglądarki (CORS: Google
 *      odpowiada access-control-allow-origin dla naszego originu —
 *      zweryfikowane 17.11). Działa → nadpisuje stan z tv.json;
 *      nie działa (adblock/restriction) → zostaje tv.json. GVIZ czyta
 *      WYŁĄCZNIE TV_Transmisje — zero danych osobowych w przeglądarce.
 *
 * STANY (mapowanie 1:1 na kolumnę „Stan” arkusza TV_Transmisje):
 *   LIVE      → player YouTube (IFrame API, click-to-play: autoplay
 *               z dźwiękiem jest blokowany — zaczynamy plakatem
 *               i przyciskiem, lekkie dla strony);
 *   WKKRÓTCE  → kafelek zapowiedzi z datą/godziną meczu;
 *   VOD/ZAKOŃCZONA → Archiwum transmisji (lista nagrań);
 *   brak      → „cisza w eterze” + najbliższe mecze z tv.json.mecze.
 *
 * TRYB DEMO (?tv-demo=LIVE|WKROTCE|VOD) — DO TESTÓW BEZ RUSZANIA
 * ARKUSZA: wypełnia scenę przykładowymi danymi (lofi girl / sky news
 * — wiecznie żywe strumienie 24/7). Zawsze z czerwoną obwódką
 * „DEMO” — nie da się pomylić z realnym stanem. Arkusz nie jest
 * czytany w trybie demo.
 * ============================================================ */
(function () {
  "use strict";

  /* 1.35.1: PRYWATNOŚĆ — warstwa przeglądarkowa czyta WYŁĄCZNIE wersję
   * OPUBLIKOWANĄ arkusza (pub?gid=191595212). Publikacja „na internet”
   * obejmuje tylko zakładkę TV_Transmisje — reszta (e-maile zgłaszających,
   * logi) nigdy nie jest częścią pub, więc nie może wyciec do przeglądarki.
   * CORS: Google odpowiada ACAO:* (zweryfikowane 17.11). Gdy właściciel
   * opublikuje arkusz od nowa, zmieni się URL — wtedy ten gid do poprawki. */
  var PUB_TV = "https://docs.google.com/spreadsheets/d/e/" +
    "2PACX-1vShni3KQFw-viXRvO_qoTGKX4_2OUxJzs4DZrVYchM2P71d7ynhxuAjQQgj8Ho0123G4C5bpoJrF4lI" +
    "/pub?gid=191595212&single=true&output=csv";
  var CO_ILE_S = 90; // odświeżenie warstwy gviz (sekundy)

  var scena, meta, statusEl, archiwum, archiwumLista, archiwumCount,
      mecze, meczeLista, meczeCount, zglos, zglosLink;

  /* ---------- narzędzia ---------- */

  function tekst(kom) { return (kom || "").trim(); }

  /** Escapes HTML — tytuły z arkusza trafiają do innerHTML. */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** „2026-11-27” + „18:00” → „pt, 27.11, godz. 18:00” (bez IO Intl). */
  function formatujDate(data, godzina) {
    var dz = ["nd", "pon", "wt", "śr", "czw", "pt", "sob"];
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst(data));
    if (!m) return tekst(data);
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var s = dz[d.getDay()] + " " + (+m[3]) + "." + (+m[2]);
    if (godzina) s += ", godz. " + godzina;
    return s;
  }

  /** Aktualny stan na podstawie listy transmisji. */
  function stanTransmisji(tr) {
    var live = tr.filter(function (t) { return t.stan === "LIVE"; });
    if (live.length) return { tryb: "LIVE", transmisja: live[0] };
    var wkrotce = tr.filter(function (t) { return t.stan === "WKRÓTCE"; });
    if (wkrotce.length) return { tryb: "WKROTCE", transmisja: wkrotce[0] };
    return { tryb: "BRAK", transmisja: null };
  }

  /** VideoId z URL-a (watch?v= · youtu.be/ · /live/ · /embed/ · goły id). */
  function videoIdZ(url) {
    var s = tekst(url);
    var m = /[?&]v=([A-Za-z0-9_-]{6,})/.exec(s) ||
            /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(s) ||
            /\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{6,})/.exec(s);
    return m ? m[1] : (/^[A-Za-z0-9_-]{8,}$/.test(s) ? s : "");
  }

  /* ---------- parsowanie CSV (wzór: sync_tv.ts) ---------- */

  function parsujCsv(t) {
    var wiersze = [], wiersz = [], pole = "", wCudz = false, i, zn;
    for (i = 0; i < t.length; i++) {
      zn = t[i];
      if (wCudz) {
        if (zn === '"') { if (t[i + 1] === '"') { pole += '"'; i++; } else wCudz = false; }
        else pole += zn;
      } else if (zn === '"') wCudz = true;
      else if (zn === ",") { wiersz.push(pole); pole = ""; }
      else if (zn === "\n") { wiersz.push(pole); wiersze.push(wiersz); pole = ""; wiersz = []; }
      else if (zn !== "\r") pole += zn;
    }
    if (pole !== "" || wiersz.length) { wiersz.push(pole); wiersze.push(wiersz); }
    return wiersze.filter(function (w) { return w.length > 1 || tekst(w[0]) !== ""; });
  }

  /** gviz CSV → lista transmisji (nagłówek → indeksy, jak sync_tv.ts). */
  function gvizNaTransmisje(csvTekst) {
    var w = parsujCsv(csvTekst.replace(/^\uFEFF/, ""));
    if (!w.length) return [];
    var idx = {};
    w[0].forEach(function (n, i) { idx[tekst(n)] = i; });
    var out = [];
    w.slice(1).forEach(function (r) {
      var wez = function (k) { return tekst(r[idx[k]]); };
      var vid = wez("videoId");
      if (!vid) return;
      out.push({
        videoId: vid,
        kanal: wez("Kanał"),
        tytul: wez("Tytuł"),
        url: wez("URL") || "https://www.youtube.com/watch?v=" + vid,
        stan: (wez("Stan") || "VOD").toUpperCase(),
        mecz: wez("Mecz"),
        liga: wez("Liga"),
        kolejka: wez("Kolejka"),
        dataMeczu: wez("DataMeczu"),
        dataTransmisji: wez("DataTransmisji"),
      });
    });
    return out;
  }

  /* ---------- renderowanie ---------- */

  function pokazStatus(t, klasa) {
    statusEl.textContent = t;
    statusEl.className = "t-small t-nums " + (klasa || "text-primary");
  }

  /** LIVE: player (plakat + przycisk odtwarzania; IFrame API dokłada
   *  iframe po kliknięciu — zero kosztu przed decyzją widza). */
  function renderLive(t) {
    var vid = t.videoId || videoIdZ(t.url);
    scena.innerHTML =
      '<div class="tv-player" data-vid="' + esc(vid) + '">' +
        '<img class="tv-player-plakat" src="https://i.ytimg.com/vi/' + esc(vid) + '/hqdefault.jpg" alt="" loading="lazy">' +
        '<button type="button" class="tv-player-btn" aria-label="Odtwórz transmisję">' +
          '<span class="tv-player-btn-kolo">▶</span>' +
          '<span class="tv-player-btn-etykieta">Oglądaj na żywo</span>' +
        "</button>" +
        '<span class="tv-badge-live"><span class="tv-kropka" aria-hidden="true"></span>NA ŻYWO</span>' +
      "</div>";
    scena.querySelector(".tv-player-btn").addEventListener("click", function () {
      zaladujPlayer(vid);
    });
    renderMeta(t);
  }

  /** WKRÓTCE: kafelek zapowiedzi (bez playera — stream jeszcze nie istnieje). */
  function renderWkrotce(t) {
    scena.innerHTML =
      '<div class="tv-zapowiedz">' +
        '<div class="tv-zapowiedz-ikona" aria-hidden="true">📡</div>' +
        '<div>' +
          '<p class="tv-badge-wkrotce">WKRÓTCE</p>' +
          '<h2 class="t-h3" style="margin-top:.5rem;">' + esc(t.tytul || t.mecz || "Zapowiedziana transmisja") + "</h2>" +
          (t.mecz ? '<p class="t-small" style="margin-top:.35rem;">' + esc(t.mecz) +
            (t.liga ? ' · <span class="t-nums">' + esc(t.liga) + "</span>" : "") + "</p>" : "") +
          (t.dataMeczu ? '<p class="t-small muted" style="margin-top:.25rem;">' + esc(formatujDate(t.dataMeczu, "")) + "</p>" : "") +
          '<a class="btn btn-outline btn-sm" style="margin-top:1rem;" href="' + esc(t.url) + '" target="_blank" rel="noopener">Otwórz na YouTube&nbsp;<span aria-hidden="true">↗</span></a>' +
        "</div>" +
      "</div>";
    renderMeta(t);
  }

  /** BRAK: cisza w eterze + (jeśli są) najbliższe mecze. */
  function renderBrak(dane) {
    scena.innerHTML =
      '<div class="tv-brak">' +
        '<div class="tv-brak-ikona" aria-hidden="true">📺</div>' +
        '<h2 class="t-h3">Cisza w eterze</h2>' +
        '<p class="t-small muted" style="margin-top:.5rem; max-width:34rem;">' +
          "Aktualnie żadna transmisja nie jest prowadzona ani zapowiedziana. " +
          "Gdy tylko arkusz wykryje stream z meczem KTS, pojawi się tu automatycznie." +
        "</p>" +
      "</div>";
    meta.hidden = true;
    if (dane && dane.mecze && dane.mecze.length) renderMecze(dane.mecze);
  }

  /** Meta pod sceną: tytuł, mecz, liga, kanał. */
  function renderMeta(t) {
    meta.hidden = false;
    var linie = [];
    if (t.tytul) linie.push('<p class="t-body" style="font-weight:600;">' + esc(t.tytul) + "</p>");
    if (t.mecz) linie.push('<p class="t-small">' + esc(t.mecz) +
      (t.liga ? ' · <span class="t-nums">' + esc(t.liga) +
        (t.kolejka ? " · " + esc(t.kolejka) + ". kolejka" : "") + "</span>" : "") + "</p>");
    if (t.kanal) linie.push('<p class="t-small muted">kanał: ' + esc(t.kanal) + "</p>");
    meta.innerHTML = linie.join("");
  }

  /** Archiwum: lista VOD/ZAKOŃCZONYCH (najnowsze z góry). */
  function renderArchiwum(tr) {
    var vod = tr.filter(function (t) { return t.stan === "VOD" || t.stan === "ZAKOŃCZONA"; });
    if (!vod.length) { archiwum.hidden = true; return; }
    archiwum.hidden = false;
    archiwumCount.textContent = vod.length;
    vod.sort(function (a, b) { return (b.dataTransmisji || "").localeCompare(a.dataTransmisji || ""); });
    archiwumLista.innerHTML = vod.map(function (t) {
      var vid = t.videoId || videoIdZ(t.url);
      return (
        '<a class="tv-karta" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
          '<span class="tv-karta-miniatura"><img src="https://i.ytimg.com/vi/' + esc(vid) + '/mqdefault.jpg" alt="" loading="lazy"></span>' +
          '<span class="tv-karta-tresc">' +
            '<span class="t-body" style="font-weight:600;">' + esc(t.tytul || t.mecz || "Nagranie transmisji") + "</span>" +
            (t.mecz ? '<span class="t-small muted">' + esc(t.mecz) + "</span>" : "") +
            '<span class="t-small t-nums muted">' +
              (t.dataTransmisji ? esc(formatujDate(t.dataTransmisji, "")) : "") +
              (t.kanal ? " · " + esc(t.kanal) : "") +
            "</span>" +
          "</span>" +
          '<span class="tv-karta-strzalka" aria-hidden="true">↗</span>' +
        "</a>");
    }).join("");
  }

  /** Najbliższe mecze (kontekst przy „brak transmisji”). */
  function renderMecze(lista) {
    mecze.hidden = false;
    meczeCount.textContent = lista.length;
    meczeLista.innerHTML = lista.map(function (m) {
      return (
        '<div class="tv-karta tv-karta--mecz">' +
          '<span class="tv-karta-tresc">' +
            '<span class="t-body" style="font-weight:600;">' + esc(m.gospodarz) + " – " + esc(m.gosc) + "</span>" +
            '<span class="t-small t-nums muted">' + esc(formatujDate(m.data, m.godzina)) +
              " · " + esc(m.liga) + (m.kolejka ? " · " + esc(m.kolejka) + ". kolejka" : "") + "</span>" +
          "</span>" +
        "</div>");
    }).join("");
  }

  /** Player: IFrame API po kliknięciu (light — do tego momentu zero JS YT). */
  function zaladujPlayer(vid) {
    var kontener = scena.querySelector(".tv-player");
    if (!kontener) return;
    function wstaw() {
      kontener.innerHTML = '<div id="tv-yt"></div>';
      new YT.Player("tv-yt", {
        videoId: vid,
        host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: function (e) {
            // 0 = ENDED — transmisja zakończona: wróć do komunikatu
            if (e.data === YT.PlayerState.ENDED) renderBrak(null);
          },
        },
      });
    }
    if (window.YT && window.YT.Player) { wstaw(); return; }
    var stary = document.getElementById("tv-yt-api");
    if (!stary) {
      var s = document.createElement("script");
      s.id = "tv-yt-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    var czekaj = setInterval(function () {
      if (window.YT && window.YT.Player) { clearInterval(czekaj); wstaw(); }
    }, 150);
    setTimeout(function () { clearInterval(czekaj); }, 15000);
  }

  /* ---------- tryb demo (?tv-demo=…) ---------- */

  var DEMO = {
    LIVE: {
      videoId: "jfKfPfyJRdk", kanal: "Lofi Girl (demo)", tytul: "lofi hip hop radio — beats to relax/study to",
      url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", stan: "LIVE",
      mecz: "KTS Gliwice – Reprezentacja Galaxy (demo)", liga: "1LM", kolejka: "9",
      dataMeczu: "2026-11-17", dataTransmisji: "2026-11-17",
    },
    WKROTCE: {
      videoId: "21X5lGlDOfg", kanal: "Sky News (demo)", tytul: "Zapowiedziana transmisja meczu (demo)",
      url: "https://www.youtube.com/watch?v=21X5lGlDOfg", stan: "WKRÓTCE",
      mecz: "BKS Stal Bielsko-Biała – KTS Gliwice", liga: "1LM", kolejka: "8",
      dataMeczu: "2026-11-27", dataTransmisji: "",
    },
    VOD: [
      { videoId: "jfKfPfyJRdk", kanal: "Lofi Girl (demo)", tytul: "Pełne nagranie meczu (demo 1)",
        url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", stan: "VOD",
        mecz: "KTS Gliwice – MKS Czechowice-Dziedzice", liga: "2LM", kolejka: "9",
        dataMeczu: "2026-11-20", dataTransmisji: "2026-11-20" },
      { videoId: "21X5lGlDOfg", kanal: "Sky News (demo)", tytul: "Pełne nagranie meczu (demo 2)",
        url: "https://www.youtube.com/watch?v=21X5lGlDOfg", stan: "ZAKOŃCZONA",
        mecz: "KTS VI Gliwice – LKS Strażak III Mikołów", liga: "4LM", kolejka: "7",
        dataMeczu: "2026-11-18", dataTransmisji: "2026-11-18" },
    ],
  };

  function jestDemo() {
    var m = /[?&]tv-demo=(LIVE|WKROTCE|VOD)/.exec(location.search);
    return m ? m[1] : null;
  }

  function renderDemo(typ) {
    pokazStatus("TRYB DEMO — dane przykładowe, arkusz nieczytany", "text-primary");
    var wstazka = '<div class="tv-demo-wstazka">DEMO — dane testowe</div>';
    scena.insertAdjacentHTML("beforebegin", wstazka);
    if (typ === "VOD") {
      renderBrak({ mecze: [] });
      renderArchiwum(DEMO.VOD);
    } else {
      (typ === "LIVE" ? renderLive : renderWkrotce)(DEMO[typ]);
      renderArchiwum(DEMO.VOD);
    }
    zglos.hidden = true; // w demie nie kierujemy na formularz
  }

  /* ---------- start ---------- */

  function init() {
    scena = document.getElementById("tv-scena");
    meta = document.getElementById("tv-meta");
    statusEl = document.getElementById("tv-status");
    archiwum = document.getElementById("tv-archiwum");
    archiwumLista = document.getElementById("tv-archiwum-lista");
    archiwumCount = document.getElementById("tv-archiwum-count");
    mecze = document.getElementById("tv-mecze");
    meczeLista = document.getElementById("tv-mecze-lista");
    meczeCount = document.getElementById("tv-mecze-count");
    zglos = document.getElementById("tv-zglos");
    zglosLink = document.getElementById("tv-zglos-link");

    var demo = jestDemo();
    if (demo) { renderDemo(demo); return; }

    // --- warstwa 1: tv.json ---
    fetch("tv.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (dane) {
        if (zglosLink && dane.formularz) {
          zglosLink.href = dane.formularz;
          zglos.hidden = false;
        }
        var s = stanTransmisji(dane.transmisje || []);
        if (s.tryb === "LIVE") { renderLive(s.transmisja); pokazStatus("🔴 NA ŻYWO TERAZ"); }
        else if (s.tryb === "WKROTCE") { renderWkrotce(s.transmisja); pokazStatus("Transmisja zapowiedziana"); }
        else { renderBrak(dane); pokazStatus("Brak transmisji — aktualizacja " + (dane.aktualizacja || "?").slice(0, 16).replace("T", " ") + " UTC"); }
        renderArchiwum(dane.transmisje || []);
        // --- warstwa 2: gviz na żywo (CORS zweryfikowany) ---
        odswiezGviz();
      })
      .catch(function () {
        renderBrak(null);
        pokazStatus("Nie udało się pobrać danych transmisji — odśwież stronę", "text-primary");
      });
  }

  /** Warstwa 2: co 90 s próbuje gviz; sukces → nadpisuje scenę. */
  function odswiezGviz() {
    fetch(PUB_TV + "&_cb=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (csv) {
        var tr = gvizNaTransmisje(csv);
        var s = stanTransmisji(tr);
        if (s.tryb === "LIVE") { renderLive(s.transmisja); pokazStatus("🔴 NA ŻYWO TERAZ"); }
        else if (s.tryb === "WKROTCE") { renderWkrotce(s.transmisja); pokazStatus("Transmisja zapowiedziana"); }
        // BRAK w gviz, gdy tv.json miał LIVE → zostaje player (stream mógł
        // się skończyć w międzyczasie; IFrame API sam zamknie scenę na ENDED)
        renderArchiwum(tr);
      })
      .catch(function () { /* adblock/CORS/awaria — tv.json dalej obowiązuje */ });
    setTimeout(odswiezGviz, CO_ILE_S * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
