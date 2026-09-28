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
 *    Actions nie odczyta strony. Mecze 1. ligi przychodzą z zewnątrz:
 *    a) zmienna środowiskowa PZTS_MECZE (JSON — wklejany przy uruchomieniu
 *       ręcznym workflow_dispatch, np. wyeksportowany z warsztatu na z.ai),
 *    b) albo zostają zachowane z poprzedniego stanu dane.json.
 *
 * Uruchomienie:  bun scripts/sync_statyczny.ts
 *   (z katalogu głównego repo; wymaga bun albo: npx tsx scripts/sync_statyczny.ts)
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

const ZESPOLY = [
  { nazwa: "KTS Gliwice I", liga: "1. Liga Mężczyzn · gr. południowa", tryb: "PZTS · czytnik", url: "https://pzts.pl/rozgrywki-ligowe/druzyna/960/", ligaKlucz: null as string | null },
  { nazwa: "KTS II", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
  { nazwa: "KTS III", liga: "2. Liga Mężczyzn", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/136/", ligaKlucz: "18/136" },
  { nazwa: "KTS IV", liga: "3. Liga Mężczyzn · gr. II", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/138/", ligaKlucz: "18/138" },
  { nazwa: "KTS V", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KTS VI", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KA Krokus VII", liga: "4. Liga Mężczyzn · gr. IV", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/142/", ligaKlucz: "18/142" },
  { nazwa: "KTS Gliwice · amatorzy", liga: "2. Śląska Liga Amatorów", tryb: "ŚZTS · automat", url: "https://ligi.slzts.pl/liga/18/144/", ligaKlucz: "18/144" },
];

const WYJSCIE = process.env.DANE_WYJSCIE ?? "dane.json";

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

async function main() {
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

  // ===== 2. PZTS — z env (wklej) albo zachowaj ostatni znany stan =====
  let meczePzts: MeczPzts[] = [];
  let pztsSync: string | null = staryPlik?.ostatniSync?.pzts ?? null;
  if (process.env.PZTS_MECZE) {
    const zEnv = JSON.parse(process.env.PZTS_MECZE) as MeczLigi[];
    meczePzts = zEnv.map((m) => ({
      ...m,
      liga: "1. Liga Mężczyzn · gr. południowa",
      zespol: "KTS Gliwice I",
    }));
    pztsSync = teraz;
    console.log(`PZTS: przyjęto ${meczePzts.length} meczów ze zmiennej PZTS_MECZE`);
  } else if (staryPlik?.meczePzts) {
    meczePzts = staryPlik.meczePzts;
    console.log(`PZTS: zachowano ${meczePzts.length} meczów z poprzedniego pliku`);
  } else {
    console.log("PZTS: brak danych (przekaż PZTS_MECZE przy uruchomieniu ręcznym)");
  }

  // ===== 3. Skład danych + zapis =====
  const dane: Dane = {
    wygenerowano: teraz,
    sezon: SEZON,
    zespoly: ZESPOLY.map((z) => ({
      nazwa: z.nazwa,
      liga: z.liga,
      tryb: z.tryb,
      stan: z.nazwa === "KTS Gliwice I" ? bilansPzts(meczePzts) : stany.get(z.nazwa) ?? "—",
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
      return;
    }
  }
  writeFileSync(WYJSCIE, doZapisu, "utf-8");
  console.log(
    `Zapisano ${WYJSCIE}: ${dane.zespoly.length} zespołów, ${dane.tabele.length} tabel, ` +
      `${dane.meczeSzts.length} meczów ŚZTS, ${dane.meczePzts.length} meczów PZTS`,
  );
}

main().catch((err) => {
  console.error("BŁĄD synchronizacji:", err);
  process.exit(1);
});
