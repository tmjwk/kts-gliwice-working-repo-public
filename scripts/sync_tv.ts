/**
 * sync_tv.ts — KTS TV: arkusz „KTS TV” → tv.json dla strony statycznej.
 *
 * KANAŁY ODCZYTU (1.35.1 — prywatność):
 *   · TV_Transmisje → WERSJA OPUBLIKOWANA (pub?gid=191595212). Publikacja
 *     obejmuje wyłącznie tę zakładkę (reszta nigdy nie jest częścią pub),
 *     a ukrycie zakładek w arkuszu NIE zrywa pub — pub ignoruje ukrywanie.
 *     To jedyny kanał, którego strona NIGDY nie straci przez decyzję
 *     właściciela o ukryciu zakładek.
 *   · TV_Mecze / TV_Ustawienia → nadal surowy gviz (potrzebne kontekstu
 *     „najbliższe mecze” i URL formularza). ZOSTAWIĆ WIDOCZNE w arkuszu.
 *     Gdyby właściciel je ukrył: gviz zwróci 404 → ten sync łagodnie
 *     pomija (mecze = ostatni znany stan z tv.json, formularz = fallback),
 *     run NIE czerwienieje — strona żyje dalej.
 * Zakładki TV_Zgłoszenia / TV_Zgłaszający / TV_Log zawierają dane
 * osobowe i NIE są czytane z żadnego kanału (RODO).
 *
 * Zapis: tv.json TYLKO przy realnej zmianie treści (porównanie stringify) —
 * puste przebiegi nie commitują, zero szumu w historii repo.
 *
 * Uruchomienie (lokalny test):  bun scripts/sync_tv.ts
 * Uruchomienie (Actions):       .github/workflows/tv-sync.yml
 *
 * Awaria pub (HTTP != 200): process exit 1, tv.json zostaje ostatni
 * znany stan — strona trzyma dane, run czerwienieje (widoczne w badge).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ARKUSZ_TV = "1rY47XRc41XO-hUoLW91JgoOALDr-5ywXSahEkgI-oBI";
const GVIZ = `https://docs.google.com/spreadsheets/d/${ARKUSZ_TV}/gviz/tq?tqx=out:csv&headers=0`;
// Wersja opublikowana „KTS TV” → zakładka TV_Transmisje (gid z pubhtml;
// przy NOWEJ publikacji arkusza URL się zmienia — zaktualizować).
const PUB_TRANSMISJE = "https://docs.google.com/spreadsheets/d/e/" +
  "2PACX-1vShni3KQFw-viXRvO_qoTGKX4_2OUxJzs4DZrVYchM2P71d7ynhxuAjQQgj8Ho0123G4C5bpoJrF4lI" +
  "/pub?gid=191595212&single=true&output=csv";
const WYJSCIE = process.env.TV_WYJSCIE ?? "tv.json";
const UA = "KTS-Gliwice-TV-Sync/1.0 (+strona: tmjwk.github.io)";

/** Pobierz zakładkę jako macierz CSV (parsowanie w cudzysłowach, jak most). */
async function gvizArkusz(nazwa: string): Promise<string[][]> {
  const url = `${GVIZ}&sheet=${encodeURIComponent(nazwa)}&_cb=${Date.now()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`gviz ${nazwa}: HTTP ${res.status}`);
  }
  const tekst = await res.text();
  return parsujCsv(tekst.replace(/^\uFEFF/, ""));
}

/** Pobierz wersję opublikowaną (CSV z przekierowaniem 307). */
async function pubArkusz(): Promise<string[][]> {
  const res = await fetch(`${PUB_TRANSMISJE}&_cb=${Date.now()}`, {
    headers: { "User-Agent": UA }, redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`pub TV_Transmisje: HTTP ${res.status}`);
  }
  const tekst = await res.text();
  return parsujCsv(tekst.replace(/^\uFEFF/, ""));
}

/** Mini-parser CSV (pola w cudzysłowach, przecinki w polach, "" = cytat). */
function parsujCsv(tekst: string): string[][] {
  const wiersze: string[][] = [];
  let pole = "";
  let wiersz: string[] = [];
  let wCudz = false;
  for (let i = 0; i < tekst.length; i++) {
    const zn = tekst[i];
    if (wCudz) {
      if (zn === '"') {
        if (tekst[i + 1] === '"') { pole += '"'; i++; }
        else wCudz = false;
      } else pole += zn;
    } else if (zn === '"') wCudz = true;
    else if (zn === ",") { wiersz.push(pole); pole = ""; }
    else if (zn === "\n") { wiersz.push(pole); wiersze.push(wiersz); pole = ""; wiersz = []; }
    else if (zn !== "\r") pole += zn;
  }
  if (pole !== "" || wiersz.length) { wiersz.push(pole); wiersze.push(wiersz); }
  return wiersze.filter((w) => w.length > 1 || (w[0] ?? "") !== "");
}

/** Mapa nagłówek → indeks kolumny (odporny na zmianę kolejności kolumn). */
function indeksy(naglowek: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  naglowek.forEach((n, i) => { mapa[n.trim()] = i; });
  return mapa;

}

interface Transmisja {
  videoId: string;
  kanal: string;
  tytul: string;
  url: string;
  stan: string;
  mecz: string;
  liga: string;
  kolejka: string;
  dataMeczu: string;
  dataTransmisji: string;
  zaktualizowano: string;
}

interface Mecz {
  data: string;
  godzina: string;
  liga: string;
  kolejka: string;
  gospodarz: string;
  gosc: string;
}

async function main() {
  // --- TV_Transmisje (serce tv.json) — WERSJA OPUBLIKOWANA (1.35.1) ---
  const tr = await pubArkusz();
  const trIdx = indeksy(tr[0] ?? []);
  const transmisje: Transmisja[] = [];
  for (const w of tr.slice(1)) {
    const wez = (k: string) => (w[trIdx[k]] ?? "").trim();
    const videoId = wez("videoId");
    if (!videoId) continue; // puste wiersze / śmieci
    transmisje.push({
      videoId,
      kanal: wez("Kanał"),
      tytul: wez("Tytuł"),
      url: wez("URL") || `https://www.youtube.com/watch?v=${videoId}`,
      // normalizacja stanu na wielkie litery (arkusz pisze LIVE/WKRÓTCE/VOD/ZAKOŃCZONA)
      stan: (wez("Stan") || "VOD").toUpperCase(),
      mecz: wez("Mecz"),
      liga: wez("Liga"),
      kolejka: wez("Kolejka"),
      dataMeczu: wez("DataMeczu"),
      dataTransmisji: wez("DataTransmisji"),
      zaktualizowano: wez("Zaktualizowano"),
    });
  }

  // --- TV_Mecze (kontekst „najbliższe mecze” przy braku transmisji) ---
  // gviz — wymaga WIDOCZNEJ zakładki; gdy właściciel ją ukryje, łagodnie
  // pomijamy (mecze = ostatni znany stan z tv.json), bez czerwienienia runu.
  let mecze: Mecz[] = [];
  let zrodloMeczy = "arkusz (TV_Mecze)";
  const stary = existsSync(WYJSCIE)
    ? (() => { try { return JSON.parse(readFileSync(WYJSCIE, "utf8")); } catch { return null; } })()
    : null;
  try {
    const me = await gvizArkusz("TV_Mecze");
    const meIdx = indeksy(me[0] ?? []);
    const dzis = new Date().toISOString().slice(0, 10);
    for (const w of me.slice(1)) {
      const wez = (k: string) => (w[meIdx[k]] ?? "").trim();
      const data = wez("Data");
      if (!data) continue;
      // tylko mecze z dziś lub przyszłe — archiwum meczowe nie interesuje tv.json
      if (data < dzis) continue;
      if ((wez("Rozegrany") || "").toLowerCase() === "tak") continue;
      mecze.push({
        data,
        godzina: wez("Godzina"),
        liga: wez("Liga"),
        kolejka: wez("Kolejka"),
        gospodarz: wez("Gospodarz"),
        gosc: wez("Gość"),
      });
    }
    mecze.sort((a, b) => (a.data + a.godzina).localeCompare(b.data + b.godzina));
  } catch (e) {
    // ukryta zakładka / chwilowa awaria gviz — trzymaj ostatni znany stan
    if (stary?.mecze && Array.isArray(stary.mecze)) {
      mecze = stary.mecze as Mecz[];
      zrodloMeczy = "tv.json (ostatni znany stan — zakładka niedostępna)";
    }
    console.warn(`sync_tv: TV_Mecze pominięte (${e instanceof Error ? e.message : e})`);
  }

  // --- TV_Ustawienia: wyłącznie formularz_url (publiczny link do zgłoszeń) ---
  // gviz — jak wyżej: ukryte → fallback z poprzedniego tv.json (lub domyślny).
  let formularz = "https://docs.google.com/forms/d/e/1FAIpQLSf94l-9wYjL3ptLZ4JSxLtIrvUCFKz9LfuGch0Cf0n-IDWy3A/viewform";
  if (stary?.formularz) formularz = String(stary.formularz);
  try {
    const us = await gvizArkusz("TV_Ustawienia");
    const usIdx = indeksy(us[0] ?? []);
    for (const w of us.slice(1)) {
      if ((w[usIdx["Klucz"]] ?? "").trim() === "formularz_url") {
        const v = (w[usIdx["Wartość"]] ?? "").trim();
        if (v) formularz = v;
      }
    }
  } catch (e) {
    console.warn(`sync_tv: TV_Ustawienia pominięte (${e instanceof Error ? e.message : e}) — formularz z ostatniego stanu`);
  }

  // --- montaż tv.json ---
  const json = {
    aktualizacja: new Date().toISOString(),
    zrodlo: "arkusz KTS TV · zakładka TV_Transmisje · wersja opublikowana (pub)",
    zrodloMeczy,
    formularz,
    transmisje,
    mecze: mecze.slice(0, 5), // najbliższe 5 nierozegranych
    statystyka: {
      transmisji: transmisje.length,
      live: transmisje.filter((t) => t.stan === "LIVE").length,
      wkrotce: transmisje.filter((t) => t.stan === "WKRÓTCE").length,
      archiwum: transmisje.filter((t) => t.stan === "VOD" || t.stan === "ZAKOŃCZONA").length,
    },
  };

  // --- zapis TYLKO przy zmianie (porównanie bez pola aktualizacja) ---
  const istnieje = stary;
  const bezZnacznika = (o: typeof json) => JSON.stringify({ ...o, aktualizacja: "" });
  if (istnieje && bezZnacznika(istnieje) === bezZnacznika(json)) {
    console.log(`tv.json: bez zmian (${transmisje.length} transmisji, ${mecze.length} meczów) — nie zapisuję.`);
    return;
  }
  writeFileSync(WYJSCIE, JSON.stringify(json, null, 2) + "\n");
  console.log(`tv.json: ZAPISANY · transmisje: ${transmisje.length} ` +
    `(LIVE ${json.statystyka.live} · WKRÓTCE ${json.statystyka.wkrotce} · archiwum ${json.statystyka.archiwum}) · mecze: ${mecze.length}`);
}

main().catch((e) => {
  console.error("sync_tv: AWARIA —", e instanceof Error ? e.message : e);
  process.exit(1); // run czerwienieje; tv.json w repo zostaje ostatni znany stan
});
