/**
 * sync_sponsorzy.ts — sponsorzy i partnerzy z arkusza Google (1.18.0).
 *
 * DECYZJA WŁAŚCICIELA (Q11, 02.11): sekcja „Sponsorzy i partnerzy" na
 * stronie głównej żyje z arkusza Google właściciela (kolumny: LP · Nazwa ·
 * URL · Logo URL · Aktywny Tak/Nie · Kategoria). Właściciel edytuje
 * WYŁĄCZNIE arkusz — ten skrypt (krok workflow sync-dane.yml) co 2 h
 * zapisuje sponsorzy.json, a js/sponsorzy.js rysuje z niego kafelki.
 *
 * ZASADY:
 *  - źródło = eksport CSV arkusza czytany bez logowania (arkusz udostępniony
 *    „każdy z linkiem może wyświetlać"); zmiana uprawnień arkusza = automat
 *    przestaje widzieć dane, ale strona trzyma ostatni zapisany stan;
 *  - do pliku trafiają TYLKO wiersze z nazwą i „Aktywny = Tak", posortowane
 *    po LP; „Nie" = podmiot znika z sekcji bez kasowania danych — wraca
 *    po przestawieniu na „Tak" (wiersz 7 arkusza to świadomy szablon);
 *  - 1.23.1 (decyzja właściciela 02.11): WSZYSCY nieaktywni po udanym
 *    odczycie arkusza = świadomy stan → zapisujemy PUSTĄ listę, a
 *    js/sponsorzy.js ukrywa wtedy całą sekcję na stronie (pusta sekcja
 *    z samym nagłówkiem byłaby nieaktualna). Błąd komunikacji z Google
 *    (sieć, HTTP, brak nagłówka „Nazwa") to co innego: plik ZOSTAJE
 *    nietknięty aż do następnego udanego połączenia — ostatni znany
 *    stan jest lepszy niż pustka z przypadku;
 *  - kolumna „Kategoria" (np. „Sponsorzy Sprzętowi") trafia do JSON-a,
 *    choć układ jest płaski — gotowe pod ewentualne grupowanie później;
 *  - loga ładuje HOTLINKIEM przeglądarka gościa (decyzja właściciela).
 *    Jeden wyimek kosmetyczny: hosty *.wp.com (Jetpack CDN) potrafią
 *    zwrócić węższy wariant tego samego pliku — dla w=NNN > 480 przepisujemy
 *    na w=480 (POLTING: ~28 KB → ~8 KB; ten sam serwer, ta sama treść,
 *    a przy odmowie kafelka i tak degraduje się do nazwy tekstowej);
 *  - plik zapisujemy TYLKO przy realnej zmianie listy (bez szumu commitów
 *    co 2 h) — w tym przy przejściu w stan „0 aktywnych" i z powrotem;
 *  - awaria (sieć, arkusz, parsowanie) = ::warning i exit 0: sponsorzy
 *    nie mogą blokować synchronizacji ligowej ani czerwonić runu.
 *
 * Uruchomienie: bun scripts/sync_sponsorzy.ts (z korzenia repo).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// env = wyłącznie do testów lokalnych (scenariusze na własnym serwerze);
// w Actions działają wartości domyślne
const PLIK_WYJSCIOWY = process.env.KTS_SPONSORZY_PLIK ?? "sponsorzy.json";
const ARKUSZ_CSV =
  process.env.KTS_SPONSORZY_URL ??
  "https://docs.google.com/spreadsheets/d/1i6MSD8EJzc5MRMsnm6Ur07Biunjxulcd_KXEaeU0LNQ/export?format=csv&gid=0";
const PROBY = 3;

interface Sponsor {
  lp: number | null;
  nazwa: string;
  url: string;
  logo: string;
  kategoria: string | null;
}

interface Plik {
  wygenerowano: string;
  sponsorzy: Sponsor[];
}

/** Parser CSV z pełną obsługą pól w cudzysłowach (przecinki, nowe linie, ""). */
function parsujCsv(tekst: string): string[][] {
  const wiersze: string[][] = [];
  let wiersz: string[] = [];
  let pole = "";
  let cudzyslow = false;
  for (let i = 0; i < tekst.length; i++) {
    const z = tekst[i];
    if (cudzyslow) {
      if (z === '"') {
        if (tekst[i + 1] === '"') { pole += '"'; i++; } else cudzyslow = false;
      } else pole += z;
    } else if (z === '"') cudzyslow = true;
    else if (z === ",") { wiersz.push(pole); pole = ""; }
    else if (z === "\n") { wiersz.push(pole); wiersze.push(wiersz); wiersz = []; pole = ""; }
    else if (z !== "\r") pole += z;
  }
  if (pole !== "" || wiersz.length > 0) { wiersz.push(pole); wiersze.push(wiersz); }
  return wiersze;
}

/** Jetpack CDN (*.wp.com): w=2000 → w=480 — ten sam hotlink, ~6× lżejszy. */
function optymalizujLogo(url: string): string {
  try {
    const u = new URL(url);
    const w = Number(u.searchParams.get("w"));
    if (u.hostname.endsWith(".wp.com") && Number.isFinite(w) && w > 480) {
      u.searchParams.set("w", "480");
      return u.toString();
    }
  } catch { /* nieprawidłowy URL — zostawiamy dokładnie taki, jaki jest */ }
  return url;
}

async function pobierzCsv(): Promise<string> {
  let ostatniBlad = "";
  for (let p = 1; p <= PROBY; p++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const r = await fetch(ARKUSZ_CSV, { signal: ac.signal, redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tekst = await r.text();
      if (!tekst.includes("Nazwa")) throw new Error("odpowiedź bez nagłówka „Nazwa” — to nie ten arkusz?");
      return tekst;
    } catch (err) {
      ostatniBlad = err instanceof Error ? err.message : String(err);
      if (p < PROBY) await new Promise((w) => setTimeout(w, 2000 * p));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`arkusz nieosiągalny po ${PROBY} próbach (${ostatniBlad})`);
}

function mapujWiersze(wiersze: string[][]): Sponsor[] {
  const wynik: Sponsor[] = [];
  wiersze.slice(1).forEach((w) => {
    const nazwa = (w[1] ?? "").trim();
    if (!nazwa) return; // puste wiersze szablonowe (LP bez nazwy) pomijamy
    if ((w[4] ?? "").trim().toLowerCase() !== "tak") return; // Aktywny = Nie → poza sekcją
    const lpRaw = (w[0] ?? "").trim();
    wynik.push({
      lp: lpRaw !== "" && Number.isFinite(Number(lpRaw)) ? Number(lpRaw) : null,
      nazwa,
      url: (w[2] ?? "").trim(),
      logo: optymalizujLogo((w[3] ?? "").trim()),
      kategoria: (w[5] ?? "").trim() || null,
    });
  });
  // LP rosnąco; brak LP → na koniec, w kolejności z arkusza (indeks jako tiebreak)
  return wynik
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.lp ?? 9999) - (b.s.lp ?? 9999) || a.i - b.i)
    .map((x) => x.s);
}

async function main(): Promise<void> {
  // błąd W TYM WIERSZU = wyłącznie komunikacja (sieć / HTTP / arkusz bez
  // nagłówka „Nazwa") — main().catch() zostawia plik nietknięty aż do
  // następnego udanego połączenia (decyzja właściciela 02.11)
  const sponsorzy = mapujWiersze(parsujCsv(await pobierzCsv()));

  // 1.23.1: 0 aktywnych po UDANYM odczycie to NIE błąd, tylko świadome
  // wyłączenie wszystkich sponsorów w arkuszu — zapisujemy pustą listę,
  // a js/sponsorzy.js ukrywa wtedy całą sekcję na stronie. Ochrona przed
  // pomyłkowym opróżnieniem arkusza zostaje poziom wyżej: odpowiedź bez
  // nagłówka „Nazwa" nie przechodzi przez pobierzCsv() i listy nie czyści.
  const stary: Plik | null = existsSync(PLIK_WYJSCIOWY)
    ? (JSON.parse(readFileSync(PLIK_WYJSCIOWY, "utf-8")) as Plik)
    : null;
  if (stary && JSON.stringify(stary.sponsorzy) === JSON.stringify(sponsorzy)) {
    console.log(sponsorzy.length === 0
      ? "Sponsorzy: 0 aktywnych (stan niezmienny) — nie zapisuję (brak commita)."
      : `Sponsorzy bez zmian: ${sponsorzy.length} aktywnych — nie zapisuję (brak commita).`);
    return;
  }
  writeFileSync(PLIK_WYJSCIOWY, JSON.stringify({ wygenerowano: new Date().toISOString(), sponsorzy }, null, 2) + "\n", "utf-8");
  console.log(
    sponsorzy.length === 0
      ? `Sponsorzy: 0 aktywnych — czyszczę listę, sekcja zniknie ze strony (było: ${stary?.sponsorzy.length ?? 0})`
      : `Sponsorzy: ${sponsorzy.length} aktywnych (${sponsorzy.map((s) => s.nazwa).join(", ")})` +
          (stary ? ` (było: ${stary.sponsorzy.length}) — zapisuję ${PLIK_WYJSCIOWY}` : ` — tworzę ${PLIK_WYJSCIOWY}`),
  );
}

main().catch((err: unknown) => {
  // Świadomie NIE czerwienimy runu: sponsorzy są dodatkiem, liga ważniejsza.
  console.warn(`::warning::Sponsorzy pominięci — ${err instanceof Error ? err.message : String(err)}`);
});
