/**
 * ŚZTS (ligi.slzts.pl) — czysty rdzeń: pobieranie + parsowanie + dopasowanie.
 *
 * ZERO zależności (ani prisma, ani SDK) — używany w dwóch miejscach:
 *  1. aplikacja: src/lib/szts-sync.ts (zapis do bazy Prisma),
 *  2. hosting statyczny: download/static-hosting/scripts/sync_statyczny.ts
 *     (GitHub Actions generuje dane.json — kopia tego pliku leży w paczce).
 *
 * Struktura stron ligowych potwierdzona inspekcją 26.09.2026 (§4.16):
 *  - sekcja „Tabela ligowa": wiersze [pozycja, nazwa, M, Pkt, stosunek setów],
 *  - sekcja „Terminarz": wiersze [data + g. godzina + W: status,
 *    nr meczu + liga + kolejka, gospodarz, gość, wynik, „Szczegóły"],
 *    poniżej każdego meczu wiersz sędziego („SG:") — pomijany (brak daty).
 *
 * Znana wada serwisu ŚZTS: dane drużyn gubią polskie znaki ł/ą/ś/ż/ę/ź
 * (filtr latin1 po stronie SERWERA — „?” leży już w ich bajtach, potwierdzone
 * testem z dwoma UA i na sezonie 17; ó przetrwało, bo jest w latin-1).
 * Naprawiamy po naszej stronie mapą NAPRAWA_NAZW (28.09.2026): nazwy
 * zweryfikowane w sieci (slzts.pl/pzts.pl · Łabędzka, olza.pl · Dąbrowiak,
 * skarbek.tarnogorski.pl · Mysław; pozostałe — geografia Śląska).
 * Nieznane uszkodzenia zostają jawne („?” widoczne = sygnał do mapy).
 */

export interface WierszTabeli {
  pozycja: number;
  nazwa: string;
  mecze: number;
  punkty: number;
  stosunek: string; // bilans setów, np. "14:6"
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

/** Ligi klubu w sezonie 2026/27 — klucz = „sezon/grupa" z adresu ligi.slzts.pl. */
export const LIGI_SZTS: ReadonlyArray<{
  klucz: string;
  nazwa: string;
  url: string;
}> = [
  { klucz: "18/136", nazwa: "2. Liga Mężczyzn", url: "https://ligi.slzts.pl/liga/18/136/" },
  { klucz: "18/138", nazwa: "3. Liga Mężczyzn · gr. II", url: "https://ligi.slzts.pl/liga/18/138/" },
  { klucz: "18/142", nazwa: "4. Liga Mężczyzn · gr. IV", url: "https://ligi.slzts.pl/liga/18/142/" },
  { klucz: "18/144", nazwa: "2. Śląska Liga Amatorów", url: "https://ligi.slzts.pl/liga/18/144/" },
];

/**
 * Statystyki prób pobierania (v1.6.1 — poziom 1: retry+timeout w pobierzHtml).
 * Każde udane pobranie PO PONOWIE zapisuje się tutaj; sync_statyczny.ts
 * odczytuje tę listę przy budowie wpisu runs.json („sukces po 2. próbie"),
 * żeby pomiar „jak często błędy przejściowe" nie umarł razem z retry.
 */
export const STATYSTYKI_POBIERANIA: Array<{ url: string; proby: number }> = [];

/**
 * Pobiera stronę ligową (serwer deklaruje UTF-8; zdejmujemy BOM).
 *
 * v1.6.1 — wzór lustrzany z pobierzPztsPrzezJine (ścieżka PZTS, sprawdzona
 * produkcyjnie od 29.09): 3 próby, timeout 90 s, backoff 10 s / 20 s.
 * PONAWIAMY także przy podejrzanej treści: strona ligowa MUSI mieć sekcje
 * „Tabela ligowa" i „Terminarz" — 03.10 13:47 ŚZTS wydał stronę 3LM bez
 * tabeli (parsujTabele → 0 wierszy → run czerwony); dziś taki odczyt
 * NIE jest sukcesem, tylko błędem przejściowym wartym ponowienie.
 * Pełna awaria po 3 próbach = fail-loud jak dotychczas.
 */
export async function pobierzHtml(url: string, probyMax = 3): Promise<string> {
  let ostatniBlad: unknown = null;
  for (let i = 1; i <= probyMax; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "KTS-Gliwice-Sync/1.0 (strona klubowa; tabele ligowe)" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
      const tekst = (await res.text()).replace(/^\uFEFF/, "");
      if (!tekst.includes("Tabela ligowa") || !tekst.includes("Terminarz")) {
        throw new Error(`strona bez sekcji ligowych (${tekst.length} B) — przejściowa awaria ŚZTS?`);
      }
      if (i > 1) STATYSTYKI_POBIERANIA.push({ url, proby: i });
      return tekst;
    } catch (err) {
      ostatniBlad = err;
      if (i < probyMax) {
        console.warn(`pobierzHtml: próba ${i}/${probyMax} nieudana (${(err as Error).message}) — czekam ${10 * i} s`);
        await new Promise((r) => setTimeout(r, 10_000 * i)); // 10 s, 20 s
      }
    }
  }
  throw ostatniBlad ?? new Error(`nieznany błąd pobierania: ${url}`);
}

/** Czyni komórkę HTML znośnym tekstem (usuwa tagi, &nbsp;, białe znaki). */
function czystaKomorka(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapa naprawcza nazw drużyn z uszkodzonej bazy ŚZTS (serwer zamienia litery
 * spoza latin-1 na „?”). Klucz = nazwa dokładnie taka, jak ją widzi parser.
 * Utrzymywać ALFABETYCZNIE; po nowej uszkodzonej nazwie w danych → dopisać
 * wiersz (i odświeżyć kopie: paczka statyczna + working repo).
 */
const NAPRAWA_NAZW: Readonly<Record<string, string>> = {
  "AKS Miko?ów": "AKS Mikołów",
  "ATS Ligota ?ab?dzka": "ATS Ligota Łabędzka",
  "KS Mys?aw II Mys?owice": "KS Mysław II Mysłowice",
  "KS Mys?aw Mys?owice": "KS Mysław Mysłowice",
  "KU AZS UJD Cz?stochowa": "KU AZS UJD Częstochowa",
  "LITS Meble Anders ?ywiec": "LITS Meble Anders Żywiec",
  "LKS Ci??kowianka Jaworzno": "LKS Ciężkowianka Jaworzno",
  "LKS M?odo?? Rudno": "LKS Młodość Rudno",
  "LKS Naprzód ?wibie": "LKS Naprzód Świbie",
  "LKS Stra?ak II Miko?ów": "LKS Strażak II Mikołów",
  "LKS Stra?ak III Miko?ów": "LKS Strażak III Mikołów",
  "LKS Stra?ak Miko?ów": "LKS Strażak Mikołów",
  "LUKS W?gierska Górka": "LUKS Węgierska Górka",
  "LZS Chespa ?ywocice": "LZS Chespa Żywocice",
  "MKS Siemianowiczanka Siemianowice ?l.": "MKS Siemianowiczanka Siemianowice Śl.",
  "MKS Tajfun Ku?nia Raciborska": "MKS Tajfun Kuźnia Raciborska",
  "STS I ?ernica": "STS I Żernica",
  "STS II ?ernica": "STS II Żernica",
  "TKKF Aut ?agisza B?dzin": "TKKF Aut Łagisza Będzin",
  "UKS D?browiak D?browa Górnicza": "UKS Dąbrowiak Dąbrowa Górnicza",
  "UKS Ikar Mierz?cice": "UKS Ikar Mierzęcice",
  "UKS Wolej Solver II Ruda ?l?ska": "UKS Wolej Solver II Ruda Śląska",
  "UKS Wolej Solver III Ruda ?l?ska": "UKS Wolej Solver III Ruda Śląska",
  "UKS Wolej Solver Ruda ?l?ska": "UKS Wolej Solver Ruda Śląska",
  "ULKS P?awniowice": "ULKS Pławniowice",
  "ULKS Tajfun Ligota ?ab?dzka": "ULKS Tajfun Ligota Łabędzka",
};

/** Nazwa z ŚZTS → nazwa właściwa (mapa) albo bez zmian. */
export function naprawNazwe(nazwa: string): string {
  return NAPRAWA_NAZW[nazwa] ?? nazwa;
}

/** Parsuje sekcję „Tabela ligowa" na listę wierszy. */
export function parsujTabele(html: string): WierszTabeli[] {
  const start = html.indexOf("Tabela ligowa");
  if (start < 0) return [];
  const frag = html.slice(start, html.indexOf("</table>", start));
  const wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  const wynik: WierszTabeli[] = [];
  for (const w of wiersze) {
    const komorki = [...w.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map((m) => czystaKomorka(m[1]))
      .filter((c) => c !== "");
    // oczekiwany układ: ["8.", "KTS II Gliwice", "2", "2", "14:6"]
    if (komorki.length >= 5 && /^\d+\.$/.test(komorki[0])) {
      const pozycja = parseInt(komorki[0], 10);
      const nazwa = naprawNazwe(komorki[1]);
      const mecze = parseInt(komorki[komorki.length - 3], 10);
      const punkty = parseInt(komorki[komorki.length - 2], 10);
      const stosunek = komorki[komorki.length - 1];
      if (nazwa && Number.isFinite(pozycja) && Number.isFinite(mecze) && Number.isFinite(punkty)) {
        wynik.push({ pozycja, nazwa, mecze, punkty, stosunek });
      }
    }
  }
  return wynik;
}

/** Parsuje sekcję „Terminarz" na listę WSZYSTKICH meczów ligi (sezon + wyniki). */
export function parsujTerminarz(html: string): MeczLigi[] {
  const start = html.indexOf("Terminarz");
  if (start < 0) return [];
  const frag = html.slice(start, html.indexOf("</table>", start));
  const wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  const mecze: MeczLigi[] = [];
  for (const w of wiersze) {
    const data = w.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!data) continue; // nagłówek lub wiersz sędziego („SG: …")

    const godzina = w.match(/g\.\s*(\d{1,2}:\d{2})/)?.[1] ?? null;
    // kolejka: liczba tuż przed <br /> w kolumnie „nr | liga | kolejka"
    const kol = w.match(/<strong>\d+<\/strong>\s*<br>[^<]*?(\d+)\s*<br\s*\/?\s*>/);
    const kolejka = kol ? parseInt(kol[1], 10) : null;

    const komorki = [...w.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => czystaKomorka(m[1]))
      .filter((c) => c !== "");
    // wynik = komórka będąca czystym wynikiem („10:0" albo „-:-");
    // gospodarz i gość to dwie komórki przed nią (odporność na obecność linku)
    let idxWynik = -1;
    for (let i = 0; i < komorki.length; i++) {
      if (/^(\d+\s*:\s*\d+|-:-)$/.test(komorki[i])) idxWynik = i;
    }
    if (idxWynik < 2) continue;

    const wynik = komorki[idxWynik].replace(/\s+/g, "");
    const gospodarz = naprawNazwe(komorki[idxWynik - 2]);
    const gosc = naprawNazwe(komorki[idxWynik - 1]);
    if (!gospodarz || !gosc) continue;

    mecze.push({
      dataMeczu: data,
      godzina,
      kolejka,
      gospodarz,
      gosc,
      wynik,
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynik),
    });
  }
  return mecze;
}

/** Mecze, w których gra wskazana drużyna (porównanie nazw ze strony ŚZTS). */
export function meczeZespolu(mecze: MeczLigi[], nazwaSzts: string): MeczLigi[] {
  return mecze.filter((m) => m.gospodarz === nazwaSzts || m.gosc === nazwaSzts);
}

/**
 * Dopasowuje nasze zespoły (nazwy z panelu/bazy) do wierszy tabeli ŚZTS.
 * Zasady: kandydat musi zawierać „Gliwice"/„Krokus" (miasto), a tokeny
 * naszej nazwy (po usunięciu „Gliwice", „· amatorzy") muszą być podzbiorem
 * tokenów nazwy ŚZTS. Jednoznaczność wymagana — 0 lub >1 kandydatów pomijamy
 * (SyncLog notuje; panel docelowo podpowie kandydatów — jak discovery PZTS).
 */
export function dopasujZespoly(
  naszeNazwy: string[],
  tabela: WierszTabeli[],
): Array<{ nasza: string; szts: string }> {
  const normalizuj = (n: string): string[] =>
    n
      .toLowerCase()
      .replace("· amatorzy", "")
      .replace(/gliwice/g, " ")
      .replace(/[^a-z0-9ąćęłńóśźż ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);

  const pary: Array<{ nasza: string; szts: string }> = [];
  for (const nasza of naszeNazwy) {
    const tokeny = normalizuj(nasza);
    if (tokeny.length === 0) continue;
    const nasiKandydaci = tabela.filter((w) => {
      const n = w.nazwa.toLowerCase();
      if (!(n.includes("gliwice") || n.includes("krokus"))) return false;
      const t = new Set(normalizuj(w.nazwa));
      if (t.size === 0) return false;
      return tokeny.every((tok) => t.has(tok));
    });
    if (nasiKandydaci.length === 1) {
      pary.push({ nasza, szts: nasiKandydaci[0].nazwa });
    }
  }
  return pary;
}
