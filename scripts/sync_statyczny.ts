/**
 * SAMODZIELNY skrypt synchronizacji dla hostingu statycznego (GitHub Actions).
 *
 * Nie wymaga bazy danych ani serwera — pobiera ligi ŚZTS z ligi.slzts.pl
 * i pisze plik dane.json, którego strona statyczna nie może zmieniać,
 * ale może natychmiast wczytywać z CDN.
 *
 * Źródła danych:
 *  - ŚZTS (ligi 2–4 + amatorzy): pełny automat — ten skrypt pobiera
 *    tabele i terminarze przy każdym uruchomieniu (cron Actions).
 *  - PZTS (1. liga, KTS Gliwice I): pzts.pl jest za Cloudflare — runner
 *    Actions nie odczyta go bezpośrednio. Kolejność prób (29.09.2026):
 *    a) zmienna PZTS_MECZE (JSON z wklejki ręcznej — najwyższy priorytet,
 *       backup gdyby czytnik zawiódł),
 *    b) czytnik r.jina.ai — publiczna usługa renderująca strony
 *       (headless browser) omijająca Cloudflare; parsujemy Markdown:
 *       terminarz + tabela 1. ligi gr. południowej (id=82),
 *    c) zachowanie ostatniego znanego stanu z poprzedniego dane.json.
 *
 * Uruchomienie:  bun scripts/sync_statyczny.ts
 *   (z katalogu głównego repo; wymaga bun albo: npx tsx scripts/sync_statyczny.ts)
 *
 * Od v1.5.2: KAŻDE uruchomienie (także puste, bez zmian danych) dopisuje
 * wpis do runs.json — dziennik przebiegów dla panelu na stronie:
 *   szts:"ok"    = dane odczytane (sukces, również „bez zmian"),
 *   szts:"blad"  = źródło nie odpowiedziało (szczegół w polu blad),
 *   brak wpisu  = slot crona nie wystartował (GitHub pominął termin).
 * runs.json trzyma ostatnie 50 przebiegów; workflow commituje go ZAWSZE
 * (świadoma zmiana zasady „pusty przebieg = brak commita" — historia
 * dane.json pozostaje czysta, commity runs.json to nowy, osobny szum).
 *
 * Nowy sezon: zaktualizuj ZESPOLY (i ewentualnie LIGI_SZTS w szts-core.ts).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  LIGI_SZTS,
  dopasujZespoly,
  meczeZespolu,
  parsujTabele,
  parsujTerminarz,
  pobierzHtml,
  type MeczLigi,
} from "./szts-core";

// ====== KONFIGURACJA SEZONU 2026/27 (edytuj przy nowym sezonie) ======
const SEZON = "2026/27";

// 1. Liga Mężczyzn gr. południowa — strona tabeli i terminarza na pzts.pl
const PZTS_LIGA_URL = "https://www.pzts.pl/rozgrywki-ligowe/liga/?id=82";
// Czytnik omijający Cloudflare (bez klucza API, format: Markdown)
const JINA_URL = `https://r.jina.ai/${PZTS_LIGA_URL}`;

const ZESPOLY = [
  { nazwa: "KTS Gliwice I", liga: "1. Liga Mężczyzn · gr. południowa", tryb: "PZTS · automat", url: "https://pzts.pl/rozgrywki-ligowe/druzyna/960/", ligaKlucz: null as string | null },
  { nazwa: "KTS II", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
  { nazwa: "KTS III", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
  { nazwa: "KTS IV", liga: "3. Liga Mężczyzn · gr. II", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/138/", ligaKlucz: "18/138" },
  { nazwa: "KTS V", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KTS VI", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KA Krokus VII", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KTS Gliwice · amatorzy", liga: "2. Śląska Liga Amatorów", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/144/", ligaKlucz: "18/144" },
];

const WYJSCIE = process.env.DANE_WYJSCIE ?? "dane.json";

// ====== Dziennik przebiegów (runs.json) — panel „Automat: ✓/✗" na stronie ======
const RUNY_WYJSCIE = process.env.RUNY_WYJSCIE ?? "runs.json";
const RUNY_LIMIT = 50;

type StanSzts = "ok" | "blad";
type StanPzts = "ok" | "recznie" | "blad-czytnika" | "pominieto";
interface WpisRunu {
  start: string; // ISO rozpoczęcia skryptu
  czasS: number; // czas trwania (sekundy) — miara „zamulania" źródeł
  szts: StanSzts;
  pzts: StanPzts;
  zmieniono: boolean; // czy dane.json został zapisany (realna zmiana danych)
  zmiany: string; // „bez zmian" / „+2 wyniki (ŚZTS)" / „—"
  blad: string | null; // treść błędu, gdy szts === "blad"
}

// ====== Typy danych wyjściowych (kontrakt dla strony statycznej) ======
interface MeczSzts extends MeczLigi {
  liga: string;
  zespoly: string[]; // nasze drużyny w meczu (derby → dwie)
}
interface MeczPzts extends MeczLigi {
  liga: string;
  zespol: string;
}
interface Dane {
  wygenerowano: string;
  sezon: string;
  zespoly: Array<{ nazwa: string; liga: string; tryb: string; stan: string; url: string }>;
  tabele: Array<{ klucz: string; nazwa: string; wiersze: unknown[]; zaktualizowano: string }>;
  meczeSzts: MeczSzts[];
  meczePzts: MeczPzts[];
  ostatniSync: { szts: string | null; pzts: string | null };
}

/** Polska odmiana liczebników (1 zwycięstwo, 2 zwycięstwa, 5 zwycięstw). */
function odmien(n: number, formy: [string, string, string]): string {
  if (n === 1) return formy[0];
  const r10 = n % 10;
  const r100 = n % 100;
  if (r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14)) return formy[1];
  return formy[2];
}

/** Bilans 1. drużyny z meczów PZTS („1 zwycięstwo · 1 remis”). */
function bilansPzts(mecze: MeczPzts[]): string {
  let w = 0;
  let r = 0;
  let p = 0;
  for (const m of mecze) {
    if (!m.rozegrany) continue;
    const naszGospodarz = m.gospodarz.includes("KTS"); // w 1. lidze jedyny „KTS" to my
    const [a, b] = m.wynik.split(":").map((x) => parseInt(x.trim(), 10));
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const my = naszGospodarz ? a : b;
    const rywal = naszGospodarz ? b : a;
    if (my > rywal) w++;
    else if (my === rywal) r++;
    else p++;
  }
  const czesci: string[] = [];
  if (w > 0) czesci.push(`${w} ${odmien(w, ["zwycięstwo", "zwycięstwa", "zwycięstw"])}`);
  if (r > 0) czesci.push(`${r} ${odmien(r, ["remis", "remisy", "remisów"])}`);
  if (p > 0) czesci.push(`${p} ${odmien(p, ["porażka", "porażki", "porażek"])}`);
  return czesci.join(" · ") || "—";
}

/* ============================================================
 * PZTS przez czytnik r.jina.ai (Markdown) — czysty parser,
 * testowalny na zapisanym pliku (jesteśmy offline-friendly).
 * Format potwierdzony inspekcją 29.09.2026 (liga id=82):
 *  - terminarz: | 2026-09-19 g. 16:00 | 503 1 | …[**GOSPODARZ**](url) | …[**GOŚĆ**](url) | **5:5** / -:- | [Szczegóły](…) |
 *  - tabela:    | 4. | …[**KTS Gliwice**](url) | 2 | 1 | 1 | 0 | 12:8 | **3** |
 * ============================================================ */

interface WierszTabeliPzts {
  pozycja: number;
  nazwa: string;
  mecze: number;
  zwyciestwa: number;
  remisy: number;
  porazki: number;
  pojedynki: string;
  punkty: number;
}

/** Ostatnia nazwa w **pogrubieniu** z komórki Markdown (np. „…[**KTS Gliwice**](url)”). */
function ostatniaPogrubiona(komorka: string): string | null {
  const trafienia = [...komorka.matchAll(/\*\*([^*]+)\*\*/g)];
  return trafienia.length > 0 ? trafienia[trafienia.length - 1][1].trim() : null;
}

/** Parser terminarza 1. ligi z Markdownu czytnika. */
export function parsujTerminarzPzts(md: string): Array<MeczLigi> {
  const mecze: Array<MeczLigi> = [];
  for (const linia of md.split("\n")) {
    if (!/^\| \d{4}-\d{2}-\d{2} g\. \d{2}:\d{2}/.test(linia.trim())) continue;
    const c = linia.split("|").map((x) => x.trim());
    // c: [", data, numer+kolejka, gospodarz, gość, wynik, szczegóły, ']
    if (c.length < 7) continue;
    const dm = c[1].match(/^(\d{4}-\d{2}-\d{2}) g\. (\d{2}:\d{2})/);
    if (!dm) continue;
    const gospodarz = ostatniaPogrubiona(c[3]);
    const gosc = ostatniaPogrubiona(c[4]);
    if (!gospodarz || !gosc) continue; // wiersz uszkodzony — pomijamy jawnie
    const wynikRaw = c[5].replace(/\*\*/g, "").trim();
    const rozegrany = /^\d+\s*:\s*\d+$/.test(wynikRaw);
    const kolejka = c[2].match(/(\d+)\s*$/);
    mecze.push({
      dataMeczu: dm[1],
      godzina: dm[2],
      kolejka: kolejka ? parseInt(kolejka[1], 10) : null,
      gospodarz,
      gosc,
      wynik: rozegrany ? wynikRaw.replace(/\s/g, "") : "-:-",
      rozegrany,
    });
  }
  return mecze;
}

/** Parser tabeli ligowej (stan: pozycja + punkty) z Markdownu czytnika. */
export function parsujTabelePzts(md: string): WierszTabeliPzts[] {
  const wiersze: WierszTabeliPzts[] = [];
  for (const linia of md.split("\n")) {
    if (!/^\| \d+\. /.test(linia.trim())) continue;
    const c = linia.split("|").map((x) => x.trim());
    if (c.length < 9) continue;
    const nazwa = ostatniaPogrubiona(c[2]);
    const pozycja = parseInt(c[1], 10);
    if (!nazwa || !Number.isFinite(pozycja)) continue;
    const liczba = (x: string): number => parseInt(x.replace(/\*/g, ""), 10);
    wiersze.push({
      pozycja,
      nazwa,
      mecze: liczba(c[3]),
      zwyciestwa: liczba(c[4]),
      remisy: liczba(c[5]),
      porazki: liczba(c[6]),
      pojedynki: c[7],
      punkty: liczba(c[8]),
    });
  }
  return wiersze;
}

/** Pobiera Markdown ligi przez czytnik (ponawia — darmowy limit bywa wąski).
 *  Opcjonalny klucz: sekret JINA_API_KEY w repo (Authorization: Bearer …)
 *  — zabezpieczenie na wypadek blokad anonimowego ruchu z IP runnera. */
async function pobierzPztsPrzezJine(proby = 3): Promise<string> {
  let ostatniBlad: unknown = null;
  const klucz = process.env.JINA_API_KEY?.trim();
  for (let i = 1; i <= proby; i++) {
    try {
      const res = await fetch(JINA_URL, {
        headers: {
          // KLUCZOWE (29.09.2026, testy A/B): bez „Accept: text/plain"
          // czytnik odrzuca zapytania anonimowe 401 „bad IP reputation";
          // z nim — 200 nawet z niestandardowym User-Agent.
          "Accept": "text/plain",
          "User-Agent": "KTS-Gliwice-Sync/1.0 (strona klubowa; tabela 1. ligi)",
          ...(klucz ? { Authorization: `Bearer ${klucz}` } : {}),
        },
        signal: AbortSignal.timeout(90_000),
      });
      // 429 = limit zapytań; 401 bywa nietrwałym odrzuceniem darmowego ruchu
      if (res.status === 429 || res.status === 401) {
        throw new Error(`czytnik odrzucił zapytanie (HTTP ${res.status}) — próba ${i}/${proby}`);
      }
      if (!res.ok) throw new Error(`czytnik HTTP ${res.status}`);
      const tekst = await res.text();
      if (tekst.length < 5000 || !tekst.includes("Liga")) throw new Error("czytnik zwrócił podejrzanie krótką odpowiedź");
      return tekst;
    } catch (err) {
      ostatniBlad = err;
      if (i < proby) await new Promise((r) => setTimeout(r, 10_000 * i)); // 10 s, 20 s
    }
  }
  throw ostatniBlad ?? new Error("czytnik: nieznany błąd");
}

/** Krótki, ludzki opis różnicy między dwoma stanami danych (do runs.json). */
function opiszZmiany(stary: Dane | null, nowy: Dane): string {
  if (!stary) return "pierwszy zapis";
  const klucz = (m: MeczLigi) => `${m.dataMeczu}|${m.gospodarz}|${m.gosc}`;
  const czesci: string[] = [];
  const raportMeczy = (nazwa: string, stare: MeczLigi[], nowe: MeczLigi[]) => {
    const stareMapa = new Map(stare.map((m) => [klucz(m), m]));
    let noweWyniki = 0;
    let poprawione = 0;
    let noweTerminy = 0;
    for (const m of nowe) {
      const st = stareMapa.get(klucz(m));
      if (!st) {
        noweTerminy++;
      } else if (m.rozegrany && !st.rozegrany) {
        noweWyniki++;
      } else if (m.rozegrany && st.rozegrany && m.wynik !== st.wynik) {
        poprawione++; // korekta błędnie wpisanego wyniku
      }
    }
    if (noweWyniki > 0) czesci.push(`+${noweWyniki} ${odmien(noweWyniki, ["wynik", "wyniki", "wyników"])} (${nazwa})`);
    if (poprawione > 0) czesci.push(`poprawione: ${poprawione} (${nazwa})`);
    if (noweTerminy > 0) czesci.push(`+${noweTerminy} w terminarzu (${nazwa})`);
  };
  raportMeczy("ŚZTS", stary.meczeSzts ?? [], nowy.meczeSzts);
  raportMeczy("PZTS", stary.meczePzts ?? [], nowy.meczePzts);
  const wierszeTabel = (t: Dane["tabele"]) => JSON.stringify(t.map((x) => [x.klucz, x.wiersze]));
  if (wierszeTabel(stary.tabele ?? []) !== wierszeTabel(nowy.tabele)) {
    const klucze = nowy.tabele
      .filter((nt) => {
        const st = (stary.tabele ?? []).find((x) => x.klucz === nt.klucz);
        return !st || JSON.stringify(st.wiersze) !== JSON.stringify(nt.wiersze);
      })
      .map((t) => t.klucz);
    if (klucze.length > 0) czesci.push(`tabele: ${klucze.join(", ")}`);
  }
  const stanyDruzyn = (d: Dane) => JSON.stringify(d.zespoly.map((z) => [z.nazwa, z.stan]));
  if (stanyDruzyn(stary) !== stanyDruzyn(nowy)) czesci.push("stan drużyn");
  return czesci.length > 0 ? czesci.join(" · ") : "bez zmian";
}

/** Dopisuje przebieg do runs.json (ostatnie RUNY_LIMIT wpisów) — każda ścieżka wyjścia. */
function zapiszRun(wpis: WpisRunu): void {
  let runs: WpisRunu[] = [];
  try {
    const plik = JSON.parse(readFileSync(RUNY_WYJSCIE, "utf-8")) as { runs?: WpisRunu[] };
    if (Array.isArray(plik.runs)) runs = plik.runs;
  } catch {
    // brak pliku lub uszkodzony — zaczynamy świeżo (utrata historii ≠ utrata danych)
  }
  runs.push(wpis);
  if (runs.length > RUNY_LIMIT) runs = runs.slice(-RUNY_LIMIT);
  writeFileSync(
    RUNY_WYJSCIE,
    JSON.stringify({ wygenerowano: new Date().toISOString(), przechowuje: RUNY_LIMIT, runs }, null, 2) + "\n",
    "utf-8",
  );
}

/** Faza runu dla etykiety błędu w runs.json (awaria ŚZTS vs PZTS). */
let FAZA_RUNU: "szts" | "pzts" = "szts";

async function main(): Promise<{ szts: StanSzts; pzts: StanPzts; zmieniono: boolean; zmiany: string }> {
  const teraz = new Date().toISOString();
  const staryPlik = existsSync(WYJSCIE) ? (JSON.parse(readFileSync(WYJSCIE, "utf-8")) as Dane) : null;

  // ===== 1. ŚZTS — żywy odczyt (tabele + terminarze + stany) =====
  const tabele: Dane["tabele"] = [];
  const meczeMap = new Map<string, MeczSzts>();
  const stany = new Map<string, string>();

  for (const liga of LIGI_SZTS) {
    const html = await pobierzHtml(liga.url);
    const tabela = parsujTabele(html);
    if (tabela.length === 0) throw new Error(`pusta tabela ${liga.klucz} — zmiana struktury ligi.slzts.pl?`);
    tabele.push({ klucz: liga.klucz, nazwa: liga.nazwa, wiersze: tabela, zaktualizowano: teraz });

    const nasi = ZESPOLY.filter((z) => z.ligaKlucz === liga.klucz);
    if (nasi.length === 0) continue;
    const pary = dopasujZespoly(
      nasi.map((z) => z.nazwa),
      tabela,
    );
    const terminarz = parsujTerminarz(html);

    for (const { nasza, szts } of pary) {
      const z = nasi.find((x) => x.nazwa === nasza);
      const wiersz = tabela.find((t) => t.nazwa === szts);
      if (z && wiersz) stany.set(nasza, `${wiersz.pozycja}. miejsce · ${wiersz.punkty} pkt`);
      for (const m of meczeZespolu(terminarz, szts)) {
        const klucz = `${m.dataMeczu}|${m.gospodarz}|${m.gosc}`;
        const istniejacy = meczeMap.get(klucz);
        if (istniejacy) {
          if (!istniejacy.zespoly.includes(nasza)) istniejacy.zespoly.push(nasza); // derby
        } else {
          meczeMap.set(klucz, { ...m, liga: z?.liga ?? liga.nazwa, zespoly: [nasza] });
        }
      }
    }
    console.log(`${liga.klucz}: tabela ${tabela.length} drużyn, terminarz ${terminarz.length} meczów, dopasowano ${pary.length}/${nasi.length}`);
  }

  // ===== 2. PZTS — kolejność: wklej (env) → czytnik (jina) → stary stan =====
  FAZA_RUNU = "pzts";
  let meczePzts: MeczPzts[] = [];
  let pztsSync: string | null = staryPlik?.ostatniSync?.pzts ?? null;
  let stanPztsTabela: string | null = null; // „4. miejsce · 3 pkt” z tabeli ligi
  let pztsStan: StanPzts = "pominieto";

  const przyjmijMecze = (lista: MeczLigi[], zrodlo: string, stan: StanPzts): void => {
    meczePzts = lista.map((m) => ({
      ...m,
      liga: "1. Liga Mężczyzn · gr. południowa",
      zespol: "KTS Gliwice I",
    }));
    pztsSync = teraz;
    pztsStan = stan;
    console.log(`PZTS: przyjęto ${meczePzts.length} meczów (${zrodlo})`);
  };

  if (process.env.PZTS_MECZE) {
    // (a) ręczna wklejka — najwyższy priorytet (backup)
    const zEnv = JSON.parse(process.env.PZTS_MECZE) as MeczLigi[];
    przyjmijMecze(zEnv, "zmienna PZTS_MECZE — wklejka ręczna", "recznie");
  } else {
    // (b) czytnik r.jina.ai — pełny automat
    try {
      const md = await pobierzPztsPrzezJine();
      const terminarz = parsujTerminarzPzts(md);
      const nasi = terminarz.filter(
        (m) => m.gospodarz.includes("KTS Gliwice") || m.gosc.includes("KTS Gliwice"),
      );
      if (nasi.length === 0) throw new Error("parser nie znalazł meczów KTS Gliwice — zmiana strony pzts.pl?");
      przyjmijMecze(nasi, `czytnik r.jina.ai: ${terminarz.length} meczów ligi, ${nasi.length} naszych`, "ok");
      const tabela = parsujTabelePzts(md);
      const my = tabela.find((w) => w.nazwa.includes("KTS Gliwice"));
      if (my && Number.isFinite(my.pozycja) && Number.isFinite(my.punkty)) {
        stanPztsTabela = `${my.pozycja}. miejsce · ${my.punkty} pkt`;
        console.log(`PZTS: tabela ligowa OK (${tabela.length} drużyn) — KTS: ${stanPztsTabela}`);
      }
    } catch (err) {
      pztsStan = "blad-czytnika";
      console.warn(`PZTS: czytnik zawiódł (${(err as Error).message}) —${staryPlik?.meczePzts?.length ? " zachowuję ostatni znany stan" : " brak danych"}`);
      if (staryPlik?.meczePzts) {
        meczePzts = staryPlik.meczePzts;
        console.log(`PZTS: zachowano ${meczePzts.length} meczów z poprzedniego pliku`);
        // Zachowujemy też ostatni DOBRY stan 1. drużyny („4. miejsce · 3 pkt")
        // zamiast degradować go do bilansu z zachowanych meczów — awaria
        // czytnika nie może tasować karty na stronie (zbędny zapis danych).
        const staryStan = staryPlik.zespoly?.find((z) => z.nazwa === "KTS Gliwice I")?.stan;
        if (staryStan) stanPztsTabela = staryStan;
      } else {
        console.log("PZTS: brak danych (przekaż PZTS_MECZE przy uruchomieniu ręcznym)");
      }
    }
  }

  // ===== 3. Skład danych + zapis =====
  const dane: Dane = {
    wygenerowano: teraz,
    sezon: SEZON,
    zespoly: ZESPOLY.map((z) => ({
      nazwa: z.nazwa,
      liga: z.liga,
      tryb: z.tryb,
      stan: z.nazwa === "KTS Gliwice I" ? (stanPztsTabela ?? bilansPzts(meczePzts)) : stany.get(z.nazwa) ?? "—",
      url: z.url,
    })),
    tabele,
    meczeSzts: [...meczeMap.values()],
    meczePzts,
    ostatniSync: { szts: teraz, pzts: pztsSync },
  };

  // ===== 3. Ochrona przed szumem: zapis TYLKO przy realnej zmianie danych =====
  // Znaczniki czasu (wygenerowano / zaktualizowano / ostatniSync) zmieniają
  // się przy KAŻDYM przebiegu — porównujemy treść bez nich. Bez różnicy
  // = bez zapisu = bez commita i przebudowy Pages (cron może chodzić dalej,
  // historia repo pokazuje wyłącznie ISTOTNE zmiany).
  const zmiany = opiszZmiany(staryPlik, dane);
  const doZapisu = JSON.stringify(dane, null, 2) + "\n";
  if (staryPlik) {
    const bezZnacznikow = (tekst: string): string => tekst
      .replace(/"wygenerowano": "[^"]*"/, '"wygenerowano": "X"')
      .replace(/"zaktualizowano": "[^"]*"/g, '"zaktualizowano": "X"')
      .replace(/"szts": "[^"]*"/, '"szts": "X"')
      .replace(/"pzts": "[^"]*"/, '"pzts": "X"');
    const stary = JSON.stringify(staryPlik, null, 2) + "\n";
    if (bezZnacznikow(doZapisu) === bezZnacznikow(stary)) {
      console.log("Dane bez zmian — pomijam zapis (brak commita/przebudowy).");
      return { szts: "ok", pzts: pztsStan, zmieniono: false, zmiany: "bez zmian" };
    }
  }
  writeFileSync(WYJSCIE, doZapisu, "utf-8");
  console.log(
    `Zapisano ${WYJSCIE}: ${dane.zespoly.length} zespołów, ${dane.tabele.length} tabel, ` +
      `${dane.meczeSzts.length} meczów ŚZTS, ${dane.meczePzts.length} meczów PZTS`,
  );
  return { szts: "ok", pzts: pztsStan, zmieniono: true, zmiany };
}

// Osłona: main() TYLKO przy bezpośrednim uruchomieniu (bun scripts/sync_statyczny.ts),
// nie przy imporcie do testów (import.meta.main — konwencja buna/deno).
// Od v1.5.2 KAŻDA ścieżka wyjścia (sukces / bez zmian / awaria) zapisuje
// wpis do runs.json — panel na stronie odczytuje go zamiast API GitHuba.
if (import.meta.main) {
  const startMs = Date.now();
  const startIso = () => new Date(startMs).toISOString();
  const czasTrwania = () => Math.round((Date.now() - startMs) / 1000);
  main()
    .then((w) => {
      zapiszRun({
        start: startIso(), czasS: czasTrwania(),
        szts: w.szts, pzts: w.pzts, zmieniono: w.zmieniono, zmiany: w.zmiany, blad: null,
      });
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("BŁĄD synchronizacji:", err);
      zapiszRun({
        start: startIso(), czasS: czasTrwania(),
        szts: FAZA_RUNU === "szts" ? "blad" : "ok",
        pzts: FAZA_RUNU === "pzts" ? "blad-czytnika" : "pominieto",
        zmieniono: false, zmiany: "—", blad: msg.slice(0, 300),
      });
      process.exit(1);
    });
}
