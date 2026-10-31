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
 *    Actions nie odczyta go bezpośrednio. Kolejność prób (v1.8, 20.10.2026):
 *    a) zmienna PZTS_MECZE (JSON z wklejki ręcznej — najwyższy priorytet,
 *       backup gdyby i most, i czytnik zawiodły),
 *    b) MOST GOOGLE SHEETS (gviz) — kanał główny: skoroszyt „Most KTS do
 *       PZTS” z formułami IMPORTXML/IMPORTHTML (pzts.pl czytany z adresów
 *       Google — Cloudflare nie blokuje; samosanujący się na nowe sezony:
 *       sonda hubu w Skan!A3 sama podchwytuje ligi nowego sezonu, sloty
 *       I2:I7 przepinają się same); robot czyta zakładki Terminarz/Tabela
 *       publicznym kanałem gviz CSV — bez kluczy i bez autoryzacji,
 *    c) czytnik r.jina.ai — fallback gdy most nie odpowie (renderuje
 *       strony headless browserem omijając Cloudflare; parsujemy Markdown),
 *    d) zachowanie ostatniego znanego stanu z poprzedniego dane.json.
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
 * Od v1.6.1 (poziom 1): pobierzHtml (szts-core.ts) ponawia pobieranie
 * (3 próby / timeout 90 s / 10 s + 20 s) — użycie retry trafia do runs.json
 * (pole „retry"), żeby pomiar błędów przejściowych nie umarł z retry.
 *
 * Od v1.6.1 (poziom 2): IZOLACJA ŹRÓDEŁ — błąd ŚZTS nie blokuje PZTS
 * (i odwrotnie). Awaria jednego źródła = przytrzymanie jego danych
 * z poprzedniego dane.json + status w polu „zrodla" + run czerwony
 * (exit 1 PO zapisie), ale część udana ląduje w repo (commit if:always
 * w workflow). Świadoma zgoda właściciela na częściowo świeże dane
 * zamiast all-or-nothing (decyzja 03.10: „wykonaj 1+2").
 *
 * Nowy sezon: PZTS przepina się SAM (most: sonda hubu w Skan!A3 łapie nowe
 *   ligi, sloty I2:I7 wskakują same — zero edycji formuł). Ręcznie zostaje
 *   tylko ZESPOLY (nazwa karty i NAZWA ligi do wyświetlenia — most zna
 *   URL-e, nie nazwy) oraz ewentualnie LIGI_SZTS w szts-core.ts (ŚZTS nie
 *   ma własnej sondy).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  LIGI_SZTS,
  dopasujZespoly,
  meczeZespolu,
  parsujTabele,
  parsujTerminarz,
  pobierzHtml,
  parsujSklad,
  parsujLinkiDruzyn,
  pobierzHtmlDruzyny,
  type ZawodnikSkladu,
  STATYSTYKI_POBIERANIA,
  KOREKTY_ZASTOSOWANE,
  type MeczLigi,
} from "./szts-core";

// ====== KONFIGURACJA SEZONU 2026/27 (edytuj przy nowym sezonie) ======
const SEZON = "2026/27";

// 1. Liga Mężczyzn gr. południowa — strona tabeli i terminarza na pzts.pl
const PZTS_LIGA_URL = "https://www.pzts.pl/rozgrywki-ligowe/liga/?id=82";
// Czytnik omijający Cloudflare (bez klucza API, format: Markdown)
const JINA_URL = `https://r.jina.ai/${PZTS_LIGA_URL}`;

const ZESPOLY = [
  // ligaKlucz od v1.9 = KLUCZ TABELI w dane.tabele (jawne wiązanie dla
  // dialogu/podstrony drużyny): ŚZTS → „sezon/grupa”, PZTS → „pzts/1lm”.
  { nazwa: "KTS Gliwice I", liga: "1. Liga Mężczyzn · gr. południowa", tryb: "PZTS · automat", url: "https://pzts.pl/rozgrywki-ligowe/druzyna/960/", ligaKlucz: "pzts/1lm" as string | null },
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
  retry?: string | null; // v1.6.1: użycie ponowień, np. „ŚZTS: sukces po 2. próbie (18/138)"
  // v1.7.5 (Task 94, „sprytny kod”): jawny stan korekt godzin w ŻYWYM
  // odczycie — "data gospodarz–gość: źródło X → korekta Y" albo
  // "źródło przejęło Y — wpis można zdjąć". Pole opcjonalne: wpis
  // bez korekt (mapa pusta / meczów brak) go pomija — runs.json
  // pozostaje wstecznie zgodny z dotychczasowym frontem.
  korekty?: string[];
  /** v1.9: moment ostatniego ODŚWIEŻENIA składów ŚZTS (zegar TTL —
   *  runs.json zapisywany przy każdym przebiegu, więc zegar przetrzyma
   *  nawet przebieg bez commita dane.json). null = jeszcze nie czytano. */
  skladyOdczyt?: string | null;
  /** v1.8: diagnostyka mostu Google Sheets — kanał, który obsłużył PZTS
   *  (most/czytnik/recznie/zachowano/brak), sloty drużyn ze Skanu oraz
   *  alarm o nowej drużynie (slot 2+ niepusty — dopóki import nie zostanie
   *  rozszerzony, alarm powtarza się jawnie w każdym wpisie). */
  most?: { kanal: string; sloty: string[]; uwaga?: string };
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
  /** v1.9: zespoly zyskują jawne wiązania — tabela (klucz w tabele[])
   *  i wiersz (dokładna nazwa wiersza u źródła; „KTS Gliwice” w 1. lidze
   *  PZTS vs nazwa karty „KTS Gliwice I”). Front (1.12.1) używa ich
   *  zamiast heurystyk dopasowywania nazw. */
  zespoly: Array<{
    nazwa: string; liga: string; tryb: string; stan: string; url: string;
    tabela?: string | null; wiersz?: string | null;
  }>;
  /** v1.9: kolumna4 = nagłówek 4. kolumny tabeli (domyślnie „Sety”;
   *  PZTS ma Z–R–P, bo źródło nie wystawia bilansu setów). */
  tabele: Array<{ klucz: string; nazwa: string; wiersze: unknown[]; zaktualizowano: string; kolumna4?: string }>;
  meczeSzts: MeczSzts[];
  meczePzts: MeczPzts[];
  /** v1.9: składy drużyn ze statystykami (ŚZTS: podstrony /druzyna/…
   *  z TTL 12 h; PZTS: zakładka „Skład” mostu Google Sheets, opcjonalna).
   *  Pole opcjonalne — stary front bez niego działa. */
  sklady?: SkladDruzyny[];
  ostatniSync: { szts: string | null; pzts: string | null };
  /** v1.6.1 (poziom 2): status per źródło. "ok" jest stabilne (nie szumi
   *  w ochronie przed zapisem bez zmian); awaria i wyzdrowienie zmieniają
   *  treść → realny commit — dokładnie wtedy, gdy warto to pokazać. */
  zrodla: { szts: string; pzts: string };
}

/** Skład drużyny — kontrakt dla dialogu i podstrony drużyny (front 1.12+). */
interface SkladDruzyny {
  zespol: string; // nazwa z ZESPOLY (klucz dopasowania po slugu)
  zrodlo: string; // URL podstrony u źródła
  zaktualizowano: string;
  zawodnicy: ZawodnikSkladu[];
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

/* ============================================================
 * PZTS przez MOST GOOGLE SHEETS (gviz CSV) — kanał główny v1.8.0.
 * Skoroszyt „Most KTS do PZTS” (Task 113–120, 19–20.10.2026): formuły
 * IMPORTXML/IMPORTHTML w arkuszu ściągają pzts.pl z adresów Google,
 * robot czyta gotowe tabele publicznym kanałem gviz — bez kluczy.
 *  - Zakładka „Terminarz”: terminarz KTS (tabela 2 z druzyna/960).
 *  - Zakładka „Tabela”: tabela ligowa (tabela 1 z ligi drużyny 1).
 *  - Zakładka „Skan”: sloty I2:I5 — slot 2+ niepusty = NOWA DRUŻYNA PZTS
 *    (alarm w runs.json do czasu rozszerzenia importu w arkuszu).
 * Specyfika gviz (QA 20.10): pierwsza linia CSV = wiersz 2 arkusza;
 * pogrubienia opakowane w *gwiazdki*; daty z osadzonym „\ng. HH:MM”;
 * kolejka jako „matchID\nnumer”; przecinek dziesiętny w Poj.
 * ============================================================ */
const ARKUSZ_MOSTU = "14ubTtWQr7G_9_AytvqDn59pbMjdWR_nJfTtW1u0RIjo";
const GVIZ = `https://docs.google.com/spreadsheets/d/${ARKUSZ_MOSTU}/gviz/tq?tqx=out:csv`;

/** CSV z cudzysłowami (gviz osadza nowe linie w polach — częste). */
export function csvNaWiersze(tekst: string): string[][] {
  const wiersze: string[][] = [];
  let wiersz: string[] = [];
  let pole = "";
  let wCudzyslowie = false;
  for (let i = 0; i < tekst.length; i++) {
    const znak = tekst[i];
    if (wCudzyslowie) {
      if (znak === '"' && tekst[i + 1] === '"') { pole += '"'; i++; }
      else if (znak === '"') wCudzyslowie = false;
      else pole += znak;
    } else if (znak === '"') wCudzyslowie = true;
    else if (znak === ",") { wiersz.push(pole); pole = ""; }
    else if (znak === "\n") { wiersz.push(pole); wiersze.push(wiersz); pole = ""; wiersz = []; }
    else if (znak !== "\r") pole += znak;
  }
  if (pole !== "" || wiersz.length > 0) { wiersz.push(pole); wiersze.push(wiersz); }
  return wiersze;
}

/** Zakładka mostu przez gviz (retry + cache-buster — gviz potrafi
 *  oddać pustą odpowiedź w trakcie przeliczania formuł; QA 20.10). */
async function pobierzZakladkeMostu(nazwa: string, proby = 3): Promise<string[][]> {
  let ostatniBlad: unknown = null;
  for (let i = 1; i <= proby; i++) {
    const url = `${GVIZ}&sheet=${encodeURIComponent(nazwa)}&_cb=${Date.now()}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "KTS-Gliwice-Sync/1.8 (most gviz)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`gviz HTTP ${res.status}`);
      const wiersze = csvNaWiersze(await res.text());
      if (wiersze.length === 0 || wiersze.every((w) => w.every((c) => !c.trim())))
        throw new Error("gviz pusto (formuły się przeliczają?)");
      return wiersze;
    } catch (err) {
      ostatniBlad = err;
      if (i < proby) await new Promise((r) => setTimeout(r, 5_000 * i));
    }
  }
  throw ostatniBlad ?? new Error("gviz: nieznany błąd");
}

/** Zdejmuje *pogrubienia* gviz („*KTS Gliwice*” → „KTS Gliwice”). */
function bezGwiazdek(pole: string): string {
  return pole.replace(/\*/g, "").trim();
}

/** Parser terminarza z CSV gviz (zakładka „Terminarz”). */
export function parsujTerminarzGviz(wiersze: string[][]): Array<MeczLigi> {
  const mecze: Array<MeczLigi> = [];
  for (const w of wiersze) {
    if (w.length < 6) continue;
    // data: „2026-09-19\ng. 16:00” (nowy wiersz osadzony w polu CSV)
    const dm = (w[0] ?? "").match(/^(\d{4}-\d{2}-\d{2})(?:\s+g\.\s+(\d{2}:\d{2}))?/s);
    if (!dm) continue; // wiersz nagłówka rozlania / obcy
    const gospodarz = bezGwiazdek(w[2] ?? "");
    const gosc = bezGwiazdek(w[3] ?? "");
    if (!gospodarz || !gosc) continue;
    const wynikRaw = bezGwiazdek(w[4] ?? "");
    const rozegrany = /^\d+\s*:\s*\d+$/.test(wynikRaw);
    // kolejka: „503\n1” — numer kolejki to OSTATNIA liczba pola (503 = match-ID)
    const kol = (w[1] ?? "").match(/(\d+)\s*$/s);
    mecze.push({
      dataMeczu: dm[1],
      godzina: dm[2] ?? null,
      kolejka: kol ? parseInt(kol[1], 10) : null,
      gospodarz,
      gosc,
      wynik: rozegrany ? wynikRaw.replace(/\s/g, "") : "-:-",
      rozegrany,
    });
  }
  return mecze;
}

/** Parser tabeli ligowej z CSV gviz (zakładka „Tabela”). */
export function parsujTabeleGviz(wiersze: string[][]): WierszTabeliPzts[] {
  const wynik: WierszTabeliPzts[] = [];
  for (const w of wiersze) {
    if (w.length < 8) continue;
    const pozycja = parseInt(bezGwiazdek(w[0] ?? ""), 10); // „4.”
    if (!Number.isFinite(pozycja)) continue;
    const nazwa = bezGwiazdek(w[1] ?? "");
    if (!nazwa) continue;
    const liczba = (x: string): number => parseInt(bezGwiazdek(x), 10);
    wynik.push({
      pozycja,
      nazwa,
      mecze: liczba(w[2] ?? ""),
      zwyciestwa: liczba(w[3] ?? ""),
      remisy: liczba(w[4] ?? ""),
      porazki: liczba(w[5] ?? ""),
      pojedynki: bezGwiazdek(w[6] ?? ""), // „1,35…” — ratio; niewykorzystywane w dół
      punkty: liczba(w[7] ?? ""),
    });
  }
  return wynik;
}

/** Sloty drużyn PZTS ze Skanu (I2:I5; pierwsza linia CSV = wiersz 2).
 *  Zwraca [slot1..slot4]; pusty string = slot wolny. */
export function slotyZSkanu(wiersze: string[][]): string[] {
  const sloty: string[] = [];
  for (let r = 0; r < 4; r++) sloty.push((wiersze[r]?.[8] ?? "").trim());
  return sloty;
}

/** v1.9: Parser składu 1. drużyny z zakładki „Skład 960” mostu (gviz CSV).
 *  Zakładkę tworzy właściciel w arkuszu mostu formułą w A1:
 *  =IMPORTHTML("https://pzts.pl/rozgrywki-ligowe/druzyna/960/";"table";1)
 *  (tabela 1 strony drużyny = skład; tabela 2 = terminarz — ten czyta już
 *  istniejąca zakładka „Terminarz”). Pierwsza linia CSV to nagłówek
 *  tabeli źródłowej („Nazwisko i imię”, „Nr licencji”, „Pojedynki”,
 *  „Zwycięstwa”, „Porażki”, „Skuteczność”). Komórka zawodnika u PZTS jest
 *  zbita (imię i nazwisko + wiek w klamrze + kraj) — IMPORTHTML skleja ją
 *  w jeden ciąg, więc nazwisko oczyszczamy z „(NN l.)” i kraju. Wiek NIE
 *  jest przeliczany na rok ur. (ekstrapolacja = fałszywa dokładność —
 *  ŚZTS podaje prawdziwy rok, PZTS wiek).
 *  UWAGA (QA 01.11): nazwa celowo „Skład 960”, nie „Skład” — w moście
 *  istnieje już zakładka „Skład” będąca KOPIĄ Skanu (ścieżki discovery).
 *  Parser dodatkowo waliduje, że wiersze wyglądają na zawodników. */
export function parsujSkladGviz(wiersze: string[][]): ZawodnikSkladu[] {
  const KRAJE = new Set([
    "Polska", "Ukraina", "Białoruś", "Czechy", "Słowacja", "Niemcy",
    "Francja", "Chorwacja", "Litwa", "Łotwa", "Rosja",
  ]);
  const wynik: ZawodnikSkladu[] = [];
  for (const w of wiersze) {
    if (w.length < 6) continue;
    const surowy = bezGwiazdek(w[0] ?? "");
    if (!surowy || /nazwisko i imi[ęe]/i.test(surowy)) continue; // nagłówek
    // ścieżka/URL (skan discovery, nie skład) — odrzucamy jawnie (QA 01.11:
    // zakładka „Skład” w moście okazała się kopią Skanu — ścieżki lig)
    if (surowy.includes("/") || /^https?/i.test(surowy)) continue;
    if (/^(ścieżka|liga url|herb|id|url drużyny)$/i.test(surowy)) continue;
    const bezWieku = surowy.replace(/\(\s*\d+\s*(?:l\.|lat)\s*\)/gi, " ");
    const czesci = bezWieku.split(/[\s\n]+/).map((c) => c.trim()).filter(Boolean);
    let narodowosc: string | null = null;
    if (czesci.length > 1 && KRAJE.has(czesci[czesci.length - 1])) {
      narodowosc = czesci.pop() ?? null;
    }
    const nazwisko = czesci.join(" ");
    if (!nazwisko || !/[a-ząćęłńóśźż]/i.test(nazwisko)) continue;
    const liczba = (x: string): number | null => {
      const n = parseInt(bezGwiazdek(x ?? ""), 10);
      return Number.isFinite(n) ? n : null;
    };
    wynik.push({
      nazwisko,
      licencja: /^\d{3,6}$/.test(bezGwiazdek(w[1] ?? "")) ? bezGwiazdek(w[1]) : null,
      narodowosc,
      rok: null,
      zwyciestwa: liczba(w[3]),
      porazki: liczba(w[4]),
      punkty: null,
      skutecznosc: bezGwiazdek(w[5] ?? "") || null,
    });
  }
  // walidacja sensowności: prawdziwy skład ma statystyki liczbowe; gdy
  // wiersze ich nie mają (ktoś wkleił w zakładkę co innego), zwracamy
  // pustkę — skład po prostu nie płynie (front go ukryje)
  const zLiczbami = wynik.filter(
    (z) => z.licencja !== null || z.zwyciestwa !== null || z.porazki !== null || z.skutecznosc !== null,
  );
  return zLiczbami.length >= Math.max(1, Math.ceil(wynik.length / 2)) ? wynik : [];
}

// v1.8: stan mostu dla runs.json (wpis.most — wstecznie zgodne, pole opcjonalne)
let MOST_KANAL: string = "brak"; // most | czytnik | recznie | zachowano | brak
let MOST_SLOTY: string[] = [];
let MOST_UWAGA: string | undefined;
// v1.9: zegar TTL składów (modułowo — widoczny też w wrapperze błędów;
// ustawiany w main() po ≥1 udanym odczycie składu)
let SKLADY_ODCZYT_TS: string | null = null;

function opiszMost(): { kanal: string; sloty: string[]; uwaga?: string } {
  const o: { kanal: string; sloty: string[]; uwaga?: string } = { kanal: MOST_KANAL, sloty: MOST_SLOTY };
  if (MOST_UWAGA) o.uwaga = MOST_UWAGA;
  return o;
}

/** Pobiera Markdown ligi przez czytnik (ponawia — darmowy limit bywa wąski).
 *  Opcjonalny klucz: sekret JINA_API_KEY w repo (Authorization: Bearer …)
 *  — zabezpieczenie na wypadek blokad anonimowego ruchu z IP runnera.
 *  v1.6.1: liczba prób sukcesu exposed przez JINA_PROBY (do runs.json). */
let JINA_PROBY = 0; // 1 = sukces za pierwszym razem; 2+ = po ponowieniu

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
      JINA_PROBY = i;
      return tekst;
    } catch (err) {
      ostatniBlad = err;
      if (i < proby) await new Promise((r) => setTimeout(r, 10_000 * i)); // 10 s, 20 s
    }
  }
  throw ostatniBlad ?? new Error("czytnik: nieznany błąd");
}

/** Krótki, ludzki opis różnicy między dwoma stanami danych (do runs.json). */
export function opiszZmiany(stary: Dane | null, nowy: Dane): string {
  if (!stary) return "pierwszy zapis";
  const klucz = (m: MeczLigi) => `${m.dataMeczu}|${m.gospodarz}|${m.gosc}`;
  const para = (m: MeczLigi) => `${m.gospodarz}|${m.gosc}`;
  const czesci: string[] = [];
  // v1.7.5 (Task 94, „sprytny kod”): źródło bywa zawodne — zmiany TERMINÓW
  // (godziny, przesunięcia dat, usunięcia) muszą być JAWNIE raportowane,
  // nie przemykać cicho w commicie. Wcześniejsza luka: klucz meczu nie
  // zawiera godziny → zmiana 19:15→19:00 była niewidoczna; przesunięcie
  // daty wyglądało jak „+nowy termin” bez zniknięcia starego.
  const raportMeczy = (nazwa: string, stare: MeczLigi[], nowe: MeczLigi[]) => {
    const stareMapa = new Map(stare.map((m) => [klucz(m), m]));
    const noweKlucze = new Set(nowe.map((m) => klucz(m)));
    const nowePary = new Set(nowe.map((m) => para(m)));
    let noweWyniki = 0;
    let poprawione = 0;
    let noweTerminy = 0;
    let usuniete = 0;
    const zmianyGodzin: string[] = [];
    const przesuniete: string[] = [];
    for (const m of nowe) {
      const st = stareMapa.get(klucz(m));
      if (!st) {
        // „nowy” klucz: przesunięcie (ta sama para pod inną datą, a stara
        // data zniknęła z terminarza) czy naprawdę nowy mecz?
        const zniknieta = stare.filter((s) => para(s) === para(m) && !noweKlucze.has(klucz(s)));
        if (zniknieta.length > 0) {
          przesuniete.push(`${zniknieta[0].dataMeczu}→${m.dataMeczu} ${m.gospodarz}–${m.gosc}`);
        } else {
          noweTerminy++;
        }
      } else if (m.rozegrany && !st.rozegrany) {
        noweWyniki++;
      } else if (m.rozegrany && st.rozegrany && m.wynik !== st.wynik) {
        poprawione++; // korekta błędnie wpisanego wyniku
      } else if (m.godzina !== st.godzina) {
        zmianyGodzin.push(`${m.dataMeczu} ${m.gospodarz}–${m.gosc}: ${st.godzina ?? "?"}→${m.godzina ?? "?"}`);
      }
    }
    for (const s of stare) {
      // para zniknęła CAŁKOWICIE (stare daty nie wróciły pod innym kluczem)
      if (!noweKlucze.has(klucz(s)) && !nowePary.has(para(s))) usuniete++;
    }
    if (noweWyniki > 0) czesci.push(`+${noweWyniki} ${odmien(noweWyniki, ["wynik", "wyniki", "wyników"])} (${nazwa})`);
    if (poprawione > 0) czesci.push(`poprawione: ${poprawione} (${nazwa})`);
    if (zmianyGodzin.length > 0) {
      czesci.push(`godziny (${nazwa}): ${zmianyGodzin.slice(0, 3).join("; ")}${zmianyGodzin.length > 3 ? " …" : ""}`);
    }
    if (przesuniete.length > 0) {
      czesci.push(`przesunięte terminy (${nazwa}): ${przesuniete.slice(0, 3).join("; ")}${przesuniete.length > 3 ? " …" : ""}`);
    }
    if (usuniete > 0) czesci.push(`usunięte z terminarza: ${usuniete} (${nazwa})`);
    if (noweTerminy > 0) czesci.push(`+${noweTerminy} w terminarzu (${nazwa})`);
  };
  raportMeczy("ŚZTS", stary.meczeSzts ?? [], nowy.meczeSzts);
  raportMeczy("PZTS", stary.meczePzts ?? [], nowy.meczePzts);
  const wierszeTabel = (t: Dane["tabele"]) => JSON.stringify(t.map((x) => [x.klucz, x.wiersze, x.kolumna4 ?? null]));
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
  // v1.9: zmiany składów (nowy zawodnik, statystyki, zniknięcie)
  const sygnaturaSkladow = (d: Dane) =>
    JSON.stringify((d.sklady ?? []).map((s) => [s.zespol, s.zawodnicy]));
  if (sygnaturaSkladow(stary) !== sygnaturaSkladow(nowy)) {
    const nowe = new Set((nowy.sklady ?? []).map((s) => s.zespol));
    const stare = new Set((stary.sklady ?? []).map((s) => s.zespol));
    const dodatki = [...nowe].filter((x) => !stare.has(x)).length;
    czesci.push(dodatki > 0 ? `+${dodatki} ${odmien(dodatki, ["skład", "składy", "składów"])}` : "składy (statystyki)");
  }
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

type WynikRunu = {
  szts: StanSzts;
  pzts: StanPzts;
  zmieniono: boolean;
  zmiany: string;
  blad: string | null; // treść błędu źródła (izolacja: błąd NIE ubija runu)
  retry: string | null; // opis użycia ponowień („ŚZTS: sukces po 2. próbie…”)
  korekty: string[]; // v1.7.5: stan korekt godzin (opiszKorekty) — jawnie
  skladyOdczyt: string | null; // v1.9: zegar TTL składów (do runs.json)
};

/** Opis użycia ponowień dla runs.json — pomiar błędów przejściowych w locie. */
function opiszRetry(): string | null {
  const czesci: string[] = [];
  if (STATYSTYKI_POBIERANIA.length > 0) {
    const klucze = STATYSTYKI_POBIERANIA.map((s) => s.url.match(/\d+\/\d+/)?.[0] ?? s.url);
    czesci.push(`ŚZTS: sukces po ${STATYSTYKI_POBIERANIA[0].proby}. próbie (${klucze.join(", ")})`);
  }
  if (JINA_PROBY > 1) czesci.push(`PZTS: czytnik sukces po ${JINA_PROBY}. próbie`);
  return czesci.length > 0 ? czesci.join(" · ") : null;
}

/**
 * Stan korekt godzin po ŻYWYM odczycie (v1.7.5, Task 94) — z rejestru
 * wypełnianego przez parsujTerminarz. Cel: właściciel w dzienniku przebiegów
 * (runs.json) widzi bez zaglądania w kod, czy korekta wiedzy klubowej:
 *  - nadal pracuje („źródło 19:15 → korekta 19:00”) — źródło kłamie,
 *  - stała się zbędna („źródło przejęło 19:00 — wpis można zdjąć”) —
 *    ŚZTS poprawił dane i mapę można oczyścić przy najbliższych porządkach,
 *  - źródło zgłosiło wartość trzecią (np. 19:30) — jawnie wprost, bo
 *    korekta zamaskowałaby ją w danych; tu prawda pozostaje widoczna.
 * Puste gdy mapa pusta lub mecze nieobjęte korektą (pole pomijane we wpisie).
 */
function opiszKorekty(): string[] {
  return KOREKTY_ZASTOSOWANE.map((k) => {
    const kto = `${k.data} ${k.gospodarz}–${k.gosc}`;
    if (k.zeZrodla === k.korekta) {
      return `${kto}: źródło przejęło ${k.korekta} — wpis można zdjąć z KOREKTY_GODZIN`;
    }
    if (k.zeZrodla === null) {
      return `${kto}: źródło BEZ godziny — korekta ${k.korekta}`;
    }
    return `${kto}: źródło ${k.zeZrodla} → korekta ${k.korekta}`;
  });
}

async function main(): Promise<WynikRunu> {
  const teraz = new Date().toISOString();
  const staryPlik = existsSync(WYJSCIE) ? (JSON.parse(readFileSync(WYJSCIE, "utf-8")) as Dane) : null;

  // ===== 1. ŚZTS — żywy odczyt (tabele + terminarze + stany) =====
  // v1.6.1 (poziom 2): IZOLACJA — awaria ŚZTS przytrzymuje poprzednie dane
  // tego źródła i NIE blokuje odczytu PZTS; run kończy się czerwono
  // (exit 1 w wrapperze PO zapisie), ale część udana ląduje w repo.
  let tabele: Dane["tabele"] = staryPlik?.tabele ?? [];
  let meczeSzts: MeczSzts[] = staryPlik?.meczeSzts ?? [];
  let sztsSync: string | null = staryPlik?.ostatniSync?.szts ?? null;
  // stany ŚZTS przytrzymane z poprzedniego pliku (awaria nie kasuje kart)
  const stany = new Map<string, string>();
  for (const z of staryPlik?.zespoly ?? []) {
    if (z.tryb.startsWith("ŚZTS")) stany.set(z.nazwa, z.stan);
  }
  // v1.9: jawne wiązanie zespół→wiersz tabeli — przy awarii ŚZTS
  // trzymamy poprzednie (konwencja lustrzana ze stanami wyżej)
  const WIERSZE_NASZE = new Map<string, string>();
  for (const z of staryPlik?.zespoly ?? []) {
    if (z.wiersz) WIERSZE_NASZE.set(z.nazwa, z.wiersz);
  }
  let sztsBlad: string | null = null;

  // v1.9: składy ŚZTS — TTL 12 h, ale zegar żyje w runs.json (zapisywanym
  // przy KAŻDYM przebiegu), nie w dane.json (tam znaczniki są maskowane
  // przy ochronie przed szumem — zegar by nie przetrwał przebiegu bez
  // commita i odświeżanie strzelałoby przy każdym runie: 84–252 zapytań
  // dziennie zamiast ~14). Statystyki składów zmieniają się po meczach —
  // 12 h w zupełności wystarcza.
  const SKLAD_TTL_MS = 12 * 60 * 60 * 1000;
  let ostatniOdczytSkladow: Date | null = null;
  try {
    const runs = JSON.parse(readFileSync(RUNY_WYJSCIE, "utf-8")) as { runs?: WpisRunu[] };
    for (let i = (runs.runs ?? []).length - 1; i >= 0; i--) {
      const ts = runs.runs?.[i]?.skladyOdczyt;
      if (ts) { ostatniOdczytSkladow = new Date(ts); break; }
    }
  } catch { /* brak/uszkodzony runs.json — pierwsze czytanie */ }
  const ODSWIEZ_SKLADY =
    !ostatniOdczytSkladow || Date.now() - ostatniOdczytSkladow.getTime() > SKLAD_TTL_MS;
  const skladyStare = new Map<string, SkladDruzyny>();
  for (const s of staryPlik?.sklady ?? []) skladyStare.set(s.zespol, s);
  const skladyNowe = new Map<string, SkladDruzyny | null>();

  try {
    const tabeleNowe: Dane["tabele"] = [];
    const meczeMap = new Map<string, MeczSzts>();
    const stanyNowe = new Map<string, string>();
    // v1.9: wiersz OUR w tabeli per zespół (jawne wiązanie dla frontu)
    const wierszeNasze = new Map<string, string>();

    for (const liga of LIGI_SZTS) {
      const html = await pobierzHtml(liga.url);
      const tabela = parsujTabele(html);
      if (tabela.length === 0) throw new Error(`pusta tabela ${liga.klucz} — zmiana struktury ligi.slzts.pl?`);
      tabeleNowe.push({ klucz: liga.klucz, nazwa: liga.nazwa, wiersze: tabela, zaktualizowano: teraz });

      const nasi = ZESPOLY.filter((z) => z.ligaKlucz === liga.klucz);
      if (nasi.length === 0) continue;
      const pary = dopasujZespoly(
        nasi.map((z) => z.nazwa),
        tabela,
      );
      const terminarz = parsujTerminarz(html);

      // v1.9: linki do podstron drużyn (sekcja „Tabela ligowa”)
      const linkiDruzyn = parsujLinkiDruzyn(html);

      for (const { nasza, szts } of pary) {
        const z = nasi.find((x) => x.nazwa === nasza);
        const wiersz = tabela.find((t) => t.nazwa === szts);
        if (z && wiersz) stanyNowe.set(nasza, `${wiersz.pozycja}. miejsce · ${wiersz.punkty} pkt`);
        wierszeNasze.set(nasza, szts);
        for (const m of meczeZespolu(terminarz, szts)) {
          const klucz = `${m.dataMeczu}|${m.gospodarz}|${m.gosc}`;
          const istniejacy = meczeMap.get(klucz);
          if (istniejacy) {
            if (!istniejacy.zespoly.includes(nasza)) istniejacy.zespoly.push(nasza); // derby
          } else {
            meczeMap.set(klucz, { ...m, liga: z?.liga ?? liga.nazwa, zespoly: [nasza] });
          }
        }

        // v1.9: skład drużyny — TYLKO w oknie odświeżania (zegar TTL w
        // runs.json, patrz blok konfiguracji wyżej); poza oknem trzymamy
        // stary wpis 1:1 (bez dotykania zaktualizowano → brak szumu w
        // dane.json). Awaria podstrony = stare dane lub brak — NIE ubija
        // runu (składy to dodatek, nie fundament).
        const starySklad = skladyStare.get(nasza);
        if (!ODSWIEZ_SKLADY) {
          skladyNowe.set(nasza, starySklad ?? null);
          continue;
        }
        const urlDruzyny = linkiDruzyn.get(szts);
        if (!urlDruzyny) {
          console.warn(`SKŁAD: brak linku podstrony dla „${szts}” w ${liga.klucz} — pomijam`);
          skladyNowe.set(nasza, starySklad ?? null);
          continue;
        }
        try {
          const htmlDruzyny = await pobierzHtmlDruzyny(urlDruzyny);
          const zawodnicy = parsujSklad(htmlDruzyny);
          if (zawodnicy.length === 0) throw new Error("0 zawodników — zmiana struktury strony drużyny?");
          skladyNowe.set(nasza, { zespol: nasza, zrodlo: urlDruzyny, zaktualizowano: teraz, zawodnicy });
          SKLADY_ODCZYT_TS = teraz; // ≥1 sukces = zegar TYKA (totalna awaria
                                    // zostawia zegar — następna próba w runie)
          console.log(`SKŁAD ${nasza}: ${zawodnicy.length} zawodników (${urlDruzyny})`);
        } catch (errSklad) {
          console.warn(`SKŁAD ${nasza}: odczyt nieudany (${(errSklad as Error).message}) — ${starySklad ? "trzymam stary" : "pomijam"}`);
          skladyNowe.set(nasza, starySklad ?? null);
        }
      }
      console.log(`${liga.klucz}: tabela ${tabela.length} drużyn, terminarz ${terminarz.length} meczów, dopasowano ${pary.length}/${nasi.length}`);
    }

    tabele = tabeleNowe;
    meczeSzts = [...meczeMap.values()];
    stany.clear();
    for (const [k, v] of stanyNowe) stany.set(k, v);
    WIERSZE_NASZE.clear();
    for (const [k, v] of wierszeNasze) WIERSZE_NASZE.set(k, v);
    sztsSync = teraz;
  } catch (err) {
    sztsBlad = err instanceof Error ? err.message : String(err);
    if (!staryPlik) throw err; // brak danych do przytrzymania — totalna awaria = fail loud
    console.warn(`ŚZTS: awaria odczytu (${sztsBlad}) — przytrzymuję dane z poprzedniego pliku`);
  }

  // ===== 2. PZTS — kolejność: wklej (env) → czytnik (jina) → stary stan =====
  FAZA_RUNU = "pzts";
  let meczePzts: MeczPzts[] = [];
  let pztsSync: string | null = staryPlik?.ostatniSync?.pzts ?? null;
  let stanPztsTabela: string | null = null; // „4. miejsce · 3 pkt” z tabeli ligi
  let pztsStan: StanPzts = "pominieto";
  // v1.9: pełna tabela 1. ligi z mostu (klienta: dialog + podstrona drużyny);
  // PZTS nie wystawia bilansu setów → 4. kolumna = Z–R–P (kolumna4)
  let tabelaPzts: Dane["tabele"][number] | null = null;
  // v1.9: skład 1. drużyny z zakładki „Skład” mostu (opcjonalna — jeśli
  // właściciel jej nie dodał, skład PZTS po prostu nie płynie;
  // formuły do wklejenia w arkuszu: patrz README/worklog 01.11)
  let skladPzts: SkladDruzyny | null = null;

  /** Wiersze tabeli PZTS → format tabel strony (kolumna4 = Z–R–P). */
  const zbudujTabelePzts = (w: WierszTabeliPzts[], zaktualizowano: string): Dane["tabele"][number] => ({
    klucz: "pzts/1lm",
    nazwa: "1. Liga Mężczyzn · gr. południowa",
    wiersze: w.map((x) => ({
      pozycja: x.pozycja,
      nazwa: x.nazwa,
      mecze: x.mecze,
      punkty: x.punkty,
      stosunek: `${x.zwyciestwa}-${x.remisy}-${x.porazki}`,
    })),
    zaktualizowano,
    kolumna4: "Z–R–P",
  });

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
    MOST_KANAL = "recznie";
  } else {
    // (b) MOST GOOGLE SHEETS (gviz) — kanał główny v1.8
    try {
      const skan = await pobierzZakladkeMostu("Skan");
      MOST_SLOTY = slotyZSkanu(skan);
      if (!MOST_SLOTY[0]) throw new Error("Skan!I2 (DRUŻYNA 1) pusty — most nie zeskanował lig");
      const nowaDruzyna = MOST_SLOTY.findIndex((s, i) => i > 0 && s.length > 0);
      if (nowaDruzyna > 0) {
        MOST_UWAGA = `slot ${nowaDruzyna + 1} niepusty — nowa drużyna PZTS wykryta; import wymaga rozszerzenia arkusza (daj znać robotowi)`;
        console.warn(`MOST: ${MOST_UWAGA}: ${MOST_SLOTY[nowaDruzyna]}`);
      }
      const terminarz = parsujTerminarzGviz(await pobierzZakladkeMostu("Terminarz"));
      const nasi = terminarz.filter(
        (m) => m.gospodarz.includes("KTS Gliwice") || m.gosc.includes("KTS Gliwice"),
      );
      if (nasi.length === 0) throw new Error("most: brak meczów KTS w zakładce Terminarz (formuła się przelicza?)");
      // Ochrona przed partial read (QA 20.10): gviz potrafi oddać STAN
      // CZĘŚCIOWY w trakcie przeliczania formuł (np. samo A/B, reszta
      // jeszcze pusta). Liczba meczów drużyny w sezonie nie maleje —
      // mniej niż znamy = odrzucamy odczyt, fallback na czytnik.
      if (staryPlik?.meczePzts && nasi.length < staryPlik.meczePzts.length) {
        throw new Error(`most oddał mniej meczów niż znamy (${nasi.length} < ${staryPlik.meczePzts.length}) — przeliczanie w trakcie`);
      }
      przyjmijMecze(nasi, `most gviz: ${terminarz.length} meczów ligi, ${nasi.length} naszych`, "ok");
      MOST_KANAL = "most";
      const tabela = parsujTabeleGviz(await pobierzZakladkeMostu("Tabela"));
      const my = tabela.find((w) => w.nazwa.includes("KTS Gliwice"));
      if (my && Number.isFinite(my.pozycja) && Number.isFinite(my.punkty)) {
        stanPztsTabela = `${my.pozycja}. miejsce · ${my.punkty} pkt`;
        WIERSZE_NASZE.set("KTS Gliwice I", my.nazwa);
        tabelaPzts = zbudujTabelePzts(tabela, teraz);
        console.log(`PZTS: tabela ligowa z mostu OK (${tabela.length} drużyn) — KTS: ${stanPztsTabela}`);
      }
      // v1.9: zakładka „Skład 960” mostu (formuła IMPORTHTML tabela 1
      // strony drużyny 960 — instrukcja w worklogu 01.11) — tolerancyjnie:
      // brak zakładki / błąd / dane niesensowne = pomijamy, run trwa dalej
      try {
        const wierszeSkladu = await pobierzZakladkeMostu("Skład 960");
        const zawodnicy = parsujSkladGviz(wierszeSkladu);
        if (zawodnicy.length > 0) {
          skladPzts = {
            zespol: "KTS Gliwice I",
            zrodlo: "https://pzts.pl/rozgrywki-ligowe/druzyna/960/",
            zaktualizowano: teraz,
            zawodnicy,
          };
          console.log(`PZTS: skład z mostu OK (${zawodnicy.length} zawodników)`);
        } else {
          // gviz dla NIEISTNIEJĄCEJ zakładki oddaje pierwszą (Skan) bez
          // błędu (zweryfikowane 01.11) — rozróżniamy to jawnie w logu
          console.warn('PZTS: zakładka „Skład 960” bez zawodników (najpewniej nie istnieje — gviz oddał zawartość innej zakładki). Instrukcja: nowa zakładka „Skład 960”, w A1 formuła =IMPORTHTML("https://pzts.pl/rozgrywki-ligowe/druzyna/960/";"table";1)');
        }
      } catch (errSklad) {
        console.warn(`PZTS: zakładka „Skład 960” mostu niedostępna (${(errSklad as Error).message}) — skład 1. drużyny pominięty (instrukcja: w A1 nowej zakładki „Skład 960” wklej =IMPORTHTML("https://pzts.pl/rozgrywki-ligowe/druzyna/960/";"table";1))`);
      }
    } catch (err) {
      console.warn(`MOST: gviz zawiódł (${err instanceof Error ? err.message : String(err)}) — fallback na czytnik r.jina.ai`);
    }

    // (c) czytnik r.jina.ai — fallback, gdy most nie odpowiedział
    if (meczePzts.length === 0) {
      try {
        const md = await pobierzPztsPrzezJine();
        const terminarz = parsujTerminarzPzts(md);
        const nasi = terminarz.filter(
          (m) => m.gospodarz.includes("KTS Gliwice") || m.gosc.includes("KTS Gliwice"),
        );
        if (nasi.length === 0) throw new Error("parser nie znalazł meczów KTS Gliwice — zmiana strony pzts.pl?");
        przyjmijMecze(nasi, `czytnik r.jina.ai: ${terminarz.length} meczów ligi, ${nasi.length} naszych`, "ok");
        MOST_KANAL = "czytnik";
        const tabela = parsujTabelePzts(md);
        const my = tabela.find((w) => w.nazwa.includes("KTS Gliwice"));
        if (my && Number.isFinite(my.pozycja) && Number.isFinite(my.punkty)) {
          stanPztsTabela = `${my.pozycja}. miejsce · ${my.punkty} pkt`;
          WIERSZE_NASZE.set("KTS Gliwice I", my.nazwa);
          tabelaPzts = zbudujTabelePzts(tabela, teraz);
          console.log(`PZTS: tabela ligowa OK (${tabela.length} drużyn) — KTS: ${stanPztsTabela}`);
        }
      } catch (err) {
        // (d) awaria OBU kanałów — przytrzymanie ostatniego stanu
        pztsStan = "blad-czytnika";
        console.warn(`PZTS: most i czytnik zawiodły (${(err as Error).message}) —${staryPlik?.meczePzts?.length ? " zachowuję ostatni znany stan" : " brak danych"}`);
        if (staryPlik?.meczePzts) {
          meczePzts = staryPlik.meczePzts;
          MOST_KANAL = "zachowano";
          console.log(`PZTS: zachowano ${meczePzts.length} meczów z poprzedniego pliku`);
          // Zachowujemy też ostatni DOBRY stan 1. drużyny („4. miejsce · 3 pkt")
          // zamiast degradować go do bilansu z zachowanych meczów — awaria
          // kanałów nie może tasować karty na stronie (zbędny zapis danych).
          const staryStan = staryPlik.zespoly?.find((z) => z.nazwa === "KTS Gliwice I")?.stan;
          if (staryStan) stanPztsTabela = staryStan;
          // v1.9: awaria mostu przytrzymuje też ostatnią znaną tabelę
          // i skład 1. ligi (izolacja awarii — jak mecze)
          const staraTabela = (staryPlik.tabele ?? []).find((t) => t.klucz === "pzts/1lm");
          if (staraTabela) tabelaPzts = staraTabela;
          const starySklad = (staryPlik.sklady ?? []).find((s) => s.zespol === "KTS Gliwice I");
          if (starySklad) skladPzts = starySklad;
        } else {
          console.log("PZTS: brak danych (przekaż PZTS_MECZE przy uruchomieniu ręcznym)");
        }
      }
    }
  }

  // ===== 3. Skład danych + zapis =====
  // v1.9: tabela 1. ligi PZTS doklejana do tabel ŚZTS (bez duplikatu —
  // po awarii mostu tabele mogą już zawierać przytrzymaną wersję pzts/1lm)
  const tabeleFinal = [...tabele.filter((t) => t.klucz !== "pzts/1lm")];
  if (tabelaPzts) tabeleFinal.push(tabelaPzts);

  // v1.9: składy — porządek jak ZESPOLY; awaria ŚZTS trzyma stare
  // (izolacja awarii: skład to dodatek, nie fundament)
  const skladyFinal: SkladDruzyny[] = [];
  for (const z of ZESPOLY) {
    if (z.nazwa === "KTS Gliwice I") {
      if (skladPzts) skladyFinal.push(skladPzts);
    } else {
      const s = sztsBlad
        ? skladyStare.get(z.nazwa) ?? null
        : skladyNowe.get(z.nazwa) ?? null;
      if (s) skladyFinal.push(s);
    }
  }

  const dane: Dane = {
    wygenerowano: teraz,
    sezon: SEZON,
    zespoly: ZESPOLY.map((z) => ({
      nazwa: z.nazwa,
      liga: z.liga,
      tryb: z.tryb,
      stan: z.nazwa === "KTS Gliwice I" ? (stanPztsTabela ?? bilansPzts(meczePzts)) : stany.get(z.nazwa) ?? "—",
      url: z.url,
      // v1.9: jawne wiązania dla dialogu/podstrony drużyny (front 1.12.1+):
      // tabela = klucz w tabele[], wiersz = dokładna nazwa u źródła
      // („KTS Gliwice” w 1. lidze ≠ nazwa karty „KTS Gliwice I”)
      tabela: z.ligaKlucz,
      wiersz: WIERSZE_NASZE.get(z.nazwa) ?? null,
    })),
    tabele: tabeleFinal,
    meczeSzts,
    meczePzts,
    sklady: skladyFinal,
    ostatniSync: { szts: sztsSync, pzts: pztsSync },
    // v1.6.1 (poziom 2): status per źródło — „ok” stabilne, awaria/wyzdrowienie
    // zmienia treść → realny commit dokładnie wtedy, gdy warto to pokazać.
    zrodla: {
      szts: sztsBlad ? `blad: ${sztsBlad.slice(0, 120)}` : "ok",
      pzts: pztsStan === "blad-czytnika" ? "blad: most i czytnik PZTS — dane przytrzymane" : (pztsStan === "pominieto" ? "pominieto" : "ok"),
    },
  };

  // ===== 3. Ochrona przed szumem: zapis TYLKO przy realnej zmianie danych =====
  // Znaczniki czasu (wygenerowano / zaktualizowano / ostatniSync) zmieniają
  // się przy KAŻDYM przebiegu — porównujemy treść bez nich. Bez różnicy
  // = bez zapisu = bez commita i przebudowy Pages (cron może chodzić dalej,
  // historia repo pokazuje wyłącznie ISTOTNE zmiany).
  const zmiany = opiszZmiany(staryPlik, dane);
  const zmianyPelne = sztsBlad
    ? `AWARIA ŚZTS — dane przytrzymane (${sztsBlad.slice(0, 80)})${zmiany !== "bez zmian" ? ` · ${zmiany}` : ""}`
    : (pztsStan === "blad-czytnika" ? `AWARIA PZTS — dane przytrzymane${zmiany !== "bez zmian" ? ` · ${zmiany}` : ""}` : zmiany);
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
      return {
        szts: sztsBlad ? "blad" : "ok", pzts: pztsStan, zmieniono: false,
        zmiany: zmianyPelne, blad: sztsBlad, retry: opiszRetry(), korekty: opiszKorekty(),
        skladyOdczyt: SKLADY_ODCZYT_TS,
      };
    }
  }
  writeFileSync(WYJSCIE, doZapisu, "utf-8");
  console.log(
    `Zapisano ${WYJSCIE}: ${dane.zespoly.length} zespołów, ${dane.tabele.length} tabel, ` +
      `${dane.meczeSzts.length} meczów ŚZTS, ${dane.meczePzts.length} meczów PZTS, ` +
      `${dane.sklady?.length ?? 0} składów`,
  );
  return {
    szts: sztsBlad ? "blad" : "ok", pzts: pztsStan, zmieniono: true,
    zmiany: zmianyPelne, blad: sztsBlad, retry: opiszRetry(), korekty: opiszKorekty(),
    skladyOdczyt: SKLADY_ODCZYT_TS,
  };
}

// Osłona: main() TYLKO przy bezpośrednim uruchomieniu (bun scripts/sync_statyczny.ts),
// nie przy imporcie do testów (import.meta.main — konwencja buna/deno).
// Od v1.5.2 KAŻDA ścieżka wyjścia (sukces / bez zmian / awaria) zapisuje
// wpis do runs.json — panel na stronie odczytuje go zamiast API GitHuba.
// Od v1.6.1 (poziom 2): błąd jednego źródła = run CZERWONY (exit 1 PO zapisie
// runs.json i dane.json), żeby awaria była widoczna w historii Actions;
// workflow i tak commituje (krok Commit ma if:always()).
if (import.meta.main) {
  const startMs = Date.now();
  const startIso = () => new Date(startMs).toISOString();
  const czasTrwania = () => Math.round((Date.now() - startMs) / 1000);
  main()
    .then((w) => {
      const wpis: WpisRunu = {
        start: startIso(), czasS: czasTrwania(),
        szts: w.szts, pzts: w.pzts, zmieniono: w.zmieniono, zmiany: w.zmiany,
        blad: w.blad, retry: w.retry,
        skladyOdczyt: w.skladyOdczyt,
      };
      // pole jawne tylko gdy korekty wystąpiły (wsteczna zgodność runs.json)
      const korekty = opiszKorekty();
      if (korekty.length > 0) wpis.korekty = korekty;
      wpis.most = opiszMost();
      zapiszRun(wpis);
      // v1.6.1: awaria któregokolwiek źródła = świadomie czerwony run
      // (widoczny w Actions), ale dane i dziennik już zapisane.
      if (w.szts === "blad" || w.pzts === "blad-czytnika") process.exit(1);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("BŁĄD synchronizacji:", err);
      const wpis: WpisRunu = {
        start: startIso(), czasS: czasTrwania(),
        szts: FAZA_RUNU === "szts" ? "blad" : "ok",
        pzts: FAZA_RUNU === "pzts" ? "blad-czytnika" : "pominieto",
        zmieniono: false, zmiany: "—", blad: msg.slice(0, 300), retry: opiszRetry(),
        skladyOdczyt: SKLADY_ODCZYT_TS,
      };
      const korekty = opiszKorekty();
      if (korekty.length > 0) wpis.korekty = korekty;
      wpis.most = opiszMost();
      zapiszRun(wpis);
      process.exit(1);
    });
}
