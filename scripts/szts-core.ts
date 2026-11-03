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

/**
 * Korekty godzin meczów — wiedza terenowa klubu vs błąd w źródle ŚZTS
 * (15.10.2026, Task 93). Źródło ligi.slzts.pl wystawia „19:15” przy
 * czwartkowych meczach DOMOWYCH KTS II Gliwice w 2LM (sezon 2026/27,
 * jedyna runda do 12.02.2027), a klub gra o 19:00 — potwierdzone przez
 * właściciela („do końca tej rundy grają o 19:00”; źródło ma niby
 * poprawić, ale na 15.10 nadal kłamie — weryfikacja curl-em).
 *
 * Klucz = „data|gospodarz|gość” (pełny identyfikator meczu — konwencja
 * klucza z sync_statyczny.ts), wartość = właściwa godzina.
 * Mapa jest SAMOWYGAJĄCA: klucze trzymają pełne daty, więc po końcu
 * sezonu (12.02.2027) i przy nowym sezonie nikt nie musi jej zdejmować.
 * Gdy ŚZTS poprawi źródło na 19:00, wpisy stają się no-op — można je
 * wtedy zdjąć przy okazji porządków.
 */
const KOREKTY_GODZIN: Readonly<Record<string, string>> = {
  "2026-10-22|KTS II Gliwice|GUKS Byczyna": "19:00",
  "2026-11-05|KTS II Gliwice|KTS Olimpijczyk Zawiercie": "19:00",
  "2026-12-03|KTS II Gliwice|MKS Skarbek II Tarnowskie Góry": "19:00",
  "2027-01-14|KTS II Gliwice|KS Naprzód II Borucin": "19:00",
  "2027-02-11|KTS II Gliwice|MUKS Jedynka Pszów": "19:00",
};

/**
 * Rejestr zastosowanych korekt (wypełnia parsujTerminarz przy każdym
 * przebiegu). sync_statyczny.ts odczytuje go przy budowie wpisu runs.json —
 * żeby stan „wiedza klubowa vs źródło" był JAWNY w dzienniku przebiegów:
 *  - zeZrodla ≠ korekta → korekta pracuje (źródło nadal kłamie),
 *  - zeZrodla = korekta → źródło przejęło prawdziwą godzinę — wpis można
 *    zdjąć z KOREKTY_GODZIN (korekta stała się no-op).
 * Konwencja lustrzana z STATYSTYKI_POBIERANIA (akumulacja w ramach procesu).
 */
export const KOREKTY_ZASTOSOWANE: Array<{
  data: string;
  gospodarz: string;
  gosc: string;
  zeZrodla: string | null;
  korekta: string;
}> = [];

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
    // ŚZTS oznacza mecze bez terminu datą zastępczą „2026-00-00"
    // (kolejki, których terminarz nie jest jeszcze ustalony). Takiego
    // meczu nie da się posortować ani wyświetlić — pomijamy; wróci
    // automatycznie, gdy źródło wpisze prawdziwą datę (a sync co 2 h
    // ją podchwyci). Bez tego wisi na pasku jako „Wynik w drodze ·
    // 00.00.2026" w nieskończoność (bug zgłoszony 10.10).
    if (/-00-00$/.test(data)) continue;

    const godzina = w.match(/g\.\s*(\d{1,2}:\d{2})/)?.[1] ?? null;
    // kolejka: liczba przed <br /> w kolumnie „nr | liga | kolejka".
    // Dwa formaty u źródła (1.26.5 — zgłoszenie właściciela 04.11: „przy
    // niektórych pozycjach listy brak numeru kolejki”; dotyczyło 2. Śląskiej
    // Ligi Amatorów, 18/144 — jedynej ligi z kolejka=null):
    //   2LM:  <strong>1</strong><br> 2LM … 1<br />          (sama liczba)
    //   2SLA: <strong>46</strong><br> 2SLA … 1/?LA<br />    (liczba + sufiks)
    // Stary wzorzec wymagał cyfr TUŻ PRZED <br/>, więc „1/?LA" nie łapało
    // się wcale (kolejka=null). Teraz po numerze dozwolone są znaki
    // NIEbędące cyfrą ani „<” ([^<\d]* — „/?LA” itp.), a cyfra przed
    // sufiksem pozostaje ostatnim „słowem liczbowym” przed <br/> —
    // w „2SLA … 1/?LA” to 1, nie 2 (ta dwójka jest zbyt daleko: między
    // nią a <br/> stoi cyfra 1). Ligi 2LM/3LM/4LM bez zmian (zweryfikowane
    // na zapisanych stronach: 120/120 i 45/45 trafień).
    const kol = w.match(/<strong>\d+<\/strong>\s*<br>[^<]*?(\d+)\s*[^<\d]*<br\s*\/?\s*>/);
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

    // korekta godzin (wiedza klubowa vs błąd źródła — patrz KOREKTY_GODZIN)
    const korekta = KOREKTY_GODZIN[`${data}|${gospodarz}|${gosc}`];
    if (korekta !== undefined) {
      KOREKTY_ZASTOSOWANE.push({ data, gospodarz, gosc, zeZrodla: godzina, korekta });
      if (korekta !== godzina) {
        console.log(`korekta godziny: ${data} ${gospodarz} vs ${gosc}: źródło ${godzina} → ${korekta} (wiedza klubowa)`);
      } else {
        console.log(`korekta zgodna ze źródłem: ${data} ${gospodarz} vs ${gosc}: ${korekta} — źródło przejęło wartość, wpis można zdjąć z KOREKTY_GODZIN`);
      }
    }

    mecze.push({
      dataMeczu: data,
      godzina: korekta ?? godzina,
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

/* ============================================================
 * v1.9.0: SKŁADY DRUŻYN (podstrony /druzyna/… na ligi.slzts.pl).
 * Struktura potwierdzona inspekcją 01.11.2026 (fixture 18/136/1480):
 * sekcja „Skład zespołu w sezonie 2026/2027" → tabela
 * [Nr licencji, Imię i nazwisko (link), Narodowość, Rok ur.,
 *  Zwycięstwa, Porażki, Punkty]. Wiersz nagłówkowy ma td.header-top.
 * Nazwiska dziedziczą wadę latin1 serwisu („?ukasz Strof") — naprawa
 * mapą NAPRAWA_IMION (konwencja lustrzana z NAPRAWA_NAZW; nowe
 * uszkodzenie = widoczne „?" = sygnał do dopisania wiersza).
 *
 * v1.9.1 (01.11.2026) — diagnoza kodowania + weryfikacja PZTS ISL.
 * Zapytano: czy „?" da się naprawić rozpoznaniem kodowania? NIE —
 * uszkodzenie NIE jest w transporcie: ligi.slzts.pl deklaruje UTF-8
 * i poprawnie koduje własne nagłówki („Imię i nazwisko"), a „?" to
 * dosłowny ASCII 0x3F już w bajtach strony — i w BAZIE: slugi URL
 * zawodników też mają „?" („/zawodnik/…/?ukasz-strof/"), tytuły
 * lig też („2. Liga M??czyzn"), i w sezonach 14–17 identycznie.
 * Rejestr litery jest zniszczony po stronie serwera — dekodowanie
 * niczego nie przywróci. Co ZA TO da się zrobić automatycznie:
 *  1) NAPRAWA_IMION — pełne nazwiska zweryfikowane w rejestrze PZTS
 *     ISL (isl.pzts.pl/api/licenses/playerLicenses — Cloudflare, ale
 *     czytelny przez renderujące czytniki; łącznik = nr licencji ŚZTS,
 *     który jest stabilnym ASCII i pokrywa się z numeracją PZTS;
 *     „Wi?a”→Wiża koryguje wcześniejszy wpis „Wiła” wg rejestru);
 *  2) naprawImiona — słownik imion z literami spoza latin-1
 *     (ó przetrwa w latin-1, więc go nie ruszamy); imiona to zamknięty
 *     zbiór, naprawa tylko przy JEDNOZNACZnym dopasowaniu maski;
 *     nie dotyczy ostatniego tokena (nazwisko — otwarty zbiór, tam
 *     tylko mapa + jawne „?" w logu syncu).
 * ============================================================ */

export interface ZawodnikSkladu {
  nazwisko: string;
  licencja: string | null;
  narodowosc: string | null;
  rok: number | null;
  zwyciestwa: number | null;
  porazki: number | null;
  punkty: string | null; // „33:9" — bilans pojedynków
  skutecznosc: string | null; // tylko PZTS („75%")
}

/**
 * Naprawa imion/nazwisk naszych zawodników (wada latin1 ŚZTS).
 * Klucz = nazwa dokładnie taka, jak ją widzi parser (z „?").
 * Wartości (poza odnotowanymi) zweryfikowane 01.11.2026 w rejestrze
 * PZTS ISL — 1:1 po numerze licencji ŚZTS (all "KTS Gliwice").
 * Utrzymywać ALFABETYCZNIE; nowe uszkodzone nazwisko = dopisać wiersz
 * (weryfikacja: isl.pzts.pl/api/licenses/playerLicenses po licencji,
 * ewentualnie klub/lokalne źródła dla amatorów bez licencji).
 */
const NAPRAWA_IMION: Readonly<Record<string, string>> = {
  "Adam Pasi?ski": "Adam Pasiński", // 11329
  "Andrzej ?amojda": "Andrzej Żamojda", // 11334
  "Artur Bia?ek": "Artur Białek", // 01591
  "Daniel ?asak": "Daniel Łasak", // amator bez licencji PZTS — weryfikacja klubowa
  "Grzegorz Macha?": "Grzegorz Machał", // 08890
  "Jakub D?browski": "Jakub Dąbrowski", // 08885
  "Jaros?aw Koz?owski": "Jarosław Kozłowski", // 08887
  "Jaros?aw Tomicki": "Jarosław Tomicki", // 01596
  "Marcin Macha?": "Marcin Machał", // 07756
  "Mariusz ??czycki": "Mariusz Łęczycki", // 11327
  "Micha? Bodnar": "Michał Bodnar", // 08882
  "Micha? Rosiek": "Michał Rosiek", // 08894
  "Miros?aw Soko?owski": "Mirosław Sokołowski", // 08895
  "Pawe? Kajdrowicz": "Paweł Kajdrowicz", // 11323
  "Pawe? Stefanów": "Paweł Stefanów", // 08897
  "Piotr ?agowski": "Piotr Łagowski", // 08889
  "Piotr Zem?a": "Piotr Zemła", // 08899
  "Rafa? Adach": "Rafał Adach", // 08881
  "Rafa? Opozda": "Rafał Opozda", // 08892
  "Roman Wi?a": "Roman Wiża", // 08898 — korekta: wcześniej „Wiła", rejestr PZTS mówi „Wiża"
  "Zdzis?aw Domeradzki": "Zdzisław Domeradzki", // amator; potwierdzenie: FB klubu (GP Gliwic 2019)
  "?ukasz Francka": "Łukasz Francka", // 11324
  "?ukasz Strof": "Łukasz Strof", // 01594
  "?ukasz Stopka": "Łukasz Stopka", // 11333
};

/**
 * Imiona z literami spoza latin-1 (ą ć ę ł ń ś ź ż — bez ó, które
 * uszkodzenie ŚZTS zostawia w spokoju). Zamknięty zbiór → naprawa
 * słownikowa jest deterministyczna. Każda maska (patrz maskaUszkodzenia)
 * musi w całym słowniku mieć dokładnie JEDNOKROTNY obraz — złote
 * reguły: „?ukasz”→Łukasz, „Micha?”→Michał, „Rafa?”→Rafał,
 * „Jaros?aw”→Jarosław, „Pawe?”→Paweł, „Zdzis?aw”→Zdzisław.
 */
const IMIONA_PL: ReadonlyArray<string> = [
  "Bartłomiej", "Błażej", "Bogusław", "Bogusława", "Bolesław", "Bożena",
  "Bronisław", "Czesław", "Elżbieta", "Grażyna", "Jarosław", "Łucja",
  "Łukasz", "Małgorzata", "Michał", "Mieczysław", "Miłosz", "Mirosława",
  "Mirosław", "Paweł", "Przemysław", "Radosław", "Rafał", "Sławomira",
  "Sławomir", "Stanisława", "Stanisław", "Wacława", "Wacław", "Wiesława",
  "Wiesław", "Władysław", "Włodzimierz", "Zdzisława", "Zdzisław", "Żaneta",
];

/** Odwzorowanie szkody ŚZTS: litery spoza latin-1 → „?" (ó zostaje). */
const maskaUszkodzenia = (s: string): string =>
  s.replace(/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g, "?");

/**
 * Słownikowa naprawa JEDNEGO tokenu (słowa). Warunek bezpieczeństwa:
 * maska tokenu pasuje do dokładnie jednego imienia ze słownika —
 * zero lub >1 trafień = token bez zmian („?" zostaje widoczne).
 * (Nazwiska — ostatni token — są celowo POMIJANE: otwarty zbiór,
 * pomyłka byłaby gorsza niż jawne „?"; naprawia ich tylko mapa.)
 */
export function naprawImie(token: string): string {
  if (!token.includes("?")) return token;
  const kandydaci = IMIONA_PL.filter((imie) => maskaUszkodzenia(imie) === token);
  return kandydaci.length === 1 ? kandydaci[0] : token;
}

/**
 * Naprawa pełnego wpisu „Imię [Drugie] Nazwisko": mapa pełnych nazwisk
 * (najwyżej priorytetu) → naprawa imion słownikowa (wszystkie tokeny
 * oprócz ostatniego). Nieznane uszkodzenia zostają jawne.
 */
export function naprawNazwiskoZawodnika(nazwaRaw: string): string {
  const zMapy = NAPRAWA_IMION[nazwaRaw];
  if (zMapy !== undefined) return zMapy;
  const tokeny = nazwaRaw.split(" ");
  if (tokeny.length < 2) return nazwaRaw;
  return tokeny
    .map((t, i) => (i === tokeny.length - 1 ? t : naprawImie(t)))
    .join(" ");
}

/** Parsuje sekcję „Skład zespołu" podstrony drużyny ŚZTS. */
export function parsujSklad(html: string): ZawodnikSkladu[] {
  const start = html.indexOf("Skład zespołu");
  if (start < 0) return [];
  const frag = html.slice(start, html.indexOf("</table>", start));
  const wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  // liczba ALBO null — 0 jest WARTOŚCIĄ (0 zwycięstw ≠ brak danych);
  // rok dodatkowo w sensownym zakresie (źródło ŚZTS wystawia „-0001"
  // dla zawodników bez roku ur. — artefakt zero-date, widoczny 01.11)
  const liczba = (s: string): number | null => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const rok = (s: string): number | null => {
    const n = liczba(s);
    return n !== null && n >= 1900 && n <= 2100 ? n : null;
  };

  const wynik: ZawodnikSkladu[] = [];
  for (const w of wiersze) {
    // POZYCYJNE komórki (bez filtrowania pustych — pusta wartość nie może
    // przesunąć kolumn; formatowanie: <td class=…>…</td> x 7)
    const komorki = [...w.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map((m) => czystaKomorka(m[1]));
    if (komorki.length !== 7) continue;
    // nagłówek: „Nr licencji | Imię i nazwisko | …" — pomijamy
    if (/^nr licencji$/i.test(komorki[0])) continue;
    const nazwaRaw = komorki[1];
    if (!nazwaRaw) continue; // pusty wiersz
    const nazwisko = naprawNazwiskoZawodnika(nazwaRaw);
    // jawność: nierozpoznane uszkodzenie zostaje widoczne i zgłoszone
    // w logu syncu (sygnał do weryfikacji w ISL i dopisania do mapy)
    if (nazwisko.includes("?")) {
      console.warn(`SKŁAD: nierozpoznane „?” w nazwisku „${nazwisko}” — ` +
        `dopisz do NAPRAWA_IMION (weryfikacja: isl.pzts.pl/api/licenses, ` +
        `klucz = nr licencji „${komorki[0] || "brak"}”)`);
    }
    wynik.push({
      nazwisko,
      licencja: /^\d{3,6}$/.test(komorki[0]) ? komorki[0] : null,
      narodowosc: komorki[2] || null,
      rok: rok(komorki[3]),
      zwyciestwa: liczba(komorki[4]),
      porazki: liczba(komorki[5]),
      punkty: /^\d+\s*:\s*\d+$/.test(komorki[6]) ? komorki[6].replace(/\s/g, "") : null,
      skutecznosc: null,
    });
  }
  return wynik;
}

/**
 * Mapa nazwa drużyny → adres podstrony /druzyna/… z sekcji „Tabela ligowa"
 * strony ligowej (tam nazwy drużyn są linkami). Klucz = nazwa PO naprawie
 * (naprawNazwe) — spójna z nazwami wierszy tabeli, po których dopasowujemy
 * nasze zespoły (dopasujZespoly → pary.nasza/szts).
 */
export function parsujLinkiDruzyn(html: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const start = html.indexOf("Tabela ligowa");
  if (start < 0) return mapa;
  const frag = html.slice(start, html.indexOf("</table>", start));
  for (const m of frag.matchAll(/<a[^>]+href="(\/druzyna\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const nazwa = naprawNazwe(czystaKomorka(m[2]));
    if (nazwa) mapa.set(nazwa, `https://ligi.slzts.pl${m[1]}`);
  }
  return mapa;
}

/**
 * Pobiera podstronę drużyny — LIGHTER niż pobierzHtml (liga):
 * 2 próby, timeout 30 s, walidacja obecności sekcji „Skład zespołu".
 * Składy mają TTL 12 h (sync_statyczny.ts), więc 7 podstron co 12 h
 * = 14 zapytań dziennie — łagodnie dla ligi.slzts.pl (bazowe obciążenie
 * to 48 zapytań o strony ligowe).
 */
export async function pobierzHtmlDruzyny(url: string, probyMax = 2): Promise<string> {
  let ostatniBlad: unknown = null;
  for (let i = 1; i <= probyMax; i++) {
    try {
      const res = await fetch(url, {
        // UA MUSI być czystym ASCII (polskie znaki w wartości nagłówka HTTP
        // = odrzucenie przez fetch; wykryte na runie 01.11 19:18 UTC)
        headers: { "User-Agent": "KTS-Gliwice-Sync/1.0 (klubowa strona; team rosters)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
      const tekst = (await res.text()).replace(/^\uFEFF/, "");
      if (!tekst.includes("Skład zespołu")) {
        throw new Error(`strona bez sekcji składu (${tekst.length} B) — przejściowa awaria ŚZTS?`);
      }
      return tekst;
    } catch (err) {
      ostatniBlad = err;
      if (i < probyMax) {
        console.warn(`pobierzHtmlDruzyny: próba ${i}/${probyMax} nieudana (${(err as Error).message}) — czekam ${10 * i} s`);
        await new Promise((r) => setTimeout(r, 10_000 * i));
      }
    }
  }
  throw ostatniBlad ?? new Error(`nieznany błąd pobierania: ${url}`);
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
