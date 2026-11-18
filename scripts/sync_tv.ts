/**
 * sync_tv.ts — KTS TV: arkusz „KTS TV” → tv.json dla strony statycznej.
 *
 * KANAŁ ODCZYTU (zamknięcie arkusza, 2026-11-18):
 *   WYŁĄCZNIE WERSJA OPUBLIKOWANA (pub) — wszystkie 3 zakładki:
 *     · TV_Transmisje  (gid 191595212) → transmisje
 *     · TV_Mecze       (gid 994938779) → najbliższe mecze (kontekst)
 *     · TV_Ustawienia  (gid 114494092) → formularz_url
 *   Publikacja zweryfikowana: dokładnie te 3 zakładki, zero danych
 *   osobowych, zero kluczy API (klucz YouTube siedzi w Script Properties,
 *   których publikacja NIE obejmuje). Surowe ID arkusza zostało USUNIĘTE
 *   z kodu — kanał gviz porzucony, więc arkusz można (i należy) zamknąć:
 *   udostępnianie „każdy z linkiem” → wyłączone. Publikacja działa
 *   niezależnie od ustawień udostępniania (również przy arkuszu prywatnym).
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

// Wersja opublikowana „KTS TV” — JEDYNY kanał odczytu (publikacja działa
// niezależnie od udostępniania arkusza; przy NOWEJ publikacji URL i gid-y
// się zmieniają — wtedy zaktualizować). Zakładki w publikacji (zweryfikowane
// 2026-11-18, pubhtml): Transmisje 191595212 · Ustawienia 114494092 ·
// Mecze 994938779. NIE DODAWAĆ zakładek z danymi osobowymi (Zgłoszenia,
// Zgłaszający, Log) — publikacja ich nigdy nie obejmuje.
const PUB_TV = "https://docs.google.com/spreadsheets/d/e/" +
  "2PACX-1vShni3KQFw-viXRvO_qoTGKX4_2OUxJzs4DZrVYchM2P71d7ynhxuAjQQgj8Ho0123G4C5bpoJrF4lI/pub";
const GID_TRANSMISJE = "191595212";
const GID_MECZE = "994938779";
const GID_USTAWIENIA = "114494092";
const WYJSCIE = process.env.TV_WYJSCIE ?? "tv.json";
const UA = "KTS-Gliwice-TV-Sync/1.0 (+strona: tmjwk.github.io)";

/** Pobierz zakładkę z wersji opublikowanej jako macierz CSV. */
async function pubArkusz(gid: string, nazwa: string): Promise<string[][]> {
  const res = await fetch(`${PUB_TV}?gid=${gid}&single=true&output=csv&_cb=${Date.now()}`, {
    headers: { "User-Agent": UA }, redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`pub ${nazwa} (gid ${gid}): HTTP ${res.status}`);
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
  // --- TV_Transmisje (serce tv.json) — wersja opublikowana ---
  const tr = await pubArkusz(GID_TRANSMISJE, "TV_Transmisje");
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
  // pub — odporny na ukrycie zakładek i na wyłączenie udostępniania.
  let mecze: Mecz[] = [];
  let zrodloMeczy = "arkusz KTS TV · zakładka TV_Mecze · wersja opublikowana (pub)";
  const stary = existsSync(WYJSCIE)
    ? (() => { try { return JSON.parse(readFileSync(WYJSCIE, "utf8")); } catch { return null; } })()
    : null;
  try {
    const me = await pubArkusz(GID_MECZE, "TV_Mecze");
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
    // chwilowa awaria pub dla tej zakładki — trzymaj ostatni znany stan
    if (stary?.mecze && Array.isArray(stary.mecze)) {
      mecze = stary.mecze as Mecz[];
      zrodloMeczy = "tv.json (ostatni znany stan — zakładka niedostępna)";
    }
    console.warn(`sync_tv: TV_Mecze pominięte (${e instanceof Error ? e.message : e})`);
  }

  // --- TV_Ustawienia: wyłącznie formularz_url (publiczny link do zgłoszeń) ---
  // pub — jak wyżej: odporny na ukrycie i na zamknięcie arkusza.
  let formularz = "https://docs.google.com/forms/d/e/1FAIpQLSf94l-9wYjL3ptLZ4JSxLtIrvUCFKz9LfuGch0Cf0n-IDWy3A/viewform";
  if (stary?.formularz) formularz = String(stary.formularz);
  try {
    const us = await pubArkusz(GID_USTAWIENIA, "TV_Ustawienia");
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
    zrodlo: "arkusz KTS TV · 3 zakładki (Transmisje/Mecze/Ustawienia) · wersja opublikowana (pub)",
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
