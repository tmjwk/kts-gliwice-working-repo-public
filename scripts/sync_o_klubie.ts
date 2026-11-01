/**
 * sync_o_klubie.ts — treść sekcji „O klubie" z dokumentu Google (1.19.0).
 *
 * DECYZJA WŁAŚCICIELA (02.11): sekcja „O klubie" na stronie głównej ma być
 * LUSTREM dokumentu Google („O klubie" — tekst o historii klubu), z tym,
 * że na stronie widoczny jest PIERWSZY AKAPIT + „trójkącik" rozwijający
 * resztę (js/o-klubie.js). Właściciel edytuje WYŁĄCZNIE dokument — ten
 * skrypt (krok workflow sync-dane.yml, co 2 h) zapisuje o-klubie.json.
 *
 * ZASADY (wzorzec sync_sponsorzy.ts z 1.18.0):
 *  - źródło = eksport TXT dokumentu czytany bez logowania (dokument
 *    udostępniony „każdy z linkiem może wyświetlać"); zmiana uprawnień
 *    = automat przestaje widzieć treść, ale strona trzyma ostatni stan;
 *  - parser: eksport TXT to czysty tekst — sekcje rozdzielone liniami
 *    „____", nagłówek sekcji = pierwsza linia krótka bez kropki na końcu;
 *    tytuł dokumentu (WERSALIKI na starcie) pomijamy, bo sekcja strony
 *    ma własny nagłówek „O klubie"; punkty „* …" grupujemy w listy;
 *  - plik zapisujemy TYLKO przy realnej zmianie treści (bez szumu
 *    commitów co 2 h); pusty/zdegenerowany dokument NIE nadpisuje pliku
 *    — ochrona przed pomyłkowym opróżnieniem;
 *  - awaria (sieć, dokument, parsowanie) = ::warning i exit 0: „O klubie"
 *    nie może blokować synchronizacji ligowej ani czerwienić runu.
 *
 * Uruchomienie: bun scripts/sync_o_klubie.ts (z korzenia repo).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PLIK_WYJSCIOWY = "o-klubie.json";
const DOKUMENT_TXT =
  "https://docs.google.com/document/d/1biOs4WdUBvHiNA7WiuPVRTHoXNi-Bio79Qz6Olntgv0/export?format=txt";
const PROBY = 3;

interface ElementP {
  typ: "p" | "naglowek";
  tekst: string;
}
interface ElementUl {
  typ: "ul";
  punkty: string[];
}
type Element = ElementP | ElementUl;

interface Plik {
  wygenerowano: string;
  elementy: Element[];
}

/** Linia „nagłówkowa": krótka i bez końcowej kropki/pytajnika/wykrzyknika/dwukropka. */
function wygladaJakNaglowek(linia: string): boolean {
  return linia.length <= 80 && !/[.!?…:]$/.test(linia);
}

/** Tytuł dokumentu (pierwsza linia) = wersaliki, np. „KTS GLIWICE – O KLUBIE". */
function wygladaJakTytul(linia: string): boolean {
  if (!wygladaJakNaglowek(linia)) return false;
  const litery = linia.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, "");
  if (litery.length < 4) return false;
  const wielkie = linia.replace(/[^A-ZĄĆĘŁŃÓŚŹŻ]/g, "").length;
  return wielkie / litery.length >= 0.7;
}

function parsujDokument(surowy: string): Element[] {
  const tekst = surowy.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // sekcje rozdzielone liniami z samych podkreślników (________)
  const sekcje: string[][] = [];
  let biezaca: string[] = [];
  for (const linia of tekst.split("\n")) {
    if (/^_{4,}$/.test(linia.trim())) {
      sekcje.push(biezaca);
      biezaca = [];
    } else {
      biezaca.push(linia);
    }
  }
  sekcje.push(biezaca);

  const elementy: Element[] = [];
  sekcje.forEach((suroweLinie, nr) => {
    const linie = suroweLinie.map((l) => l.trim()).filter((l) => l.length > 0);
    if (linie.length === 0) return;

    let od = 0;
    if (nr === 0) {
      // pierwsza sekcja: linia 1 to tytuł dokumentu (wersaliki) — pomijamy
      if (wygladaJakTytul(linie[0])) od = 1;
    } else if (wygladaJakNaglowek(linie[0])) {
      elementy.push({ typ: "naglowek", tekst: linie[0] });
      od = 1;
    }

    let punkty: string[] | null = null; // aktualnie otwarta lista „* …"
    for (let i = od; i < linie.length; i++) {
      const l = linie[i];
      if (l.startsWith("* ")) {
        const t = l.slice(2).trim();
        if (!t) continue; // pusty punkt (artefakt „*” na końcu dokumentu)
        if (!punkty) {
          punkty = [];
          elementy.push({ typ: "ul", punkty });
        }
        punkty.push(t);
      } else {
        punkty = null; // lista przerwana zwykłym akapitem
        if (l === "*") continue; // samotny „*” bez treści — ignorujemy
        elementy.push({ typ: "p", tekst: l });
      }
    }
  });
  return elementy;
}

async function pobierzTxt(): Promise<string> {
  let ostatniBlad = "";
  for (let p = 1; p <= PROBY; p++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const r = await fetch(DOKUMENT_TXT, { signal: ac.signal, redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tekst = await r.text();
      // straż przed „ładnym” błędem Google (login/404 z treścią HTML):
      if (!tekst.includes("KTS")) throw new Error("odpowiedź bez „KTS” — to nie ten dokument?");
      return tekst;
    } catch (err) {
      ostatniBlad = err instanceof Error ? err.message : String(err);
      if (p < PROBY) await new Promise((w) => setTimeout(w, 2000 * p));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`dokument nieosiągalny po ${PROBY} próbach (${ostatniBlad})`);
}

async function main(): Promise<void> {
  const elementy = parsujDokument(await pobierzTxt());

  // straż przed opróżnieniem dokumentu: musi być treść (min. 1 element
  // i realna długość tekstu), inaczej NIE nadpisujemy pliku
  const dlugosc = elementy.reduce(
    (n, e) => n + (e.typ === "ul" ? e.punkty.join(" ").length : e.tekst.length),
    0,
  );
  if (elementy.length === 0 || dlugosc < 100) {
    throw new Error(`dokument podejrzanie krótki (${elementy.length} elementów, ${dlugosc} znaków) — nie nadpisuję pliku`);
  }

  const stary: Plik | null = existsSync(PLIK_WYJSCIOWY)
    ? (JSON.parse(readFileSync(PLIK_WYJSCIOWY, "utf-8")) as Plik)
    : null;
  if (stary && JSON.stringify(stary.elementy) === JSON.stringify(elementy)) {
    console.log(`„O klubie” bez zmian: ${elementy.length} elementów — nie zapisuję (brak commita).`);
    return;
  }
  writeFileSync(
    PLIK_WYJSCIOWY,
    JSON.stringify({ wygenerowano: new Date().toISOString(), elementy }, null, 2) + "\n",
    "utf-8",
  );
  const naglowki = elementy.filter((e) => e.typ === "naglowek").length;
  console.log(
    `„O klubie”: ${elementy.length} elementów (w tym ${naglowki} nagłówków, ` +
      `${elementy.filter((e) => e.typ === "ul").length} list)` +
      (stary ? ` (było: ${stary.elementy.length}) — zapisuję ${PLIK_WYJSCIOWY}` : ` — tworzę ${PLIK_WYJSCIOWY}`),
  );
}

main().catch((err: unknown) => {
  // Świadomie NIE czerwienimy runu: treść klubowa jest dodatkiem, liga ważniejsza.
  console.warn(`::warning::Sekcja „O klubie” pominięta — ${err instanceof Error ? err.message : String(err)}`);
});
