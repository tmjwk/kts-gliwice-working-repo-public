/**
 * galeria_teaser.ts — MIGAWKA najnowszych albumów dla teasera galerii
 * na stronie głównej (js/app.js → renderTeaserGalerii).
 *
 * DECYZJA WŁAŚCICIELA (04.11.2026, v1.27.0): „tutaj powinny być miniaturki
 * z bieżącego roku a nie stare […] wiem, że tak jest łatwiej bo są na Git,
 * ale to jest niewłaściwe. Użytkownik powinien widzieć najnowsze wpisy
 * do galerii”. Teaser najpierw próbuje lustra FB NA ŻYWO w przeglądarce
 * gościa — ale u części gości graph.facebook.com jest BLOKOWANY (adblock /
 * filtry prywatności — Polska w światowej czołówce stosowania) albo FB
 * świeci czasem; wtedy włączał się fallback na galeria.json, czyli
 * ZAMROŻONE archiwum 2023–24, które udawało „najnowsze”. Ten skrypt
 * zamyka lukę: bot (ten krok workflow sync-dane.yml, co 2 h) zapisuje
 * do galeria-teaser.json najnowsze albumy dokładnie tak, jak widzi je
 * FB — przeglądarka gościa z adblockiem czyta migawkę z repo (własna
 * domena, nikt jej nie blokuje) i widzi BIEŻĄCY rok.
 *
 * ZASADY:
 *  - token czytany z js/galeria-fb-core.js (ten sam publiczny token
 *    read-only co lustra galerii; alternatywnie env FB_GALERIA_TOKEN);
 *  - pobór i GRUPOWANIE identyczne jak w przeglądarce (galeria-fb-core.js):
 *    post > album nazwany > miesiąc, slugi w tym samym formacie
 *    (fb-<postId> / fb-alb-<albumId> / fb-m-YYYY-MM), żeby linki teasera
 *    „galeria.html#album-<slug>” trafiały w te same albumy po dojeździe
 *    pełnej galerii;
 *  - pobieramy BIEŻĄCY rok (a gdy mało albumów — jeszcze poprzedni,
 *    jak w teledysku przeglądarkowym), bierzemy 8 najnowszych albumów
 *    (teaser pokazuje 6 — 2 zapasu na dziury w datach);
 *  - do repo NIE trafia ani bajt danych z FB (zasada projektu z 1.11):
 *    tylko METADANE i PODPISANE URL-e CDN — jak w liczniku galerii;
 *  - plik zapisujemy TYLKO przy zmianie treści (slug/tytuł/data/link/
 *    liczba zdjęć — bez URL-i CDN, żeby re-podpisane adresy nie robiły
 *    szumu commitów) ALBO gdy migawka ma więcej niż 14 dni — URL-e CDN
 *    wygasają po miesiącach, więc w cichych okresach bot odświeża
 *    podpisy, nawet gdy lista albumów stoi w miejscu;
 *  - awaria (FB, sieć, parsowanie) = ostrzeżenie i exit 0: migawka nie
 *    może blokować synchronizacji ligowej ani czerwienić runu; strona
 *    trzyma ostatni zapisany stan w repo.
 *
 * Uruchomienie: bun scripts/galeria_teaser.ts (z korzenia repo).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PLIK_WYJSCIOWY = "galeria-teaser.json";
const RDZEN_FB = "js/galeria-fb-core.js";
const API = "https://graph.facebook.com/v22.0";
const LIMIT_ALBUMOW = 8; // teaser pokazuje 6; 2 zapasu
const MAX_WIEK_MS = 14 * 24 * 60 * 60 * 1000; // 14 dni → odświeżenie URL-i CDN
const MIESIACE = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

interface Foto {
  id: string;
  ct: string;
  link: string | null;
  mini: string;
  pelna: string;
  album: { id: string; name: string; type: string } | null;
}

interface Post {
  id: string;
  created_time?: string;
  message?: string;
  permalink_url?: string;
  attachments?: { data?: Array<Attachment> };
}

interface Attachment {
  type: string;
  target?: { id?: string };
  subattachments?: { data?: Array<Attachment> };
}

interface Album {
  slug: string;
  tytul: string;
  data: string | null;
  fbLink: string | null;
  zdjecia: string[];
  miniatury: string[];
  liczbaZdjec: number;
}

interface Migawka {
  albumy: Album[];
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

async function pobierz(url: string, timeoutMs = 30000): Promise<Record<string, unknown>> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(t);
  }
}

/* zdjęcia z zakładki „Zdjęcia” (uploaded) od dnia odIso (bez końca) */
async function zdjecia(pageId: string, token: string, odIso: string): Promise<Map<string, Foto>> {
  const mapa = new Map<string, Foto>();
  let url =
    `${API}/${pageId}/photos?type=uploaded&since=${odIso}` +
    `&fields=id,created_time,link,images,album{id,name,type}` +
    `&limit=250&access_token=${token}`;
  for (let s = 0; s < 12 && url; s++) {
    const resp = await pobierz(url);
    for (const f of (resp.data as Array<Record<string, unknown>>) ?? []) {
      const ims = ((f.images as Array<{ width?: number; source: string }>) ?? [])
        .slice()
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
      if (!ims.length) continue;
      let mini = ims[ims.length - 1]; // najmniejsza (iterując od największej: ostatnia ≥480 px)
      for (const i of ims) if ((i.width ?? 0) >= 480) mini = i;
      mapa.set(String(f.id), {
        id: String(f.id),
        ct: (f.created_time as string) ?? "",
        link: (f.link as string) ?? null,
        mini: mini.source,
        pelna: ims[0].source,
        album: (f.album as { id: string; name: string; type: string }) ?? null,
      });
    }
    url = ((resp.paging as { next?: string }) ?? {}).next ?? "";
  }
  return mapa;
}

/* posty od odIso (do doIso wyłącznie; null = bez końca) — TYLKO metadane
   (tytuł, permalink, przypisanie zdjęć) */
async function posty(pageId: string, token: string, odIso: string, doIso?: string): Promise<Post[]> {
  const pola = "created_time,message,permalink_url,"
    + "attachments.limit(60){type,target{id},"
    + "subattachments.limit(60){type,target{id}}}";
  const out: Post[] = [];
  let url =
    `${API}/${pageId}/posts?fields=${encodeURIComponent(pola)}` +
    `&since=${odIso}` + (doIso ? `&until=${doIso}` : "") +
    `&limit=100&access_token=${token}`;
  for (let s = 0; s < 12 && url; s++) {
    const resp = await pobierz(url);
    let stop = false;
    for (const p of (resp.data as Array<Post>) ?? []) {
      // stronicujemy od najnowszych — kończymy poniżej progu roku
      if (!doIso && (p.created_time ?? "") < odIso) { stop = true; break; }
      out.push(p);
    }
    if (stop) break;
    url = ((resp.paging as { next?: string }) ?? {}).next ?? "";
  }
  return out;
}

/* photo_id → post (od najnowszych, więc przy udostępnieniach wygrywa
   post PIERWOTNY) — identycznie jak mapaFotoPost w galeria-fb-core.js */
function mapaFotoPost(lista: Post[]): Map<string, Post> {
  const mapa = new Map<string, Post>();
  for (const p of lista) {
    const zbierz = (att: Attachment) => {
      if (att.type !== "photo") return;
      const tid = att.target?.id;
      if (tid) mapa.set(String(tid), p);
    };
    for (const a of p.attachments?.data ?? []) {
      zbierz(a);
      for (const s of a.subattachments?.data ?? []) zbierz(s);
    }
  }
  return mapa;
}

function tytulZPosta(p: Post): string {
  const linie = (p.message ?? "").split("\n").map((l) => l.trim());
  const pierwsza = linie.find((l) => l.length > 1) ?? "";
  const bezUrl = pierwsza.replace(/https?:\/\/\S+/, "").trim();
  const t = bezUrl || pierwsza;
  if (!t) return "";
  return t.length > 90 ? t.slice(0, 87).replace(/\s+\S*$/, "") + "…" : t;
}

/* grupowanie: post > album nazwany > miesiąc — identycznie jak
   zbudujAlbumy w galeria-fb-core.js (slugi MUSZĄ się zgadzać) */
function zbudujAlbumy(mapaZdjec: Map<string, Foto>, fotoPost: Map<string, Post>): Album[] {
  const grupy = new Map<string, { klucz: string; tytul: string | null; data: string | null; link: string | null; fotos: Foto[] }>();
  for (const [id, z] of mapaZdjec) {
    const post = fotoPost.get(id) ?? null;
    const alb = z.album ?? null;
    const dataFoto = z.ct.slice(0, 10);
    const mies = z.ct.slice(0, 7);
    let klucz: string, tytul: string | null, data: string | null, link: string | null;
    if (post) {
      klucz = `fb-${post.id}`;
      tytul = tytulZPosta(post) || null;
      data = (post.created_time ?? "").slice(0, 10);
      link = post.permalink_url ?? null;
    } else if (alb && alb.type === "normal" && alb.name) {
      klucz = `fb-alb-${alb.id}`;
      tytul = alb.name;
      data = dataFoto;
      link = z.link ?? null;
    } else {
      klucz = `fb-m-${mies}`;
      const nr = Number(mies.slice(5, 7));
      tytul = `Zdjęcia · ${MIESIACE[nr - 1] || mies} ${mies.slice(0, 4)}`;
      data = dataFoto;
      link = z.link ?? null;
    }
    let g = grupy.get(klucz);
    if (!g) { g = { klucz, tytul, data, link, fotos: [] }; grupy.set(klucz, g); }
    g.fotos.push(z);
  }
  const albumy: Album[] = [];
  for (const g of grupy.values()) {
    if (!g.fotos.length) continue;
    g.fotos.sort((a, b) => (a.ct < b.ct ? -1 : a.ct > b.ct ? 1 : 0)); // chronologicznie
    albumy.push({
      slug: g.klucz,
      tytul: g.tytul || `Zdjęcia z FB${g.data ? " · " + g.data.split("-").reverse().join(".") : ""}`,
      data: g.data || null,
      fbLink: g.link || g.fotos[0].link || null,
      zdjecia: [g.fotos[0].pelna],
      miniatury: [g.fotos[0].mini],
      liczbaZdjec: g.fotos.length,
    });
  }
  return albumy;
}

const wgDaty = (a: Album, b: Album) => {
  const da = a.data ?? "", db = b.data ?? "";
  return da > db ? -1 : da < db ? 1 : 0;
};

async function main(): Promise<void> {
  const { pageId, token } = czytajToken();
  const rok = Math.max(2012, new Date().getFullYear());

  const postyRoku = await posty(pageId, token, `${rok}-01-01`);
  const zdjeciaRoku = await zdjecia(pageId, token, `${rok}-01-01`);
  let albumy = zbudujAlbumy(zdjeciaRoku, mapaFotoPost(postyRoku));

  /* mało albumów (np. styczeń) — dołóż rok poprzedni, jak w przeglądarce.
     Zakresy lat są rozłączne, więc foto nie mogą się powtórzyć; jedyny
     splot to post z przełomu grudnia/stycznia — może dostać dwa wpisy
     pod tym samym slugiem (rzadkie i niegroźne, jak w lustrze). */
  if (albumy.length < LIMIT_ALBUMOW && rok - 1 >= 2012) {
    try {
      const posty2 = await posty(pageId, token, `${rok - 1}-01-01`, `${rok}-01-01`);
      const zdjecia2 = await zdjecia(pageId, token, `${rok - 1}-01-01`);
      albumy = albumy.concat(zbudujAlbumy(zdjecia2, mapaFotoPost(posty2)));
    } catch {
      /* rok poprzedni opcjonalny — nie wywala migawki */
    }
  }

  albumy.sort(wgDaty);
  const najnowsze = albumy.slice(0, LIMIT_ALBUMOW);
  if (!najnowsze.length) throw new Error("FB zwrócił 0 albumów — nie nadpisuję migawki");

  /* porównanie BEZ URL-i CDN i bez znacznika czasu — tylko istota */
  const istota = (a: Album[]) => JSON.stringify(a.map((x) =>
    [x.slug, x.tytul, x.data, x.fbLink, x.liczbaZdjec]));
  const stara: Migawka | null = existsSync(PLIK_WYJSCIOWY)
    ? (JSON.parse(readFileSync(PLIK_WYJSCIOWY, "utf-8")) as Migawka)
    : null;
  const wiek = stara ? Date.now() - Date.parse(stara.aktualizacja) : Infinity;
  if (stara && istota(stara.albumy ?? []) === istota(najnowsze) && wiek < MAX_WIEK_MS) {
    console.log(`Migawka teasera bez zmian: ${najnowsze.length} albumów, najnowszy ${najnowsze[0].data} — nie zapisuję (brak commita; wiek migawki ${(wiek / 86400000).toFixed(1)} dnia).`);
    return;
  }
  const wpis: Migawka = { albumy: najnowsze, aktualizacja: new Date().toISOString() };
  writeFileSync(PLIK_WYJSCIOWY, JSON.stringify(wpis, null, 1) + "\n", "utf-8");
  console.log(
    `Migawka teasera: ${najnowsze.length} albumów, najnowszy ${najnowsze[0].data}` +
      (stara ? ` (poprzednia: ${stara.albumy?.length ?? 0} albumów, ${stara.aktualizacja})` : "") +
      ` — zapisuję ${PLIK_WYJSCIOWY}`,
  );
}

main().catch((err: unknown) => {
  // Świadomie NIE czerwienimy runu: migawka jest dodatkiem, liga ważniejsza.
  console.warn(`::warning::Migawka teasera galerii pominięta — ${err instanceof Error ? err.message : String(err)}`);
});
