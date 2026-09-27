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
 * Znana wada serwisu ŚZTS: dane drużyn gubią polskie znaki ł/ż/ź/ę (filtr
 * latin1 po stronie serwera — potwierdzone testem z dwoma różnymi UA).
 * Nazwy drużyn KTS Gliwice są czyste; problem jest kosmetyczny (niektórzy
 * przeciwnicy mają „?" w nazwie) i dotyczy wyłącznie wyświetlania.
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

/** Pobiera stronę ligową (serwer deklaruje UTF-8; zdejmujemy BOM). */
export async function pobierzHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "KTS-Gliwice-Sync/1.0 (strona klubowa; tabele ligowe)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  const tekst = await res.text();
  return tekst.replace(/^\uFEFF/, "");
}

/** Czyni komórkę HTML znośnym tekstem (usuwa tagi, &nbsp;, białe znaki). */
function czystaKomorka(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      const nazwa = komorki[1];
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
    const gospodarz = komorki[idxWynik - 2];
    const gosc = komorki[idxWynik - 1];
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
