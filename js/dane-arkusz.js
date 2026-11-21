/* ============================================================
   KTS Gliwice — DANE-Z-ARKUSZA (1.38.0)

   Źródło danych ligowych: ARKUSZ MOSTU czytany bezpośrednio w
   przeglądarce (gviz). Architektura najprostsza jaka możliwa
   (decyzja właściciela 21.11): most pisze do arkusza Google →
   gość otwiera stronę → strona czyta arkusz. Koniec z pośrednim
   dane.json, tokenami i cronem ligowym — repo niesie już tylko
   samą stronę.

   Jak to działa:
   · pełne pobranie = 8 zakładek gviz (Puls + 7 z danymi);
   · Puls jest STRAŻNIKIEM: gdy „Ostatnie tyknięcie Zarządcy” się
     nie zmieniło i pełne pobranie było < 10 min temu, dalsze
     zakładki nie są w ogóle czytane (1 małe zapytanie);
   · wynik ma DOKŁADNIE ten kształt, co dawny dane.json (port
     zbudujDane_ z mostu — udowodniony testem bajt-w-bajt), więc
     app.js/druzyna.js renderują bez żadnych zmian;
   · fallback: gdy arkusz nie odpowiada, ściągany jest stary
     dane.json z repo (ostatnia dobra kopia) — strona nie gaśnie;
   · API: DaneArkusz.pobierz() → Promise<{dane, sig, zrodlo} | null>
     sig = sygnatura treści bez znaczników czasu (dla pętli
     świeżości app.js: identyczna sygnatura = cisza, jak dawniej
     porównanie surowego tekstu dane.json).

   Samowystarczalny moduł, zero zależności od app.js (wzorzec
   js/sponsorzy.js). gviz odbiega nagłówek Access-Control-Allow-Origin
   pasujący do Origin wołającego — fetch z tmjwk.github.io przechodzi.
   ============================================================ */
"use strict";

(function () {
  if (window.DaneArkusz) return; // podwójne podpięcie — nic nie robić

  var MOST_ID = "1NQw7O2onyTsEo7DS_TCnmX8veS6rTafygCGwmNQ9Q0s";
  var GVIZ = "https://docs.google.com/spreadsheets/d/" + MOST_ID + "/gviz/tq";
  var FALLBACK = "dane.json"; // stara kopia w repo — tylko gdy arkusz padnie

  var SEZON = "2026/27";
  var PZTS_LIGA = "1. Liga Mężczyzn · gr. południowa";
  var URL_PZTS_DRUZYNA = "https://pzts.pl/rozgrywki-ligowe/druzyna/960/";

  var ZESPOLY = [
    { nazwa: "KTS Gliwice I", liga: PZTS_LIGA, tryb: "PZTS · automat", url: URL_PZTS_DRUZYNA, ligaKlucz: "pzts/1lm" },
    { nazwa: "KTS II", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
    { nazwa: "KTS III", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
    { nazwa: "KTS IV", liga: "3. Liga Mężczyzn · gr. II", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/138/", ligaKlucz: "18/138" },
    { nazwa: "KTS V", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
    { nazwa: "KTS VI", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
    { nazwa: "KA Krokus VII", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
    { nazwa: "KTS Gliwice · amatorzy", liga: "2. Śląska Liga Amatorów", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/144/", ligaKlucz: "18/144" },
  ];
  var SKROT_NA_KLUCZ = { "2LM": "18/136", "3LM": "18/138", "4LM": "18/142", "2SLA": "18/144" };
  var LIGI = [
    { skrot: "2LM", nazwa: "2. Liga Mężczyzn", arkusz: "Liga 2LM" },
    { skrot: "3LM", nazwa: "3. Liga Mężczyzn · gr. II", arkusz: "Liga 3LM" },
    { skrot: "4LM", nazwa: "4. Liga Mężczyzn · gr. IV", arkusz: "Liga 4LM" },
    { skrot: "2SLA", nazwa: "2. Śląska Liga Amatorów", arkusz: "Liga 2SLA" },
  ];

  /* cache pełnego pobrania: {dane, sig, tyk, kiedy} */
  var CACHE = null;
  var W_TOKU = null; // jedna próba naraz (kolejne wołania dzielą wynik)

  /* ====== gviz: CSV z cudzysłowami (ten sam parser co w warsztacie) ====== */
  function parseCsv(tekst) {
    var wiersze = [], w = [], kom = "", wCudz = false;
    for (var i = 0; i < tekst.length; i++) {
      var c = tekst[i];
      if (wCudz) {
        if (c === '"') {
          if (tekst[i + 1] === '"') { kom += '"'; i++; } else wCudz = false;
        } else kom += c;
      } else if (c === '"') wCudz = true;
      else if (c === ",") { w.push(kom); kom = ""; }
      else if (c === "\n") { w.push(kom); wiersze.push(w); w = []; kom = ""; }
      else if (c !== "\r") kom += c;
    }
    if (kom.length > 0 || w.length > 0) { w.push(kom); wiersze.push(w); }
    return wiersze;
  }

  function gviz(zakladka) {
    var url = GVIZ + "?tqx=out:csv&headers=0&sheet=" + encodeURIComponent(zakladka) + "&_cb=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " (" + zakladka + ")"); return r.text(); })
      .then(parseCsv);
  }

  /* ====== czytniki zakładek — 1:1 z czytajTabele_/czytajTerminarz_ mostu ====== */
  function czytajTabele(wart) {
    var wiersze = [], sekcja = 0;
    for (var i = 0; i < wart.length; i++) {
      var r = wart[i], a = String(r[0] || "").trim();
      if (sekcja === 0) { if (a === "TABELA LIGOWA") sekcja = 1; continue; }
      if (a === "TERMINARZ") break;
      if (a === "Pozycja") continue;
      if (!/^\d+\.$/.test(a)) continue;
      var nazwa = String(r[1] || "").trim();
      if (!nazwa) break;
      wiersze.push({ pozycja: parseInt(a, 10), nazwa: nazwa, mecze: String(r[2] || "").trim(), punkty: String(r[3] || "").trim(), stosunek: String(r[4] || "").trim() });
    }
    return wiersze;
  }

  function czytajTerminarz(wart) {
    var i = 0;
    for (; i < wart.length; i++) if (String(wart[i][0]).trim() === "TERMINARZ") break;
    if (i >= wart.length) return [];
    var mecze = [];
    for (var j = i + 2; j < wart.length; j++) {
      var data = String(wart[j][0] || "").trim();
      if (!data) break;
      var gospodarz = String(wart[j][3] || "").trim();
      var gosc = String(wart[j][4] || "").trim();
      if (!gospodarz || !gosc) break;
      var wynik = String(wart[j][5] || "").trim();
      var kol = parseInt(String(wart[j][2] || "").trim(), 10);
      mecze.push({ dataMeczu: data, godzina: String(wart[j][1] || "").trim(), kolejka: isNaN(kol) ? null : kol, gospodarz: gospodarz, gosc: gosc, wynik: wynik, rozegrany: /^\d+\s*:\s*\d+$/.test(wynik) });
    }
    return mecze;
  }

  /* ====== Puls: strażnik świeżości (tyknięcie + wersja mostu) ======
     Zwraca {tyk: "2026-11-21T05:42:51+01:00", wersja: "1.7.5"} lub null.
     Arkusz mostu żyje w strefie Warszawy; tyknięcie zamieniamy na ISO
     z offsetem wg miesiąca (X–III = +01:00, IV–IX = +02:00) — wystarcza
     do wyświetlenia „Ostatni sync” w stopce. */
  function czytajPuls(wiersze) {
    var tykRaw = null, wersja = null;
    for (var i = 0; i < wiersze.length; i++) {
      var etykieta = String((wiersze[i] || [])[0] || "").trim();
      var wartosc = String((wiersze[i] || [])[1] || "").trim();
      if (etykieta.indexOf("Ostatnie tyknięcie") === 0 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(wartosc)) tykRaw = wartosc;
      if (etykieta.indexOf("Wersja mostu") === 0 && wartosc) wersja = wartosc;
    }
    if (!tykRaw) return null;
    var mm = parseInt(tykRaw.slice(5, 7), 10);
    var offset = (mm >= 4 && mm <= 9) ? "+02:00" : "+01:00";
    return { tyk: tykRaw.replace(" ", "T") + offset, wersja: wersja };
  }

  /* ====== budowa obiektu „dane” — port zbudujDane_ z mostu ====== */
  function zbudujDane(teraz, stareDane, Gv) {
    var rejestr = Gv.druzyny.map(function (r) { return { karta: r[0], szts: r[1], liga: r[2], skrot: r[3], stan: r[4], urlDruzyny: r[5], urlLigi: r[6] }; });
    var zawodnicy = {};
    Gv.zawodnicy.forEach(function (r) {
      var karta = String(r[0] || "").trim(), nazwisko = String(r[1] || "").trim();
      if (!karta || !nazwisko) return;
      var licencja = String(r[2] || "").trim();
      var rok = parseInt(String(r[4] == null ? "" : r[4]).trim(), 10);
      var zw = parseInt(String(r[5] || "").trim(), 10);
      var po = parseInt(String(r[6] || "").trim(), 10);
      var punkty = String(r[7] || "").trim(), skut = String(r[8] || "").trim();
      var z = {
        nazwisko: nazwisko,
        licencja: /^\d{3,6}$/.test(licencja) ? licencja : null,
        narodowosc: String(r[3] || "").trim() || null,
        rok: (!isNaN(rok) && rok >= 1900 && rok <= 2100) ? rok : null,
        zwyciestwa: isNaN(zw) ? null : zw,
        porazki: isNaN(po) ? null : po,
        punkty: /^\d+\s*:\s*\d+$/.test(punkty) ? punkty.replace(/\s/g, "") : null,
        skutecznosc: /^(\d+)\s*%$/.test(skut) ? skut.replace(/\s/g, "") : null,
      };
      (zawodnicy[karta] = zawodnicy[karta] || []).push(z);
    });

    var stareSklady = {};
    if (stareDane && stareDane.sklady) stareDane.sklady.forEach(function (s) { stareSklady[s.zespol] = s; });

    var kartaPoSkrocie = {}, urlDruzynyPoKarcie = {};
    rejestr.forEach(function (r) {
      (kartaPoSkrocie[r.skrot] = kartaPoSkrocie[r.skrot] || {})[r.szts] = r.karta;
      urlDruzynyPoKarcie[r.karta] = r.urlDruzyny;
    });
    var kolejnoscKart = {};
    ZESPOLY.forEach(function (z, i) { kolejnoscKart[z.nazwa] = i; });

    var nazwaLigiPoKluczu = {}, tabele = [], stany = {}, wierszeNasze = {};
    LIGI.forEach(function (liga) {
      var klucz = SKROT_NA_KLUCZ[liga.skrot];
      if (!klucz) return;
      nazwaLigiPoKluczu[klucz] = liga.nazwa;
      var t = czytajTabele(Gv.ligi[liga.skrot]);
      tabele.push({ klucz: klucz, nazwa: liga.nazwa, wiersze: t.map(function (w) { return { pozycja: w.pozycja, nazwa: w.nazwa, mecze: parseInt(w.mecze, 10) || 0, punkty: parseInt(w.punkty, 10) || 0, stosunek: w.stosunek }; }), zaktualizowano: teraz });
    });

    var meczeSzts = [];
    Gv.mecze.forEach(function (mk) {
      var skrot = String(mk[2] || "").trim();
      var kluczM = SKROT_NA_KLUCZ[skrot];
      if (!kluczM) return;
      var nasi = String(mk[8] || "").split(" + ");
      var zespolyMeczu = [];
      nasi.forEach(function (nRaw) {
        var n = String(nRaw || "").trim();
        if (n) zespolyMeczu.push((kartaPoSkrocie[skrot] && kartaPoSkrocie[skrot][n]) || n);
      });
      zespolyMeczu.sort(function (a, b) { return ((kolejnoscKart[a] != null ? kolejnoscKart[a] : 99) - (kolejnoscKart[b] != null ? kolejnoscKart[b] : 99)); });
      var kolM = parseInt(String(mk[3] || "").trim(), 10);
      var godzM = String(mk[1] || "").trim();
      meczeSzts.push({
        dataMeczu: String(mk[0] || "").trim().slice(0, 10), godzina: godzM || null, kolejka: isNaN(kolM) ? null : kolM,
        gospodarz: String(mk[4] || "").trim(), gosc: String(mk[5] || "").trim(),
        wynik: String(mk[6] || "").trim(), rozegrany: String(mk[7] || "").trim() === "tak",
        liga: nazwaLigiPoKluczu[kluczM] || skrot, zespoly: zespolyMeczu,
      });
    });

    var termP = czytajTerminarz(Gv.pzts);
    var meczePzts = [];
    termP.forEach(function (mp) {
      if (mp.gospodarz.indexOf("KTS Gliwice") === -1 && mp.gosc.indexOf("KTS Gliwice") === -1) return;
      meczePzts.push({ dataMeczu: mp.dataMeczu, godzina: mp.godzina || null, kolejka: mp.kolejka, gospodarz: mp.gospodarz, gosc: mp.gosc, wynik: mp.wynik, rozegrany: mp.rozegrany, liga: PZTS_LIGA, zespol: "KTS Gliwice I" });
    });
    var tabP = { wiersze: [], stan: null, wierszNasz: null };
    for (var ip = 0; ip < Gv.pzts.length; ip++) {
      var rp = Gv.pzts[ip], a = String(rp[0] || "").trim();
      if (a === "TERMINARZ") break;
      if (!/^\d+\.$/.test(a)) continue;
      var nazwaP = String(rp[1] || "").trim();
      if (!nazwaP) continue;
      var poz = parseInt(a, 10), pkt = parseInt(String(rp[3] || "").trim(), 10);
      tabP.wiersze.push({ pozycja: poz, nazwa: nazwaP, mecze: parseInt(String(rp[2] || "").trim(), 10) || 0, punkty: isNaN(pkt) ? 0 : pkt, stosunek: String(rp[4] || "").trim() });
      if (nazwaP.indexOf("KTS Gliwice") !== -1) { tabP.stan = poz + ". miejsce · " + (isNaN(pkt) ? "?" : pkt) + " pkt"; tabP.wierszNasz = nazwaP; }
    }
    if (tabP.wiersze.length > 0) tabele.push({ klucz: "pzts/1lm", nazwa: PZTS_LIGA, wiersze: tabP.wiersze, zaktualizowano: teraz, kolumna4: "Z–R–P" });

    var sklady = [];
    ZESPOLY.forEach(function (zz) {
      var czyPzts = zz.ligaKlucz === "pzts/1lm";
      var url = czyPzts ? URL_PZTS_DRUZYNA : (urlDruzynyPoKarcie[zz.nazwa] || "");
      var lista = zawodnicy[zz.nazwa];
      if (!lista || lista.length === 0) { if (stareSklady[zz.nazwa]) sklady.push(stareSklady[zz.nazwa]); return; }
      var staryS = stareSklady[zz.nazwa];
      if (staryS && staryS.zrodlo === url && JSON.stringify(staryS.zawodnicy) === JSON.stringify(lista)) sklady.push(staryS);
      else sklady.push({ zespol: zz.nazwa, zrodlo: url, zaktualizowano: teraz, zawodnicy: lista });
    });

    rejestr.forEach(function (r) { if (SKROT_NA_KLUCZ[r.skrot]) { stany[r.karta] = r.stan || "—"; wierszeNasze[r.karta] = r.szts; } });
    var zespoly = ZESPOLY.map(function (z3) {
      return {
        nazwa: z3.nazwa, liga: z3.liga, tryb: z3.tryb,
        stan: z3.nazwa === "KTS Gliwice I" ? (tabP.stan || "—") : (stany[z3.nazwa] || "—"),
        url: z3.url, tabela: z3.ligaKlucz,
        wiersz: z3.nazwa === "KTS Gliwice I" ? tabP.wierszNasz : (wierszeNasze[z3.nazwa] || null),
      };
    });

    return { wygenerowano: teraz, sezon: SEZON, zespoly: zespoly, tabele: tabele, meczeSzts: meczeSzts, meczePzts: meczePzts, sklady: sklady, ostatniSync: { szts: teraz, pzts: teraz }, zrodla: { szts: "ok", pzts: "ok" } };
  }

  /* Sygnatura treści bez znaczników czasu — punkt porównania pętli
     świeżości app.js (odpowiednik dawnego „identyczny tekst dane.json”). */
  function sygnatura(dane) {
    var czysty = {
      sezon: dane.sezon, zespoly: dane.zespoly,
      tabele: (dane.tabele || []).map(function (t) { return { klucz: t.klucz, nazwa: t.nazwa, wiersze: t.wiersze, kolumna4: t.kolumna4 || null }; }),
      meczeSzts: dane.meczeSzts, meczePzts: dane.meczePzts, sklady: dane.sklady,
    };
    return JSON.stringify(czysty);
  }

  /* ====== pełne pobranie z arkusza ======
     teraz = znacznik czasu danych: tyknięcie mostu z Puls (prawdziwy
     moment ostatniego syncu lig — trafia do stopki „Ostatni sync"),
     a gdy Puls nieuchwytny, czas przeglądarki. */
  function pelne(stareDane, teraz) {
    return Promise.all([
      gviz("Liga 2LM"), gviz("Liga 3LM"), gviz("Liga 4LM"), gviz("Liga 2SLA"),
      gviz("PZTS 1LM"), gviz("Drużyny"), gviz("Zawodnicy"), gviz("Mecze KTS"),
    ]).then(function (w) {
      var mk = w[7].filter(function (r) { return /^\d{4}-\d{2}-\d{2}/.test(String(r[0] || "").trim()); });
      var Gv = {
        ligi: { "2LM": w[0], "3LM": w[1], "4LM": w[2], "2SLA": w[3] },
        pzts: w[4],
        druzyny: w[5].filter(function (r) { return r[0] !== "Karta (strona)"; }),
        zawodnicy: w[6].filter(function (r) { return r[0] !== "Drużyna"; }),
        mecze: mk,
      };
      var dane = zbudujDane(teraz, stareDane, Gv);
      return { dane: dane, sig: sygnatura(dane) };
    });
  }

  /* Fallback: stary dane.json z repo (arkusz nie odpowiada).
     Zwraca ten sam kształt {dane, sig} — bez prefiksu źródła, żeby
     przejście arkusz↔fallback przy niezmienionej treści było ciche. */
  function fallback() {
    return fetch(FALLBACK, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (dane) { return { dane: dane, sig: sygnatura(dane) }; });
  }

  /* ====== API ======
     pobierz() → Promise<{dane, sig, zrodlo: "arkusz"|"fallback"} | null>
     · najpierw Puls (mały): gdy tyknięcie bez zmian i pełne pobranie
       < 10 min temu → cache, zero dalszych zapytań;
     · każda awaria → stary dane.json; totalna awaria → null (app.js
       pokaże komunikat i spróbuje w następnym takcie). */
  function pobierz() {
    if (W_TOKU) return W_TOKU;
    W_TOKU = gviz("Puls")
      .then(function (wiersze) {
        var puls = czytajPuls(wiersze);
        var terazMs = Date.now();
        if (CACHE && puls && CACHE.tyk === puls.tyk && (terazMs - CACHE.kiedy) < 10 * 60 * 1000) {
          return { dane: CACHE.dane, sig: CACHE.sig, zrodlo: "arkusz" };
        }
        var teraz = (puls && puls.tyk) || new Date().toISOString();
        return pelne(CACHE ? CACHE.dane : null, teraz)
          .then(function (wynik) {
            CACHE = { dane: wynik.dane, sig: wynik.sig, tyk: puls ? puls.tyk : null, kiedy: terazMs };
            return { dane: wynik.dane, sig: wynik.sig, zrodlo: "arkusz" };
          });
      })
      .catch(function (e) {
        console.warn("DaneArkusz: arkusz mostu nie odpowiada (" + (e && e.message ? e.message : e) + ") — fallback na dane.json");
        return fallback();
      })
      .catch(function (e) {
        console.warn("DaneArkusz: fallback też padł:", e);
        return null;
      })
      .then(function (wynik) { W_TOKU = null; return wynik; });
    return W_TOKU;
  }

  window.DaneArkusz = { pobierz: pobierz };
})();
