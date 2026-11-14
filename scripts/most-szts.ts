/**
 * MOST KTS→SLZTS (Apps Script v1.7.1) — adapter kanału gviz dla sync_statyczny.
 * ============================================================
 *
 * v2.0 (14.11.2026 — wdrożenie „nowej metody” jako podstawowej):
 *   - ŚZTS: czytajMostSzts() + mapujNaDaneSzts() — kanał GŁÓWNY syncu
 *     (KANAL_SZTS=most; scrape bezpośredni zostaje fallbackiem 1:1),
 *   - PZTS: czytajMostPzts() — zakładka „PZTS 1LM” (tabela + terminarz)
 *     + skład 1. drużyny z „Zawodników” (ze Skutecznością) — wchodzi
 *     PRZED starym mostem formułowym („Most KTS do PZTS”), który razem
 *     z czytnikiem jina zostaje fallbackiem,
 *   - anty-kolizja nazw (QA 14.11): w rejestrze „Drużyny” nazwa u źródła
 *     „KTS Gliwice” występuje DWA razy (2SLA amatorzy + PZTS 1LM) —
 *     mapowanie karta↔nazwa jest per SKRÓT LIGI meczu, nie globalne,
 *   - mecze PZTS (skrót „1LM”) z karty „Mecze KTS” NIE trafiają do
 *     meczeSzts (mają własny kanał PZTS) — filtrowane jawnie z uwagą,
 *   - parsujZawodnikow czyta Skuteczność (kolumna 9; tylko PZTS ma „75%”).
 *
 * Skoroszyt mostu (produkcyjny, udostępniony „każdy z linkiem”):
 *   https://docs.google.com/spreadsheets/d/1NQw7O2onyTsEo7DS_TCnmX8veS6rTafygCGwmNQ9Q0s
 *
 * Zakładki kontraktu (weryfikowane sygnaturą wiersza 1 — patrz niżej):
 *   „Liga 2LM / 3LM / 4LM / 2SLA” — tytuł, źródło+aktualizacja, TABELA
 *     LIGOWA (Pozycja|Drużyna|Mecze|Punkty|Sety), TERMINARZ
 *     (Data|Godzina|Kolejka|Gospodarz|Gość|Wynik|Nasz — „★” = mecz naszych);
 *   „PZTS 1LM” — tytuł, źródło+aktualizacja, TABELA LIGOWA
 *     (Pozycja|Drużyna|Mecze|Punkty|Z–R–P), TERMINARZ
 *     (Data|Godzina|Kolejka|Gospodarz|Gość|Wynik|Nasz „★”);
 *   „Mecze KTS” — kalendarz całego klubu
 *     (Data|Godzina|Liga|Kolejka|Gospodarz|Gość|Wynik|Rozegrany|Nasza drużyna,
 *     derby jako „KTS II Gliwice + KTS III Gliwice”; mecze PZTS: Liga „1LM”);
 *   „Drużyny” — rejestr (Karta (strona)|Nazwa u źródła|Liga|Skrót|Stan|
 *     URL podstrony drużyny|URL ligi);
 *   „Zawodnicy” — składy ze statystykami
 *     (Drużyna|Nazwisko|Licencja|Narodowość|Rok ur.|Zwycięstwa|Porażki|
 *     Punkty/Sety|Skuteczność) — łańcuch napraw znaków mostu w cenie;
 *   „Puls” — Wersja mostu | Ostatnie tyknięcie Zarządcy | Zapytania dziś
 *     (strażnik świeżości: Zarządca tyka co 15 min; v1.7.1: tyknięcie
 *     z SEKUNDAMI, jako tekst — format „YYYY-MM-DD HH:MM:SS”).
 *
 * QA (empirycznie, na żywym skoroszycie):
 *   - 12.11: kanał /d/{ID}/gviz/tq?tqx=out:csv&sheet=… działa dla wszystkich
 *     zakładek; publikacja /d/e/2PACX… NIE (oddaje wyłącznie pierwszą
 *     zakładkę, parametr &sheet= ignorowany) — nie używać;
 *   - 12.11: BEZ &headers=0 gviz auto-wykrywa nagłówki i ZJADA 2 pierwsze
 *     wiersze (Puls tracił licznik) — dlatego kanał zawsze z headers=0
 *     (mapowanie wiersz arkusza → wiersz CSV jest wtedy 1:1);
 *   - 12.11 + 20.10: gviz dla NIEISTNIEJĄCEJ zakładki oddaje PIERWSZĄ bez
 *     błędu — tożsamość każdej zakładki weryfikujemy sygnaturą wiersza 1;
 *   - 12.11: gviz potrafi oddać pustą odpowiedź w trakcie przeliczania —
 *     retry + cache-buster;
 *   - 14.11: tyknięcie Puls z sekundami (v1.7.1) parsuje się regexem
 *     wallNaMinuty bez zmian (sekundy ignorowane).
 *
 * Filozofia jak w moście PZTS (sync_statyczny v1.8+): gruby, testowalny
 * offline rdzeń (parsery + mapowanie na kontrakt dane.json) + cienkie
 * wpięcie w sync_statyczny (KANAL_SZTS=most/shadow/scrape, fallback na
 * scraping bezpośredni bez zmian). Moduł samowystarczalny (typy lustrzane
 * kontraktu szts-core — strukturalnie identyczne), bez importów.
 *
 * Deploy: plik ląduje w repo jako scripts/most-szts.ts OBOK
 * sync_statyczny.ts (import "./most-szts" — konwencja jak "./szts-core").
 */

/** ID skoroszytu mostu KTS→SLZTS (Apps Script v1.4.3+; PZTS od v1.5.0). */
export const MOST_SZTS_ID = "1NQw7O2onyTsEo7DS_TCnmX8veS6rTafygCGwmNQ9Q0s";

/** Kanał gviz — ZAWSZE z headers=0 (patrz QA wyżej). */
const GVIZ_SZTS =
  `https://docs.google.com/spreadsheets/d/${MOST_SZTS_ID}/gviz/tq?tqx=out:csv&headers=0`;

/** Klucz tabeli (LIGI_SZTS, „sezon/grupa”) → zakładka mostu. */
export const ZAKLADKI_LIG: Readonly<Record<string, string>> = {
  "18/136": "Liga 2LM",
  "18/138": "Liga 3LM",
  "18/142": "Liga 4LM",
  "18/144": "Liga 2SLA",
};

/** Skrót ligi z kolumny „Liga” karty Mecze KTS → klucz tabeli (ŚZTS). */
export const SKROT_NA_KLUCZ: Readonly<Record<string, string>> = {
  "2LM": "18/136",
  "3LM": "18/138",
  "4LM": "18/142",
  "2SLA": "18/144",
};

/**
 * Sygnatury tożsamości zakładek (prefiks wiersza 1) — anty-pułapka
 * „gviz oddaje pierwszą zakładkę” + detekcja zmiany układu mostu.
 */
const SYGNATURY: Readonly<Record<string, string>> = {
  "Liga 2LM": "2. Liga Mężczyzn",
  "Liga 3LM": "3. Liga Mężczyzn",
  "Liga 4LM": "4. Liga Mężczyzn",
  "Liga 2SLA": "2. Śląska Liga Amatorów",
  "PZTS 1LM": "1. Liga Mężczyzn",
  "Mecze KTS": "KALENDARZ MECZÓW KTS GLIWICE",
  "Drużyny": "DRUŻYNY KLUBU",
  "Zawodnicy": "ZAWODNICY",
  "Puls": "PULS MOSTU",
};

/* ====== Typy kontraktu (lustrzane szts-core / sync_statyczny) ====== */

export interface WierszTabeli {
  pozycja: number;
  nazwa: string;
  mecze: number;
  punkty: number;
  stosunek: string; // bilans setów, np. "64:16"
}

export interface MeczLigi {
  dataMeczu: string; // ISO "2026-09-21"
  godzina: string | null;
  kolejka: number | null;
  gospodarz: string;
  gosc: string;
  wynik: string; // "10:0" rozegrany / "-:-" zaplanowany
  rozegrany: boolean;
}

export interface ZawodnikSkladu {
  nazwisko: string; // „Imię Nazwisko” — jak parsujSklad (szts-core)
  licencja: string | null; // „01592” — ZEROWA POCZĄTKOWE MAJĄ ZOSTAĆ
  narodowosc: string | null;
  rok: number | null;
  zwyciestwa: number | null;
  porazki: number | null;
  punkty: string | null; // „33:9”
  skutecznosc: string | null; // tylko PZTS („75%”) — ŚZTS: null
}

/** Wiersz terminarza z zakładki ligowej — „★” w kolumnie „Nasz”. */
export interface MeczTerminarza extends MeczLigi {
  nasz: boolean;
}

/** Mecz z karty „Mecze KTS” (kalendarz całego klubu). */
export interface MeczKts extends MeczLigi {
  skrotLigi: string; // "2LM" … "2SLA" (ŚZTS) | "1LM" (PZTS)
  nasiSzts: string[]; // nazwy u źródła (nie karty!): ["KTS II Gliwice", …]
}

/** Wpis rejestru z karty „Drużyny”. */
export interface WpisRejestru {
  karta: string; // nazwa karty na stronie ("KTS II")
  nazwaSzts: string; // dokładna nazwa u źródła ("KTS II Gliwice")
  liga: string;
  skrot: string;
  stan: string; // „8. miejsce · 8 pkt”
  urlDruzyny: string;
  urlLigi: string;
}

export interface PulsMostu {
  wersja: string | null;
  tykniecieRaw: string | null; // „2026-11-14 01:59:27” (czas warszawski; v1.7.1 z sekundami)
  zapytania: string | null; // „100 / 350” (pierwsza linia — ŚZTS)
}

export interface SkladZMostu {
  zespol: string; // karta
  zrodlo: string;
  zaktualizowano: string; // ISO — anty-szum: nie ruszane przy identycznej treści
  zawodnicy: ZawodnikSkladu[];
}

/** Wiersz tabeli ligowej PZTS (lustrzany WierszTabeliPzts z sync_statyczny). */
export interface WierszTabeliPzts {
  pozycja: number;
  nazwa: string;
  mecze: number;
  zwyciestwa: number;
  remisy: number;
  porazki: number;
  pojedynki: string;
  punkty: number;
}

/** Pełny odczyt mostu — strona ŚZTS (po filtrach świeżości i spójności). */
export interface OdczytMostuSzts {
  puls: PulsMostu;
  /** Kolejność jak LIGI_SZTS przekazane do czytajMostSzts(). */
  ligi: Array<{ klucz: string; nazwa: string; zakladka: string; tabela: WierszTabeli[]; terminarz: MeczTerminarza[] }>;
  /** Tylko mecze ŚZTS (skróty 2LM/3LM/4LM/2SLA) — mecze PZTS („1LM”)
   *  są wyliczane w liczbaMeczyPzts i płyną własnym kanałem. */
  mecze: MeczKts[];
  /** Ile meczów PZTS (1LM) kalendarz zawiera (transparentność w uwagach). */
  liczbaMeczyPzts: number;
  rejestr: WpisRejestru[];
  /** karta → zawodnicy (może być pusta — karty brak = ostrzeżenie) */
  sklady: Map<string, ZawodnikSkladu[]>;
  /** np. „Zawodnicy: … — składów brak (nie krytyczne)” */
  skladyUwaga?: string;
}

/** Odczyt mostu — strona PZTS (zakładka „PZTS 1LM” + skład z „Zawodników”). */
export interface OdczytMostuPzts {
  puls: PulsMostu;
  tabela: WierszTabeliPzts[]; // stosunek = „Z-R-P” (kolumna4 tabeli strony)
  terminarz: MeczLigi[]; // wszystkie wiersze zakładki (most pisze tylko nasze)
  /** skład karty PZTS z „Zawodników” (ze Skutecznością); null = brak (nie krytyczne) */
  sklad: ZawodnikSkladu[] | null;
  skladUwaga?: string;
}

/* ====== Narzędzia CSV (port 1:1 z sync_statyczny — przetestowane) ====== */

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

/** Zdejmuje *pogrubienia* gviz („*KTS Gliwice*” → „KTS Gliwice”). */
export function bezGwiazdek(pole: string): string {
  return pole.replace(/\*/g, "").trim();
}

/* ====== Puls — strażnik świeżości ====== */

export function parsujPuls(wiersze: string[][]): PulsMostu {
  const pole = (prefiks: string): string | null => {
    for (const w of wiersze) {
      if ((w[0] ?? "").startsWith(prefiks)) return (w[1] ?? "").trim() || null;
    }
    return null;
  };
  return {
    wersja: pole("Wersja mostu"),
    tykniecieRaw: pole("Ostatnie tyknięcie Zarządcy"),
    zapytania: pole("Zapytania dziś"),
  };
}

/** Teraz w czasie warszawskim jako „YYYY-MM-DD HH:MM” (sv-SE = ISO-podobne). */
export function warszawaTeraz(terazMs: number = Date.now()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(terazMs));
}

/** „2026-11-14 01:59:27” → minuty od epoki (zegar ścienny; DST-agnostycznie). */
function wallNaMinuty(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

/** Minuty od tyknięcia Zarządcy (zegar ścienny Warszawy; null = nieprzeanalizowano). */
export function minutyOdTykniecia(
  puls: PulsMostu,
  terazWall: string = warszawaTeraz(),
): number | null {
  if (!puls.tykniecieRaw) return null;
  const a = wallNaMinuty(puls.tykniecieRaw);
  const b = wallNaMinuty(terazWall);
  if (a === null || b === null) return null;
  return Math.round(b - a);
}

/** Świeżość mostu: Zarządca tyka co 15 min; 60 min = 4 utracone tyknięcia. */
export function pulsSwiezy(puls: PulsMostu, maxMinut = 60, terazWall = warszawaTeraz()): boolean {
  const min = minutyOdTykniecia(puls, terazWall);
  return min !== null && min <= maxMinut; // min<0 = zegar w przód — traktujemy jako świeży
}

/* ====== Parsery zakładek ====== */

const LICZBA = (s: string): number | null => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
const ROK = (s: string): number | null => {
  const n = LICZBA(s);
  return n !== null && n >= 1900 && n <= 2100 ? n : null; // „-0001” ŚZTS → null
};
const ISO_DATA = /^\d{4}-\d{2}-\d{2}/;

/** Zakładka „Liga …”: TABELA LIGOWA + TERMINARZ (z gwiazdkami naszych). */
export function parsujLige(wiersze: string[][]): { tabela: WierszTabeli[]; terminarz: MeczTerminarza[] } {
  const iTabela = wiersze.findIndex((w) => w[0] === "Pozycja" && w[1] === "Drużyna");
  if (iTabela < 0) throw new Error("brak nagłówka „Pozycja|Drużyna” — zmiana układu zakładki Liga mostu?");

  const tabela: WierszTabeli[] = [];
  let i = iTabela + 1;
  while (i < wiersze.length && wiersze[i][0] !== "TERMINARZ") {
    const r = wiersze[i];
    const poz = LICZBA((r[0] ?? "").replace(/\./g, ""));
    const nazwa = bezGwiazdek(r[1] ?? "");
    if (poz !== null && poz > 0 && nazwa) {
      tabela.push({
        pozycja: poz,
        nazwa,
        mecze: LICZBA(r[2] ?? "") ?? 0,
        punkty: LICZBA(r[3] ?? "") ?? 0,
        stosunek: bezGwiazdek(r[4] ?? ""),
      });
    }
    i++;
  }
  if (tabela.length === 0) throw new Error("TABELA LIGOWA pusta (0 drużyn)");

  const iTerm = wiersze.findIndex((w) => w[0] === "Data" && w[1] === "Godzina");
  if (iTerm < 0) throw new Error("brak nagłówka TERMINARZ (Data|Godzina|…) — zmiana układu mostu?");

  const terminarz: MeczTerminarza[] = [];
  for (let j = iTerm + 1; j < wiersze.length; j++) {
    const r = wiersze[j];
    if (!ISO_DATA.test(r[0] ?? "")) continue; // notatki/puste
    const gospodarz = bezGwiazdek(r[3] ?? "");
    const gosc = bezGwiazdek(r[4] ?? "");
    if (!gospodarz || !gosc) continue;
    const wynikRaw = bezGwiazdek(r[5] ?? "");
    terminarz.push({
      dataMeczu: r[0].slice(0, 10),
      godzina: (r[1] ?? "").trim() || null,
      kolejka: LICZBA(r[2] ?? ""),
      gospodarz,
      gosc,
      wynik: wynikRaw || "-:-",
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynikRaw),
      nasz: (r[6] ?? "").includes("★"),
    });
  }
  return { tabela, terminarz };
}

/**
 * Zakładka „PZTS 1LM”: TABELA LIGOWA (Pozycja|Drużyna|Mecze|Punkty|Z–R–P)
 * + TERMINARZ (Data|Godzina|Kolejka|Gospodarz|Gość|Wynik|Nasz „★”).
 * Stosunek „6-0-0” rozbijany na Z/R/P (kontrakt jak parsujTabeleGviz).
 */
export function parsujLigePzts(wiersze: string[][]): { tabela: WierszTabeliPzts[]; terminarz: MeczLigi[] } {
  const iTabela = wiersze.findIndex((w) => w[0] === "Pozycja" && w[1] === "Drużyna");
  if (iTabela < 0) throw new Error("brak nagłówka „Pozycja|Drużyna” — zmiana układu zakładki PZTS 1LM mostu?");

  const tabela: WierszTabeliPzts[] = [];
  let i = iTabela + 1;
  while (i < wiersze.length && wiersze[i][0] !== "TERMINARZ") {
    const r = wiersze[i];
    const poz = LICZBA((r[0] ?? "").replace(/\./g, ""));
    const nazwa = bezGwiazdek(r[1] ?? "");
    const zrp = ((r[4] ?? "").trim().match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/));
    if (poz !== null && poz > 0 && nazwa) {
      tabela.push({
        pozycja: poz,
        nazwa,
        mecze: LICZBA(r[2] ?? "") ?? 0,
        zwyciestwa: zrp ? +zrp[1] : 0,
        remisy: zrp ? +zrp[2] : 0,
        porazki: zrp ? +zrp[3] : 0,
        pojedynki: "",
        punkty: LICZBA(r[3] ?? "") ?? 0,
      });
    }
    i++;
  }
  if (tabela.length === 0) throw new Error("PZTS 1LM: TABELA LIGOWA pusta (0 drużyn)");

  const iTerm = wiersze.findIndex((w) => w[0] === "Data" && w[1] === "Godzina");
  if (iTerm < 0) throw new Error("brak nagłówka TERMINARZ (Data|Godzina|…) — zmiana układu PZTS 1LM mostu?");

  const terminarz: MeczLigi[] = [];
  for (let j = iTerm + 1; j < wiersze.length; j++) {
    const r = wiersze[j];
    if (!ISO_DATA.test(r[0] ?? "")) continue;
    const gospodarz = bezGwiazdek(r[3] ?? "");
    const gosc = bezGwiazdek(r[4] ?? "");
    if (!gospodarz || !gosc) continue;
    const wynikRaw = bezGwiazdek(r[5] ?? "");
    terminarz.push({
      dataMeczu: r[0].slice(0, 10),
      godzina: (r[1] ?? "").trim() || null,
      kolejka: LICZBA(r[2] ?? ""),
      gospodarz,
      gosc,
      wynik: wynikRaw || "-:-",
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynikRaw),
    });
  }
  return { tabela, terminarz };
}

/** Karta „Mecze KTS” — kalendarz całego klubu (derby: „A + B”; PZTS: „1LM”). */
export function parsujMeczeKts(wiersze: string[][]): MeczKts[] {
  const iNagl = wiersze.findIndex((w) => w[0] === "Data" && w[2] === "Liga");
  if (iNagl < 0) throw new Error("brak nagłówka (Data|Godzina|Liga|…) — zmiana układu karty Mecze KTS?");
  const mecze: MeczKts[] = [];
  for (let j = iNagl + 1; j < wiersze.length; j++) {
    const r = wiersze[j];
    if (!ISO_DATA.test(r[0] ?? "")) continue;
    const gospodarz = bezGwiazdek(r[4] ?? "");
    const gosc = bezGwiazdek(r[5] ?? "");
    if (!gospodarz || !gosc) continue;
    const wynikRaw = bezGwiazdek(r[6] ?? "");
    const rozegrany = r[7] === "tak" || /^\d+\s*:\s*\d+$/.test(wynikRaw);
    const nasiSzts = bezGwiazdek(r[8] ?? "").split(/\s*\+\s*/).filter(Boolean);
    if (nasiSzts.length === 0) continue; // obcy mecz w kalendarzu? — nie nasz
    mecze.push({
      dataMeczu: r[0].slice(0, 10),
      godzina: (r[1] ?? "").trim() || null,
      kolejka: LICZBA(r[3] ?? ""),
      gospodarz,
      gosc,
      wynik: wynikRaw || "-:-",
      rozegrany,
      skrotLigi: bezGwiazdek(r[2] ?? ""),
      nasiSzts,
    });
  }
  return mecze;
}

/** Karta „Drużyny” — rejestr wiązań karta ↔ źródło (+ stan, URL-e). */
export function parsujDruzyny(wiersze: string[][]): WpisRejestru[] {
  const iNagl = wiersze.findIndex((w) => w[0] === "Karta (strona)" && w[1] === "Nazwa u źródła");
  if (iNagl < 0) throw new Error("brak nagłówka (Karta (strona)|Nazwa u źródła|…) — zmiana układu karty Drużyny?");
  const rejestr: WpisRejestru[] = [];
  for (let j = iNagl + 1; j < wiersze.length; j++) {
    const r = wiersze[j];
    const karta = bezGwiazdek(r[0] ?? "");
    const nazwaSzts = bezGwiazdek(r[1] ?? "");
    if (!karta || !nazwaSzts) continue;
    rejestr.push({
      karta,
      nazwaSzts,
      liga: bezGwiazdek(r[2] ?? ""),
      skrot: bezGwiazdek(r[3] ?? ""),
      stan: bezGwiazdek(r[4] ?? ""),
      urlDruzyny: (r[5] ?? "").trim(),
      urlLigi: (r[6] ?? "").trim(),
    });
  }
  return rejestr;
}

/** Karta „Zawodnicy” — składy per karta (semantyka = parsujSklad z szts-core). */
export function parsujZawodnikow(wiersze: string[][]): Map<string, ZawodnikSkladu[]> {
  const iNagl = wiersze.findIndex((w) => w[0] === "Drużyna" && w[1] === "Nazwisko");
  if (iNagl < 0) throw new Error("brak nagłówka (Drużyna|Nazwisko|…) — zmiana układu karty Zawodnicy?");
  const sklady = new Map<string, ZawodnikSkladu[]>();
  for (let j = iNagl + 1; j < wiersze.length; j++) {
    const r = wiersze[j];
    const karta = bezGwiazdek(r[0] ?? "");
    const nazwisko = bezGwiazdek(r[1] ?? "");
    if (!karta || !nazwisko) continue;
    const licencja = /^\d{3,6}$/.test((r[2] ?? "").trim()) ? (r[2] ?? "").trim() : null;
    const skut = ((r[8] ?? "").trim().match(/^(\d+)\s*%$/));
    const z: ZawodnikSkladu = {
      nazwisko,
      licencja,
      narodowosc: bezGwiazdek(r[3] ?? "") || null,
      rok: ROK(r[4] ?? ""),
      zwyciestwa: LICZBA(r[5] ?? ""),
      porazki: LICZBA(r[6] ?? ""),
      punkty: /^\d+\s*:\s*\d+$/.test(r[7] ?? "") ? (r[7] ?? "").replace(/\s/g, "") : null,
      skutecznosc: skut ? `${skut[1]}%` : null, // tylko PZTS („75%”)
    };
    const lista = sklady.get(karta) ?? [];
    lista.push(z);
    sklady.set(karta, lista);
  }
  return sklady;
}

/* ====== Kanał gviz (retry + cache-buster + weryfikacja tożsamości) ====== */

/** Wciskany pobieracz (testy offline podają własny; produkcja: fetch). */
export type Pobieracz = (url: string) => Promise<string>;

const DOMYSLNY_POBIERACZ: Pobieracz = async (url) => {
  const res = await fetch(url, {
    // nagłówki HTTP = czysty ASCII (bun odrzuca „Ś” i „→” — QA 12.11/14.11)
    headers: { "User-Agent": "KTS-Gliwice-Sync/2.0 (most KTS-SLZTS gviz)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`gviz HTTP ${res.status}`);
  return await res.text();
};

/**
 * Zakładka mostu przez gviz. Retry + cache-buster (gviz potrafi oddać
 * pustą odpowiedź w trakcie przeliczania — QA 20.10) + WERYFIKACJA
 * TOŻSAMOŚCI po sygnaturze wiersza 1 (pułapka „nieistniejąca zakładka →
 * pierwsza” — QA 12.11).
 */
export async function pobierzZakladkeMostuSzts(
  nazwa: string,
  opts: { pobieracz?: Pobieracz; proby?: number } = {},
): Promise<string[][]> {
  const sygnatura = SYGNATURY[nazwa];
  if (!sygnatura) throw new Error(`nieznana zakładka mostu: „${nazwa}”`);
  const pobieracz = opts.pobieracz ?? DOMYSLNY_POBIERACZ;
  const proby = opts.proby ?? 3;
  let ostatniBlad: unknown = null;
  for (let i = 1; i <= proby; i++) {
    const url = `${GVIZ_SZTS}&sheet=${encodeURIComponent(nazwa)}&_cb=${Date.now()}`;
    try {
      const wiersze = csvNaWiersze(await pobieracz(url));
      if (wiersze.length === 0 || wiersze.every((w) => w.every((c) => !c.trim())))
        throw new Error("gviz pusto (most się przelicza?)");
      const w1 = (wiersze[0]?.[0] ?? "").trim();
      if (!w1.startsWith(sygnatura))
        throw new Error(
          `niezgodna sygnatura „${nazwa}”: wiersz 1 = „${w1.slice(0, 50)}” (oczekiwano „${sygnatura}”) — ` +
            `zmiana układu mostu LUB gviz oddał inną zakładkę (przeliczanie)`,
        );
      return wiersze;
    } catch (err) {
      ostatniBlad = err;
      if (i < proby) await new Promise((r) => setTimeout(r, 5_000 * i));
    }
  }
  throw ostatniBlad ?? new Error("gviz: nieznany błąd");
}

/* ====== Złożenie kanałów ====== */

/**
 * Pełny odczyt mostu ŚZTS z filtrami świeżości i spójności:
 *  1. Puls (nieświeży → wyjątek, zanim cokolwiek pobierzemy);
 *  2. Drużyny (rejestr — pusty → wyjątek);
 *  3. Ligi (tabela + terminarz per klucz; pusta tabela → wyjątek);
 *  4. Mecze KTS (0 meczów → wyjątek; mniej niż ★ w terminarzach →
 *     partial read → wyjątek);
 *  5. Zawodnicy — TOLERANCYJNIE (brak/pomyłka = puste składy + uwaga,
 *     nie ubija kanału; składy to dodatek, nie fundament).
 */
export async function czytajMostSzts(
  ligi: ReadonlyArray<{ klucz: string; nazwa: string }>,
  opts: { pobieracz?: Pobieracz; swiezoscMinut?: number; terazWall?: string } = {},
): Promise<OdczytMostuSzts> {
  const pobierz = (nazwa: string) => pobierzZakladkeMostuSzts(nazwa, { pobieracz: opts.pobieracz });

  const puls = parsujPuls(await pobierz("Puls"));
  // samo-kontrola kanału: bez &headers=0 gviz skleja wiersze 1–2 i „Wersja
  // mostu” znika (QA 12.11) — lepiej to wyłapać tu, niż dziwić się pustym
  // wartościom dalej
  if (!puls.wersja)
    throw new Error("Puls bez „Wersja mostu” — kanał bez &headers=0 (gviz skleił wiersze 1–2) albo zmiana układu zakładki");
  if (!puls.tykniecieRaw)
    throw new Error("Puls: brak „Ostatnie tyknięcie Zarządcy” — zmiana układu zakładki Puls?");
  if (!pulsSwiezy(puls, opts.swiezoscMinut ?? 60, opts.terazWall)) {
    const min = minutyOdTykniecia(puls, opts.terazWall);
    throw new Error(`most śpi: tyknięcie ${puls.tykniecieRaw} (${min} min temu) — Zarządca nie działa?`);
  }

  const rejestr = parsujDruzyny(await pobierz("Drużyny"));
  if (rejestr.length === 0) throw new Error("Drużyny: rejestr pusty — most bez wiązań karta↔źródło");

  const wyniki: OdczytMostuSzts["ligi"] = [];
  for (const liga of ligi) {
    const zakladka = ZAKLADKI_LIG[liga.klucz];
    if (!zakladka) throw new Error(`brak mapowania zakładki mostu dla klucza „${liga.klucz}” — dopisz do ZAKLADKI_LIG`);
    const { tabela, terminarz } = parsujLige(await pobierz(zakladka));
    wyniki.push({ klucz: liga.klucz, nazwa: liga.nazwa, zakladka, tabela, terminarz });
  }

  const wszystkie = parsujMeczeKts(await pobierz("Mecze KTS"));
  if (wszystkie.length === 0) throw new Error("Mecze KTS: 0 meczów — pusta karta lub most się przelicza");
  const mecze = wszystkie.filter((m) => SKROT_NA_KLUCZ[m.skrotLigi] !== undefined);
  const liczbaMeczyPzts = wszystkie.length - mecze.length;
  if (mecze.length === 0) throw new Error("Mecze KTS: 0 meczów ŚZTS (same „1LM”?) — karta się przelicza?");
  const gwiazdki = wyniki.reduce((n, l) => n + l.terminarz.filter((t) => t.nasz).length, 0);
  if (mecze.length < gwiazdki)
    throw new Error(`partial read: Mecze KTS (ŚZTS) ${mecze.length} < „★” w terminarzach ${gwiazdki} — przeliczanie w trakcie`);

  let sklady = new Map<string, ZawodnikSkladu[]>();
  let skladyUwaga: string | undefined;
  try {
    const mapa = parsujZawodnikow(await pobierz("Zawodnicy"));
    if (mapa.size > 0) sklady = mapa;
    else skladyUwaga = "Zawodnicy: 0 zawodników — składów brak (nie krytyczne)";
  } catch (err) {
    skladyUwaga = `Zawodnicy: ${(err as Error).message} — składów brak (nie krytyczne)`;
  }

  return { puls, ligi: wyniki, mecze, liczbaMeczyPzts, rejestr, sklady, skladyUwaga };
}

/**
 * Odczyt mostu — strona PZTS (dla sync_statyczny, kanał (b0)):
 *  1. Puls (strażnik świeżości — wspólny z kanałem ŚZTS),
 *  2. „PZTS 1LM”: tabela (Z–R–P) + terminarz (most pisze wyłącznie nasze
 *     mecze — ale filtr „KTS Gliwice” zostawiamy po stronie wywołującego,
 *     semantyka jak w starym moście/czytniku),
 *  3. „Zawodnicy” → skład karty PZTS (ze Skutecznością) — TOLERANCYJNIE.
 */
export async function czytajMostPzts(
  opts: { pobieracz?: Pobieracz; kartaPzts?: string; swiezoscMinut?: number; terazWall?: string } = {},
): Promise<OdczytMostuPzts> {
  const kartaPzts = opts.kartaPzts ?? "KTS Gliwice I";
  const pobierz = (nazwa: string) => pobierzZakladkeMostuSzts(nazwa, { pobieracz: opts.pobieracz });

  const puls = parsujPuls(await pobierz("Puls"));
  if (!puls.wersja) throw new Error("Puls bez „Wersja mostu” — kanał bez &headers=0 albo zmiana układu zakładki");
  if (!puls.tykniecieRaw) throw new Error("Puls: brak „Ostatnie tyknięcie Zarządcy” — zmiana układu zakładki Puls?");
  if (!pulsSwiezy(puls, opts.swiezoscMinut ?? 60, opts.terazWall)) {
    const min = minutyOdTykniecia(puls, opts.terazWall);
    throw new Error(`most śpi: tyknięcie ${puls.tykniecieRaw} (${min} min temu) — Zarządca nie działa?`);
  }

  const { tabela, terminarz } = parsujLigePzts(await pobierz("PZTS 1LM"));
  if (tabela.length === 0) throw new Error("PZTS 1LM: tabela pusta (0 drużyn)");
  if (terminarz.length === 0) throw new Error("PZTS 1LM: terminarz pusty (0 meczów)");

  let sklad: ZawodnikSkladu[] | null = null;
  let skladUwaga: string | undefined;
  try {
    const mapa = parsujZawodnikow(await pobierz("Zawodnicy"));
    const lista = mapa.get(kartaPzts);
    if (lista && lista.length > 0) sklad = lista;
    else skladUwaga = `Zawodnicy: karta „${kartaPzts}” bez zawodników — skład PZTS pominięty (nie krytyczne)`;
  } catch (err) {
    skladUwaga = `Zawodnicy: ${(err as Error).message} — skład PZTS pominięty (nie krytyczne)`;
  }

  return { puls, tabela, terminarz, sklad, skladUwaga };
}

/* ====== Mapowanie na kontrakt dane.json (gruby rdzeń, testowalny) ====== */

export interface KartaMostu {
  karta: string; // ZESPOLY[].nazwa
  liga: string; // ZESPOLY[].liga (nazwa wyświetlana)
  ligaKlucz: string | null; // ZESPOLY[].ligaKlucz (ŚZTS) | "pzts/…"
}

export interface MapaMostu {
  /** Bez zaktualizowano — dokłada wywołujący (konwencja anti-szum). */
  tabele: Array<{ klucz: string; nazwa: string; wiersze: WierszTabeli[] }>;
  /** MeczSzts: MeczLigi + liga (nazwa) + zespoly (karty, kolejność ZESPOLY). */
  mecze: Array<MeczLigi & { liga: string; zespoly: string[] }>;
  stany: Map<string, string>;
  wierszeNasze: Map<string, string>;
  sklady: Map<string, SkladZMostu>;
  uwagi: string[];
}

export function mapujNaDaneSzts(
  o: OdczytMostuSzts,
  zespoly: ReadonlyArray<KartaMostu>,
  opts: { teraz: string; stareSklady?: ReadonlyMap<string, SkladZMostu> },
): MapaMostu {
  const uwagi: string[] = [];

  // v2 (QA 14.11 — anty-kolizja): „KTS Gliwice” w rejestrze oznacza raz
  // amatorów 2SLA, raz 1. drużynę PZTS — mapowanie karta↔nazwa MUSI być
  // per SKRÓT LIGI meczu, nie globalne (globalne przypisywało mecze 2SLA
  // karcie PZTS, bo ta jest później w rejestrze).
  const kartaPoSkrocie = new Map<string, Map<string, string>>();
  for (const r of o.rejestr) {
    if (!kartaPoSkrocie.has(r.skrot)) kartaPoSkrocie.set(r.skrot, new Map());
    kartaPoSkrocie.get(r.skrot)!.set(r.nazwaSzts, r.karta);
  }
  const nazwaLigi = new Map(o.ligi.map((l) => [l.klucz, l.nazwa]));
  const kolejnoscKart = new Map(zespoly.map((z, i) => [z.karta, i]));

  const tabele = o.ligi.map((l) => ({ klucz: l.klucz, nazwa: l.nazwa, wiersze: l.tabela }));

  const mecze: MapaMostu["mecze"] = [];
  for (const m of o.mecze) {
    const klucz = SKROT_NA_KLUCZ[m.skrotLigi];
    if (!klucz) continue; // defensywnie (czytajMostSzts już odfiltrował)
    const liga = nazwaLigi.get(klucz)
      ?? o.rejestr.find((r) => r.skrot === m.skrotLigi)?.liga
      ?? m.skrotLigi;
    const mapaSkrotu = kartaPoSkrocie.get(m.skrotLigi);
    const zespolyMeczu = m.nasiSzts.map((n) => {
      const karta = mapaSkrotu?.get(n);
      if (!karta) uwagi.push(`brak karty dla nazwy „${n}” w lidze ${m.skrotLigi} (mecz ${m.dataMeczu})`);
      return karta ?? n;
    });
    // kolejność kart jak ZESPOLY (kosmetyka zgodna ze starym kanałem —
    // mniej szumu w diff po przełączeniu źródła)
    zespolyMeczu.sort((a, b) => (kolejnoscKart.get(a) ?? 99) - (kolejnoscKart.get(b) ?? 99));
    mecze.push({
      dataMeczu: m.dataMeczu, godzina: m.godzina, kolejka: m.kolejka,
      gospodarz: m.gospodarz, gosc: m.gosc, wynik: m.wynik, rozegrany: m.rozegrany,
      liga, zespoly: zespolyMeczu,
    });
  }
  if (o.liczbaMeczyPzts > 0)
    uwagi.push(`${o.liczbaMeczyPzts} meczów PZTS (1LM) z kalendarza pominiętych — płyną własnym kanałem (meczePzts)`);

  const stany = new Map<string, string>();
  const wierszeNasze = new Map<string, string>();
  for (const r of o.rejestr) {
    if (!SKROT_NA_KLUCZ[r.skrot]) continue; // karta PZTS — stan płynie kanałem PZTS
    stany.set(r.karta, r.stan || "—");
    wierszeNasze.set(r.karta, r.nazwaSzts);
  }

  const sklady = new Map<string, SkladZMostu>();
  for (const z of zespoly) {
    if (z.ligaKlucz === null || z.ligaKlucz.startsWith("pzts")) continue; // tylko ŚZTS
    const zawodnicy = o.sklady.get(z.karta);
    if (!zawodnicy || zawodnicy.length === 0) {
      uwagi.push(`skład karty „${z.karta}” nieodczytany z mostu — trzymam stary`);
      continue;
    }
    const urlDruzyny = o.rejestr.find((r) => r.karta === z.karta)?.urlDruzyny ?? "";
    const stary = opts.stareSklady?.get(z.karta);
    // anti-szum (konwencja z sync_statyczny): identyczna treść = NIE ruszamy
    // zaktualizowano — dane.json bez realnej zmiany nie generuje commita
    if (stary && stary.zrodlo === urlDruzyny && JSON.stringify(stary.zawodnicy) === JSON.stringify(zawodnicy)) {
      sklady.set(z.karta, stary);
    } else {
      sklady.set(z.karta, { zespol: z.karta, zrodlo: urlDruzyny, zaktualizowano: opts.teraz, zawodnicy });
    }
  }

  return { tabele, mecze, stany, wierszeNasze, sklady, uwagi };
}

/* ====== Shadow: diff most ↔ direct (bez publikacji) ====== */

export interface DiffMostu {
  tabeleRozne: number;
  meczeRozne: number;
  meczeTylkoDirect: number;
  meczeTylkoMost: number;
  skladyRozne: number;
}

/** Porównanie danych z mostu z danymi z kanału bezpośredniego (shadow). */
export function porownajZMostem(
  mapa: MapaMostu,
  bezposrednie: {
    tabele: ReadonlyArray<{ klucz: string; wiersze: unknown[] }>;
    meczeSzts: ReadonlyArray<MeczLigi & { liga: string; zespoly: string[] }>;
    sklady?: ReadonlyArray<SkladZMostu>;
  },
): DiffMostu {
  let tabeleRozne = 0;
  const poKluczu = new Map(bezposrednie.tabele.map((t) => [t.klucz, t]));
  for (const t of mapa.tabele) {
    const d = poKluczu.get(t.klucz);
    if (!d || JSON.stringify(d.wiersze) !== JSON.stringify(t.wiersze)) tabeleRozne++;
  }
  for (const k of poKluczu.keys()) if (!mapa.tabele.some((t) => t.klucz === k)) tabeleRozne++;

  const kluczM = (m: MeczLigi) => `${m.dataMeczu}|${m.gospodarz}|${m.gosc}`;
  const directM = new Map(bezposrednie.meczeSzts.map((m) => [kluczM(m), m]));
  const mostM = new Map(mapa.mecze.map((m) => [kluczM(m), m]));
  let meczeRozne = 0, tylkoDirect = 0, tylkoMost = 0;
  for (const [k, m] of mostM) {
    const d = directM.get(k);
    if (!d) { tylkoMost++; continue; }
    // zespoly porównujemy jako ZBIÓR (kolejność kart w derby bywa różna
    // między kanałami — kosmetyka, nie dane; QA 12.11)
    if (d.wynik !== m.wynik || d.rozegrany !== m.rozegrany || d.godzina !== m.godzina || d.kolejka !== m.kolejka
      || JSON.stringify([...d.zespoly].sort()) !== JSON.stringify([...m.zespoly].sort())) meczeRozne++;
  }
  for (const k of directM.keys()) if (!mostM.has(k)) tylkoDirect++;

  let skladyRozne = 0;
  if (bezposrednie.sklady) {
    const dSkl = new Map(bezposrednie.sklady.map((s) => [s.zespol, s]));
    for (const [karta, s] of mapa.sklady) {
      const d = dSkl.get(karta);
      if (!d || JSON.stringify(d.zawodnicy) !== JSON.stringify(s.zawodnicy)) skladyRozne++;
    }
  }

  return { tabeleRozne, meczeRozne, meczeTylkoDirect, meczeTylkoMost, skladyRozne };
}
