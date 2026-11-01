/**
 * licznik_galerii.ts — licznik zdjęć CAŁEJ galerii (zakładka „Zdjęcia" FB).
 *
 * DECYZJA WŁAŚCICIELA (1.11): badge galerii na stronie głównej ma pokazywać,
 * ile zdjęć jest w CAŁEJ galerii (2012–…), liczone automatycznie — zdjęć
 * stale przybywa. Pełne policzenie = przejście całego stronicowania
 * (~14 stron × 1000 rekordów), więc robi to BOT (ten skrypt, krok workflow
 * sync-dane.yml), a nie przeglądarka gościa. Wynik: galeria-licznik.json
 * w korzeniu repo — strona główna czyta go w js/app.js.
 *
 * ZASADY:
 *  - token czytany z js/galeria-fb-core.js (ten sam publiczny token read-only
 *    co lustra galerii; alternatywnie env FB_GALERIA_TOKEN);
 *  - liczymy /photos?type=uploaded (dokładnie zakładka „Zdjęcia" fanpage'a),
 *    fields=id,created_time, limit=1000, CAŁE stronicowanie — summary
 *    Graph API bywa nieprawdziwe (cap 10 000; per-rok 2019–2021 mylił się
 *    o 50–80%), więc liczymy uczciwie po rekordach;
 *  - plik zapisujemy TYLKO przy zmianie liczby/zakresu lat (aktualizacja
 *    to znacznik czasu, nie powód do commita — inaczej szum co 2 h);
 *  - awaria (FB, sieć, parsowanie) = ostrzeżenie i exit 0: licznik nie może
 *    blokować synchronizacji ligowej ani czerwonić runu; strona trzyma
 *    ostatnią znaną wartość.
 *
 * Uruchomienie: bun scripts/licznik_galerii.ts (z korzenia repo).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PLIK_WYJSCIOWY = "galeria-licznik.json";
const RDZEN_FB = "js/galeria-fb-core.js";
const API = "https://graph.facebook.com/v22.0";
const MAX_STRON = 60; // bezpiecznik: 60 × 1000 = 60 000 zdjęć

interface Licznik {
  zdjecia: number;
  od: number | null;
  do: number | null;
  aktualizacja: string;
}

function czytajToken(): { pageId: string; token: string } {
  try {
    const js = readFileSync(RDZEN_FB, "utf-8");
    const t = js.match(/ACCESS_TOKEN\s*=\s*"([^"]+)"/);
    const p = js.match(/PAGE_ID\s*=\s*"([^"]+)"/);
    if (t && p) return { pageId: p[1], token: t[1] };
  } catch {
    /* brak pliku — spróbujemy env */
  }
  const env = process.env.FB_GALERIA_TOKEN;
  if (env) return { pageId: "167636963360765", token: env };
  throw new Error(`nie znaleziono tokenu (ani w ${RDZEN_FB}, ani w env FB_GALERIA_TOKEN)`);
}

async function pobierz(url: string, timeoutMs = 30000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function policz(pageId: string, token: string): Promise<{ n: number; od: number | null; do: number | null }> {
  let url =
    `${API}/${pageId}/photos?type=uploaded&fields=id,created_time` +
    `&limit=1000&access_token=${token}`;
  let n = 0;
  let od: number | null = null;
  let doRoku: number | null = null;
  for (let s = 0; s < MAX_STRON && url; s++) {
    const resp = (await pobierz(url)) as {
      data?: Array<{ id: string; created_time?: string }>;
      paging?: { next?: string };
    };
    for (const f of resp.data ?? []) {
      n++;
      const rok = f.created_time ? Number(f.created_time.slice(0, 4)) : null;
      if (rok) {
        if (od === null || rok < od) od = rok;
        if (doRoku === null || rok > doRoku) doRoku = rok;
      }
    }
    url = resp.paging?.next ?? "";
    if (resp.data && resp.data.length === 0) break;
  }
  return { n, od, do: doRoku };
}

async function main(): Promise<void> {
  const { pageId, token } = czytajToken();
  const { n, od, do: doRoku } = await policz(pageId, token);
  if (n <= 0) throw new Error("FB zwrócił 0 zdjęć — nie nadpisuję licznika");

  const stary: Licznik | null = existsSync(PLIK_WYJSCIOWY)
    ? (JSON.parse(readFileSync(PLIK_WYJSCIOWY, "utf-8")) as Licznik)
    : null;
  if (stary && stary.zdjecia === n && stary.od === od && stary.do === doRoku) {
    console.log(`Licznik galerii bez zmian: ${n} zdjęć (${od}–${doRoku}) — nie zapisuję (brak commita).`);
    return;
  }
  const wpis: Licznik = {
    zdjecia: n,
    od,
    do: doRoku,
    aktualizacja: new Date().toISOString(),
  };
  writeFileSync(PLIK_WYJSCIOWY, JSON.stringify(wpis, null, 2) + "\n", "utf-8");
  console.log(
    `Licznik galerii: ${n} zdjęć, zakres ${od}–${doRoku}` +
      (stary ? ` (było: ${stary.zdjecia}) — zapisuję ${PLIK_WYJSCIOWY}` : ` — tworzę ${PLIK_WYJSCIOWY}`),
  );
}

main().catch((err: unknown) => {
  // Świadomie NIE czerwienimy runu: licznik jest dodatkiem, liga ważniejsza.
  console.warn(`::warning::Licznik galerii FB pominięty — ${err instanceof Error ? err.message : String(err)}`);
});
