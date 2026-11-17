/** ============================================================
 *  MOST KTS → SLZTS · Google Apps Script · v1.7.1
 *  (jeden plik — wklej CAŁOŚĆ do edytora Apps Script arkusza,
 *   NAD poprzednią wersją: zaznacz wszystko w edytorze → wklej → zapisz)
 *
 *  PULS: SEKUNDY + STATYSTYKA CZASÓW PRZEBIEGÓW (v1.7.1, 14.11 — dwie
 *  prośby właściciela po audycie v1.7.0; logika pobierania, parsowania,
 *  zapisów i ochrony danych: ZERO ZMIAN):
 *   · „Ostatnie tyknięcie Zarządcy” zapisywane z SEKUNDAMI w formacie
 *     „yyyy-MM-dd HH:mm:ss”, jako TEKST (format komórki „@”) — arkusz
 *     nie może przestawić wartości na datę i zjeść cyfr; strażnik
 *     świeżości po stronie syncu czyta ten czas regexem tolerancyjnym
 *     na sekundy (zweryfikowane na adapterze most-szts.ts: wallNaMinuty
 *     dopasowuje prefiks) — po stronie strony NIC się nie zmienia;
 *   · STATYSTYKA CZASÓW PRZEBIEGÓW z okna 24 h, w PULS (decyzja:
 *     Puls, nie Log — Log to surowe zdarzenia i wpisy odpływają po 1500
 *     wierszach, a Puls to zakładka serwisowa „stan do rzuconego okiem”,
 *     przebudowywana co tick; strażnik/sync czytają Puls PO ETYKIETACH,
 *     więc nowe wiersze są dla nich niewidoczne):
 *       „Przebiegi (24 h)” — ile wpisów Logu z „czas: X s” zmieściło
 *                          się w oknie (timery od v1.5.5);
 *       „Czas przebiegu (24 h)” — średnio · najkrócej · najdłużej;
 *     liczona z Logu przy KAŻDYM ticku (zapiszPuls_) oraz zaraz po każdym
 *     przebiegu z timerami (odswiezStatystykiPulsu_) — świeże liczby
 *     od razu, bez czekania na tick ≤15 min;
 *   · samonaprawa układu: stare Puls (bez wierszy statystyki) przebuduje
 *     się przy najbliższym ticku (kontrola etykiety w wierszu 6); przez
 *     ten czas „tyknięcie” zostaje w starym formacie minut — celowo nie
 *     ruszanym poza tickiem (strażnik świeżości czyta WYŁĄCZNIE czas
 *     tyknięcia Zarządcy, nie aktywność ręczną).
 *
 *  ZAPISY GRUPOWE + WARUNKOWE (v1.7.0, 14.11, krok 3/3 optymalizacji
 *  czasu przebiegu — na pomiarach v1.6.0: „Sprawdź wyniki teraz” 25,5 s,
 *  z czego zapisy ~10,5 s i powtórne CZYTANIE świeżo sparsowanych danych
 *  z powrotem z arkusza): dane i style jedną paczką, a niezmienione
 *  arkusze wcale.
 *   · ZAPIS GRUPOWY (zapiszBloki_): cały arkusz JEDNYM setValues + po
 *     jednym grupowym setBackgrounds/setFontWeights/setFontSizes/
 *     setFontColors (macierze 2D) — 6 wywołań API zamiast ~30–60 na
 *     arkusz ligi; podświetlenia ★ meczów naszych drużyn wchodzą do
 *     macierzy tła (koniec z osobnym wywołaniem per wiersz); null w
 *     macierzy tła = reset do domyślnego (siatka komórek bez zmian —
 *     dokumentacja Apps Script); styl wiersza (bold/rozmiar/kolor) na
 *     całej szerokości bezpieczny — puste komórki nic nie pokazują;
 *   · ZAPIS WARUNKOWY (zapiszWarunkowo_): docelowy obraz vs zapisany
 *     (JEDNO getValues) — identyczność poza wierszem 2 (znacznik czasu,
 *     zawsze dostaje świeżą wartość) = NIE ruszam danych ani stylów
 *     (~3 wywołania zamiast pełnego przebudowania); rozbieg liczby
 *     wierszy albo choć jednej komórki = pełny zapis (clear + blok —
 *     kasuje też czerwoną kartkę błędu i ręczne dopiski, jak dotąd);
 *     szerokości kolumn tylko przy przebudowaniu (trwają po clear);
 *   · CACHE PRZEBIEGU (CACHE_RUNU_): parsowanie lig/PZTS oddaje tabelę
 *     i terminarz do pamięci przebiegu — „Drużyny”, „Mecze KTS”, STATUS
 *     i dyżur biorą je stamtąd bez czytania z powrotem z arkusza
 *     (czytajTabele_/czytajTerminarz_/wierszeMeczyKTS_/czytajRejestr_
 *     najpierw cache, potem arkusz — Dyżur bez pobierania lig czyta
 *     arkusz, jak dotąd); wczytajLigi_ czytane RAZ na przebieg; reset
 *     na starcie KAŻDEGO przebiegu i po przepisaniu Cfg (instalacja);
 *   · LOGIKA POBIERANIA / PARSOWANIA / OCHRONY DANYCH: ZERO ZMIAN —
 *     anti-wipe, bramki treści, budżety 350/120, blokada LockService,
 *     tura równoległa fetchAll z v1.6.0 — wszystko poza sposobem ZAPISU;
 *   · jawność w Logu: „zapisy: N pełne · M bez zmian” w nawiasie czasów.
 *  Oczekiwany efekt: „Sprawdź wyniki teraz” 25,5 → ~13–16 s (zależnie
 *  od tego, ile arkuszy faktycznie się zmieniło); Dyżur w dzień bez
 *  meczów ~6 → ~3 s. Koszty wymiany wersji jak zwykle: auto-odświeżenie
 *  tabeli PZTS + składów + jednorazowy powtór Patrolu PZTS.
 *
 *  RÓWNOLEGŁOŚĆ v1.6.0 (14.11, krok 2/3 optymalizacji czasu przebiegu,
 *  projektowany na POMIARACH v1.5.5, nie na domysłach): zamiast 13 żądań
 *  szeregowych — TURA 1, jedna paczka UrlFetchApp.fetchAll.
 *  Dane wejściowe (przebieg ręczny „Sprawdź wyniki teraz” 31,4 s):
 *  sieć szeregowa 19,4 s = ligi 10,9 + składy 12,4 + PZTS 4,0 — paczka
 *  zamienia SUMĘ żądań na NAJDŁUŻSZE z nich.
 *   · TURA 1 (start przebiegu): strony LIG + bezpośrednie próby PZTS
 *     (liga i drużyna) + hub — wszystko, czego adresy znamy z góry;
 *     TURA 1b (przed składami): podstrony drużyn ŚZTS — po świeżej
 *     przebudowie „Drużyn” (rejestr może dostać nowe linki z tabel
 *     ligowych TEGO przebiegu — semantyka jak dotąd);
 *   · FETCH_BUFOR_ (jednorazowy): pobierzHtml_ / pobierzHtmlDruzyny_ /
 *     pztsPobierz_ / sprawdzHub_ zabierają odpowiedź z paczki, gdy jest
 *     HTTP 200 i przechodzi DAWNĄ walidację sekcji — parsowanie i zapisy
 *     bez ani jednej zmiany;
 *   · TURA 2 (naprawcza): co w paczce padło, leci STARĄ ścieżką szeregową
 *     — dotychczasowe sleepy 10/20 s (ŚZTS) i 8 s (PZTS), czytnik
 *     r.jina.ai jako kanał 2 PZTS, Dokończenie jako zawsze;
 *   · BUDŻETY: paczka liczy się do limitów 350/120 żądanie w żądanie
 *     (policzZapytanie_ PRZED wysłaniem) i NIE przekracza wolnych miejsc
 *     — żądania, które się nie zmieściły, zostają drodze szeregowej;
 *     anti-wipe, bramki treści, blokada LockService: bez zmian;
 *   · Patrol PZTS (raz dziennie ~03:00) i czytnik r.jina.ai zostają
 *     SZEREGOWE z definicji (nikt na nie nie czeka / są warunkowe);
 *   · fetchAll: timeoutSeconds to oficjalny parametr PER ŻĄDANIE (domyślny
 *     timeout 360 s — dlatego jawnie 45/20 s, jak dotąd), a odpowiedzi
 *     wracają w kolejności żądań (dokumentacja Apps Script);
 *   · jawność w Logu: „czas: X s [sieć … · równolegle 13 ż. w 3,4 s ·
 *     szeregowo 2 ż. · ligi …]” — widać, co poszło paczką, a co naprawczo.
 *  Oczekiwany efekt: „Sprawdź wyniki teraz” ~31 s → ~15–18 s (pełny,
 *  z obowiązkowym odświeżeniem składów); Dyżur automatyczny ~11 → ~8 s.
 *  Koszty wymiany wersji jak zwykle: auto-odświeżenie tabeli PZTS + składów
 *  + jednorazowy powtór Patrolu PZTS (znaczniki wersji).
 *  Krok 3 (v1.6.1, zapisy do arkusza ~12 s) — dopiero po pomiarach v1.6.0.
 *
 *  POMIAR v1.5.5 (14.11, krok 1/3 optymalizacji czasu przebiegu): TIMERY
 *  FAZ — najpierw WIEMY, gdzie dokładnie siedzą ~40 s przebiegu „Sprawdź
 *  wyniki teraz”, dopiero potem rusza równoległe pobieranie (v1.6.0).
 *   · MS_SIEC / MS_SEN — sumaryczny czas żądań UrlFetchApp (też tych
 *     nieudanych — timeout to przecież koszt) i czekania (sleep) między
 *     próbami; rozdziela koszt SIECI od kosztu ZAPISÓW do arkusza;
 *   · timery faz LIGI · HUB · PZTS · PATROL · MECZE · DRUŻYNY · SKŁADY
 *     + czas łączny — w kolumnie „Szczegóły” w „Log” i w okienku menu:
 *     „czas: 38,4 s [sieć 24,1 s · ligi 21,9 s · pzts 5,2 s · …]”;
 *   · czas PER LIGA w wynikach: „2LM ✓ (30 meczów · 2,4 s)”;
 *   · fetchZPomiarem_() — jedno miejsce, gdzie liczy się czas żądania
 *     („finally” zalicza także próbę zakończoną wyjątkiem).
 *  LOGIKA POBIERANIA / PARSOWANIA / ZAPISU: ZERO ZMIAN — czysta
 *  obserwacja; pomiary są fundamentem decyzji o v1.6.0 (fetchAll).
 *  Koszty wymiany wersji jak zwykle: auto-odświeżenie tabeli PZTS
 *  (most.pztsTabelaWersja) + jednorazowy powtór Patrolu PZTS
 *  (most.pztsPatrolWersja; ~10–16 zapytań z budżetu 120/dobę).
 *
 *  POPRAWKA v1.5.4 (13.11, „dąż do doskonałości” — doszlifowanie v1.5.3,
 *  która przeszła żywy audyt 10/10 z ground truth): ODCZYT PUNKTÓW
 *  WPROST Z KOMÓREK PAR EX AEQUO. U źródła PZTS komórka „Pkt” pary
 *  wygląda „8 (2) -->” (punkty + dopisek w nawiasie + strzałka
 *  sortowania) — pztsCzystaLiczba_ odrzucała ją jako nieczystą i
 *  v1.5.3 brała punkty z bilansu 2·Z+R (wynik poprawny, ale każda
 *  para zostawiała wpis diagnostyczny w „Log”). Nowy pztsPunktyZKomorki_
 *  czyta PIERWSZĄ liczbę takiej komórki wprost („8 (2) -->” → 8);
 *  bilans 2·Z+R zostaje bezpiecznikiem: Pkt nieczytelne LUB sprzeczne
 *  z bilansem → nadal policzone z bilansu + jawny wpis w „Log”
 *  (PZTS_NOTATKI). Zmiana czysto poprawcza — zero zmian układu
 *  zakładek; wymiana wersji mostu = jedno automatyczne odświeżenie
 *  tabeli PZTS (znacznik most.pztsTabelaWersja, jak dotąd).
 *
 *  ZASADA WERSJONOWANIA (od v1.5.4, decyzja właściciela 13.11):
 *  KAŻDA zmiana treści skryptu = NOWY numer wersji + NOWY plik
 *  archiwalny Most_KTS_do_SLZTS_GS_vX_Y_Z.gs + wpis w rejestrze
 *  wersji (Most_KTS_WERSJE.md). Nigdy nie zmieniamy treści pod już
 *  wdrożonym numerem i nigdy nie używamy numeru dwa razy — por.
 *  v1.5.1 (wklej połowiczny bez zarchiwizowanego pliku: luka w
 *  rejestrze; wykryta dopiero przy audycie v1.5.2).
 *
 *  POPRAWKA v1.5.3 (13.11, po żywym audycie v1.5.2 kanałem gviz):
 *  PUNKTY PAR EX AEQUO W TABELI PZTS. v1.5.2 odzyskała wszystkie
 *  10 drużyn (rowspan/zakresy „2-3” działały), ALE parom ex aequo
 *  (2-3, 5-6, 9-10) zapisywała jako „Punkty” liczbę PRZEGRANYCH P
 *  (MATS/BKS „1” zamiast 8, PGE/Jom „5”/„6” zamiast 0). Przyczyna:
 *  komórka „Pkt” przy scalonym „Poz.” bywa NIECZYSTA (pzts.pl
 *  dokleja encje HTML wokół scalonych komórek, np. „8&#8203;” —
 *  stary most IMPORTHTML je dekoduje i widzi „8”, nasz czyściciel
 *  tylko &nbsp;) i reguła „punkty = ostatnia czysta liczba WIERSZA”
 *  cofała się aż po P porażek. Naprawa:
 *   · czystaKomorka_ dekoduje encje HTML (&#NNN;, &#xHH;, &amp; itd.)
 *     i zdejmuje znaki zero-width (U+200B/200C/200D/2060/FEFF/202F);
 *   · punkty = ostatnia czysta liczba ZA blokiem M/Z/R/P (nigdy w
 *     bloku — P przestaje być kandydatem);
 *   · gdy Pkt wciąż nieczytelny/brak — punkty liczone z bilansu
 *     2·Z + R (punktacja PZTS, zweryfikowana spójnością całej tabeli
 *     1LM i workloga); KAŻDE takie liczenie + odstępstwo odczytu od
 *     bilansu ląduje w „Log” (jawność — widać, co i dlaczego);
 *   · wymiana wersji mostu = JEDNO automatyczne odświeżenie tabeli
 *     PZTS (znacznik most.pztsTabelaWersja; „Dokończenie” dogoni
 *     tabelę nawet bez klikania) — błędne punkty z v1.5.2 nadpiszą
 *     się same (anti-wipe puszcza zrzut równy zapisanemu 10 = 10).
 *
 *  POPRAWKA v1.5.2 (13.11, DOKOŃCZENIE v1.5.1 — po żywym audycie kanałem
 *  gviz; usterki dotyczą WYŁĄCZNIE modułu PZTS — ŚZTS bez zmian).
 *  v1.5.1 wklejona 12.11 wieczorem zawierała tylko POŁOWĘ poprawki
 *  (rozwiązywanie rowspan tak, ale bez nowego klasyfikatora tabeli
 *  i bez klasyfikacji Patrolu — stąd w arkuszu nadal 4/10 drużyn
 *  i stary alarm); v1.5.2 przynosi CAŁOŚĆ:
 *   · TABELA PZTS MIAŁA 4/10 DRUŻYN — z tabeli 1. ligi zniknęły dokładnie
 *     pary EX AEQUO (2-3 po 8 pkt, 5-6 po 6, 9-10 po 0). Serwer PZTS
 *     scala komórki „Poz.” dla drużyn z remisem punktowym (rowspan/
 *     zakres „2-3”), a parser pozycyjny v1.5.0 gubił oba wiersze pary.
 *     Naprawa konstrukcyjna: parsowanie HTML z ROZWIĄZANIEM rowspan/
 *     colspan, akceptacja pozycji-zakresów („2-3” → wiersze 2. i 3.),
 *     zbiórka wierszy z WSZYSTKICH tabel strony + dedup (tabela może
 *     być podzielona), tolerancja na „Pojed.” jako ułamek („1,84”),
 *     punkty = ostatnia czysta liczba w wierszu, kontrola Z+R+P=M.
 *   · ALARM PATROLU „nasze drużyny w 2 ligach” — hub PZTS linkuje też
 *     ligi ARCHIWALNE (sezon 2025/26), a ich zamrożone tabele nadal
 *     trzymają naszą drużynę (żywa id=82 + archiwalna id=73). Patrol
 *     klasyfikuje teraz każdą ligę: ŻYWA (przyszłe mecze albo „-:-”)
 *     czy archiwalna; auto-adopt WYŁĄCZNIE z ligi żywej, alarm tylko
 *     przy ≥2 ŻYWYCH (realna druga drużyna, np. kobiece ligi), archiwa
 *     dostają wpis informacyjny. Po wklejeniu v1.5.2 patrol odpala się
 *     JESZCZE RAZ (znacznik wersji) i od razu czyści stary alarm w INFO.
 *   · BRAMKA PIERWSZEGO ZAPISU PZTS: tabela < 5 drużyn = odrzut z
 *     diagnozą w błędzie (v1.5.0 przy PIERWSZYM zapisie nie miała z
 *     czym porównać i ubogi zrzut przeszedł; ochrona „<50% zapisanych”
 *     działa dopiero od drugiego zapisu).
 *   · Po wklejeniu: „Zainstaluj / napraw strukturę” (albo Pełne
 *     odświeżenie) nadpisze „PZTS 1LM” pełną tabelą — anti-wipe puszcza
 *     zrzut BOGATSZY od zapisanego (10 > 4).
 *
 *  WERSJA v1.5.0 (12.11, MOST ZBIORCZY — ŚZTS + PZTS w jednym
 *  arkuszu; przygotowanie do przełączenia strony na jeden most):
 *   · MODUŁ PZTS — 1. Liga Mężczyzn gr. południowa (drużyna 960):
 *     tabela ligowa + pełnosezonowy terminarz + skład ze statystykami,
 *     zapisywane do zakładki „PZTS 1LM” (układ identyczny jak „Liga …”:
 *     TABELA LIGOWA + TERMINARZ — czytnik strony czyta je tym samym
 *     parserem co zakładki ŚZTS). Kanał pobierania: najpierw
 *     bezpośredni UrlFetchApp, po odrzuceniu (pzts.pl stoi za
 *     Cloudflare — zwykle HTTP 403) czytnik r.jina.ai (Markdown;
 *     kanał sprawdzony od 20.10 w pipeline strony). Weryfikacja
 *     po instalacji: menu „PZTS: testuj kanały”. Budżet OSOBNY:
 *     120 zapytań/dobę (licznik w Puls i INFO); awaria PZTS NIE
 *     ubija pobierania ŚZTS (izolacja źródeł, jak w syncu strony).
 *   · MECZE KTS / DRUŻYNY / ZAWODNICY obejmują teraz CAŁY KLUB:
 *     mecze i skład 1. drużyny (PZTS) doklejane do danych ŚZTS;
 *     nagłówek rejestru „Nazwa w ŚZTS” → „Nazwa u źródła”;
 *     „Zawodnicy” zyskują kolumnę „Skuteczność” (dane PZTS; ŚZTS
 *     — puste). UWAGA dla syncu: mecze PZTS w „Mecze KTS” mają
 *     skrót ligi „1LM” — czytnik strony rozróżnia źródło po nim.
 *   · PATROL PZTS (raz dziennie, w oknie Patrolu ~03:00): przegląd
 *     tabel WSZYSTKICH lig centralnych PZTS (Ekstraklasa K, Superliga
 *     M, 1. ligi K i M gr. płn./płd. — adresy czytane z ich strony
 *     rozgrywki). Wykrywa drużynę klubu w KAŻDEJ lidze (także kobiecej),
 *     SAM przełącza adres ligi po zmianie sezonu (auto-adopt z propsów)
 *     i alarmuje w INFO/Logu, gdy naszych drużyn jest więcej niż jedna
 *     (moduł obsługuje jedną — rozbudowa świadomie odłożona).
 *   · LOG: limit 400 → 1500 wierszy (~miesiąc telemetrii przy
 *     48 tickach/dobę; trim nadal automatyczny, najnowsze na górze).
 *   · ARCHIWUM: menu „Archiwizuj sezon” — snapshot zakładek danych
 *     (Liga…, PZTS 1LM, Mecze KTS, Drużyny, Zawodnicy + ogon Logu)
 *     do OSOBNEGO skoroszytu; link ląduje w INFO i Logu.
 *   · PULS: nowy wiersz „Zapytania dziś (pzts.pl)” — strażnik
 *     świeżości widzi oba budżety.
 *  Struktura zakładek po v1.5.0 = KSZTAŁT FINALNY (kontrakt dla
 *  czytnika strony; zmiany układu tylko przez nową wersję mostu).
 *
 *  POPRAWKA v1.4.3 (12.11, przygotowanie mostu do roli GŁÓWNEGO
 *  źródła danych strony): nowa zakładka serwisowa „Puls” — znacznik
 *  tyknięcia Zarządcy, aktualizowany przy KAŻDYM ticku (co 15 min,
 *  także w ciche dni, gdy nic nie pobieramy). Strażnik świeżości
 *  w syncu (GitHub) dzięki temu odróżnia „ciszę meczową” (most żyje,
 *  nie ma czego pobierać — Patrol może świadomie nie strzelać) od
 *  „most umarł” (trigger/wykonanie padło) i wie, kiedy zejść do
 *  odwodu (pobieranie bezpośrednie). Zmiana czysto serwisowa —
 *  ZERO zmian w logice pobierania, parserach i zabezpieczeniach.
 *
 *  POPRAWKA v1.4.2 (12.11, drugi test): NAPRAWA POLSKICH ZNAKÓW W
 *  „ZAWODNIKACH”. Serwer ŚZTS psuje litery spoza latin-1 (ł ą ę ś ż ź ć ń)
 *  na „?” — nazwy drużyn w tabelach/terminarzach naprawiała już mapa
 *  NAPRAWA_NAZW (również przeciwnicy), ale SKŁADY zapisywały nazwiska
 *  SUROWE („?ukasz Strof”). v1.4.2 portuje z pipeline strony (szts-core.ts)
 *  komplet napraw i stosuje go do WSZYSTKICH tekstów ze ŚZTS:
 *   · NAPRAWA_IMION — pełne nazwiska naszych zawodników, zweryfikowane
 *     01.11 rejestrem licencji PZTS ISL (isl.pzts.pl; łącznik = nr
 *     licencji ŚZTS, pokrywa się z numeracją PZTS — numery w komentarzach);
 *   · IMIONA_PL + naprawImie_ — słownikowa naprawa imion (zbiór
 *     zamknięty; naprawa tylko przy JEDNOZNACZNYM dopasowaniu maski);
 *   · NAPRAWA_NARODOWOSCI — mapa obronna dla ewentualnych cudzoziemców;
 *   · jawność: nierozpoznane uszkodzenia zostają z „?” i są wypisane
 *     w „Log” (sygnał do dopisania wiersza do właściwej mapy);
 *   · „Zawodnicy” dostają kolumnę „Drużyna” (v1.4.1 jej nie miała — nie
 *     było w składach jak skontrolować pisownię nazw drużyn).
 *  Dodatkowo (krytyczne przy wymianie v1.4.1 → v1.4.2):
 *   · KAŻDE polecenie ręczne („Zainstaluj / napraw strukturę”, „Pełne
 *     odświeżenie”, Patrol/Dyżur „teraz”) odświeża składy NATYCHMIAST,
 *     pomijając TTL 12 h — inaczej instalacja v1.4.2 na świeżo pobrane
 *     (uszkodzone) składy v1.4.1 ZOSTAWIŁABY stare „?” w „Zawodnikach”
 *     i poprawka byłaby niewidoczna mimo poprawnego skryptu;
 *   · wymiana wersji mostu = jedno automatyczne odświeżenie składów
 *     (Patrol/Dyżur dogania naprawę nawet bez żadnego kliknięcia);
 *   · czytajStareSklady_ rozpoznaje stary układ v1.4/v1.4.1 (bez kolumny
 *     „Drużyna”) i wtedy nie przytrzymuje starych wierszy.
 *
 *  POPRAWKA v1.4.1 (12.11, po pierwszym teście w arkuszu): błąd
 *  „The number of rows in the data does not match … data has 19 but the
 *  range has 1” przy „Zainstaluj / napraw strukturę” — blok instrukcji w
 *  INFO (19 wierszy) wpisywany w zakres o ZADEKLAROWANEJ liczbie wierszy
 *  (17, przejętej z v1.3 — po dodaniu wierszy v1.4 już nieaktualnej).
 *  Naprawa KONSTRUKCYJNA: zakres liczy się teraz sam z długości tablicy
 *  (INFO i notatki Cfg) — ta klasa błędu nie może się już powtórzyć.
 *
 *  CO TO ROBI
 *  Pobiera tabele ligowe, terminarze i SKŁADY DRUŻYN z ligi.slzts.pl
 *  i zapisuje je jako WARTOŚCI (zero formuł IMPORT* — zero zbędnych
 *  zapytań). Zakładki: „Liga 2LM / 3LM / 4LM / 2SLA”, „Mecze KTS”,
 *  „Drużyny”, „Zawodnicy”, „Cfg”, „Log”, „INFO” — i NIC WIĘCEJ:
 *  instalator pyta i usuwa zbędne zakładki (v1.3).
 *
 *  TRYBY PRACY („Zarządca”, trigger co 15 minut):
 *  · Patrol — codziennie ok. 03:00, TYLKO gdy mecz naszych w ciągu
 *    7 dni albo jest zaległość (błąd pobierania): hub + 4 ligi +
 *    składy drużyn ≈ 12 zapytań.
 *  · Dyżur meczowy — w dni meczowe 15:00–00:30: tylko ligi dzisiejszych
 *    meczów, do momentu pojawienia się wyników; gdy wyniki kompletne,
 *    raz dziennie dokłada składy (statystyki zmieniają się po meczach).
 *  · Dokończenie — gdy któraś liga nie została pobrana (awaria /
 *    wiszące połączenie), kolejne ticki POZA oknem Dyżuru ponawiają
 *    TYLKO ją, maks. 6 rund dziennie → samonaprawa w ~15–30 min.
 *  · Poza tym — cisza: 0 zapytań do ligi.slzts.pl.
 *
 *  NASZE DRUŻYNY (od v1.1 — decyzja właściciela): nazwa zaczyna się
 *  od „KTS” i kończy na „Gliwice” (KTS Gliwice, KTS II–VI Gliwice oraz
 *  KTS KA Krokus VII Gliwice) LUB zawiera „Krokus”. Obcy klub „KTS
 *  Olimpijczyk Zawiercie” i inne gliwickie drużyny są odsiewane.
 *
 *  DLACZEGO v1.4 — po audycie sekcji „Drużyny i wyniki” strony KTS
 *  (dialog kafelka drużyny + podstrona druzyna.html; właściciel 12.11).
 *  Strona potrzebuje SZCZEGÓŁÓW, nie tylko tabel: kafelek po kliknięciu
 *  otwiera dialog (tabela / wyniki / najbliższe / SKŁAD), a „Pełna
 *  strona drużyny” pokazuje to samo w pełnym widoku. Do v1.3 most
 *  nie miał dwóch rzeczy, których strona wymaga:
 *   1. „Drużyny” — REJESTR drużyn klubu: nazwa karty na stronie ↔
 *      nazwa w ŚZTS ↔ liga ↔ stan („8. miejsce · 8 pkt”) ↔ URL ligi
 *      ↔ URL podstrony drużyny. Budowany lokalnie z już pobranych
 *      tabel (0 dodatkowych zapytań); URL-y podstron wyciągane
 *      GRATIS z linków w tabeli ligowej przy każdym pobraniu.
 *   2. „Zawodnicy” — SKŁADY ze statystykami (nazwisko, licencja,
 *      narodowość, rok, zwycięstwa, porażki, punkty) z podstron
 *      /druzyna/… : +7 zapytań raz na dobę (Patrol ok. 03:00),
 *      dodatkowo raz po wieczornym komplecie wyników (Dyżur), co
 *      najmniej 12 h od ostatniego udanego odświeżenia.
 *  ORAZ cztery zabezpieczenia (właściciel 12.11 — wszystkie przyjęte):
 *   A. LockService — blokada nakładania się przebiegów (trigger vs
 *      menu): drugi przebieg w trakcie pierwszego jest pomijany
 *      (wpis w Log; z menu — czytelny komunikat).
 *   B. Ochrona danych — nowy zrzut NIE nadpisuje dobrej tabeli, gdy
 *      jest podejrzanie ubogi (tabela < 50% wierszy zapisanych albo
 *      terminarz zniknął): prawdopodobna zmiana struktury ŚZTS;
 *      ostatnia dobra wersja zostaje, błąd do Log/STATUS.
 *   C. Dzienny limit zapytań (LIMIT_ZAPYTAN, domyślnie 350) — twarda
 *      gwarancja, że most NIGDY nie pobije starych ~44/godz. z
 *      IMPORTHTML; po wyczerpaniu: pauza do jutra, licznik w STATUS.
 *   D. Alert e-mail — po PROG_SERII (6) nieudanych przebiegach z
 *      rzędu (zero udanych pobrań lig) jeden mail na dobę do konta
 *      właściciela; licznik serii zeruje pierwszy sukces. Chroni
 *      przed „cichą śmiercią” mostu na tygodnie.
 *
 *  BUDŻET ZAPYTAŃ NA DOBĘ (typowo): dzień bez meczu 0–12 · dzień
 *  meczowy ~15–35 (Dyżur co 15 min do kompletu wyników + składy) ·
 *  najgorszy przypadek z Dokończeniem < 60. Limit 350 = duży zapas.
 *
 *  DLACZEGO v1.3 — diagnoza „skrypt się wykonał, ale wiele tabel pustych”
 *  Serwer ŚZTS potrafi ZAWIESIĆ połączenie: pomiary 12.11 — 3 z 5 żądań
 *  (2LM, 2SLA, hub) wisiało po 75–100 s bez odpowiedzi; te same strony
 *  po kilku minutach odpowiadały w ~2 s. Parsery v1.1 są identyczne
 *  z produkcyjnymi (szts-core.ts) i przeszły 4/4 lig na żywych stronach
 *  — winne było POBIERANIE, nie treść:
 *   1. UrlFetchApp bez „timeoutSeconds” czeka DOMYŚLNIE DO 6 MINUT —
 *      jedno wiszące połączenie zjadało cały limit wykonania, przebieg
 *      ginął w połowie (bez wpisu w Log!) i zostawiał puste zakładki;
 *   2. hub pobierany PIERWSZY mógł pochłonąć budżet przed ligami;
 *   3. nieudana liga była ponawiana dopiero o 03:00 (Patrol) — tabele
 *      mogły być puste nawet dobę.
 *  v1.2 naprawia konstrukcyjnie:
 *   · „timeoutSeconds: 45” na KAŻDE żądanie — wiszące połączenie tyle
 *     kosztuje, ile trwa próba, nigdy całego przebiegu;
 *   · budżet czasu z twardym terminem (deadline): nowa liga startuje,
 *     tylko gdy zmieści się przed terminem; nic nie wisi „w próżnię”;
 *   · hub NA KOŃCU, best-effort — nigdy kosztem danych ligowych;
 *   · Dokończenie — zaległe ligi ponawiane co ~15 min (max 6 rund/dzień);
 *   · nieudana liga z pustą zakładką dostaje CZERWONĄ kartkę z błędem
 *     (znika przy pierwszym udanym pobraniu);
 *   · Log i STATUS zapisywane także przy przerwaniu przebiegu.
 *  Do tego v1.3: porządek zakładek (biała lista + pytanie o usunięcie),
 *  STATUS z wersją/czasem przy każdym przebiegu, Cfg do 10 lig (5–14).
 *
 *  ZMIANY v1.0 → v1.1 (bez zmian w v1.2+)
 *   1. „Zainstaluj / napraw strukturę” od razu pobiera dane.
 *   2. Każdy przebieg pisze wiersz w „Log” i aktualizuje STATUS w „INFO”.
 *   3. Reguła drużyn „KTS…Gliwice” + „Krokus”.
 *   4. Licznik zapytań dnia (STATUS w INFO).
 *   5. Wykrywanie starych formuł IMPORT* z opcją zamiany na wartości.
 *   6. Konfiguracja lig czytana z zakładki „Cfg”.
 *   7. Korekty godzin 19:15→19:00 (czwartkowe domowe KTS II).
 * ============================================================ */

/* ============ SEKCJA CZYSTA (bez zależności od Apps Script) ============ */

/** Ligi klubu — wartości domyślne; robocza kopia w zakładce „Cfg”. */
var LIGI_DOMYSLNE = [
  { skrot: '2LM',  nazwa: '2. Liga Mężczyzn',          url: 'https://ligi.slzts.pl/liga/18/136/', arkusz: 'Liga 2LM' },
  { skrot: '3LM',  nazwa: '3. Liga Mężczyzn · gr. II', url: 'https://ligi.slzts.pl/liga/18/138/', arkusz: 'Liga 3LM' },
  { skrot: '4LM',  nazwa: '4. Liga Mężczyzn · gr. IV', url: 'https://ligi.slzts.pl/liga/18/142/', arkusz: 'Liga 4LM' },
  { skrot: '2SLA', nazwa: '2. Śląska Liga Amatorów',   url: 'https://ligi.slzts.pl/liga/18/144/', arkusz: 'Liga 2SLA' }
];

var HUB_URL = 'https://ligi.slzts.pl/';

/**
 * v1.5.0: PZTS — drugie źródło mostu. Wartości DOMYŚLNE; aktualne
 * adresy (ligi i drużyny) mogą być nadpisane własnościami skryptu
 * pzts.urlLigi / pzts.urlDruzyny — ustawia je Patrol PZTS (auto-adopt
 * po zmianie sezonu) i można je edytować ręcznie w konfiguracji
 * projektu. Pozostałe pola są stałe.
 */
var PZTS_LIGA_DOMYSLNA = {
  skrot: '1LM',
  nazwa: '1. Liga Mężczyzn · gr. południowa',
  urlLigi: 'https://pzts.pl/rozgrywki-ligowe/liga/?id=82',
  urlDruzyny: 'https://pzts.pl/rozgrywki-ligowe/druzyna/960/',
  nazwaDruzyny: 'KTS Gliwice',      // nazwa u źródła PZTS (bez „I”!)
  karta: 'KTS Gliwice I',           // nazwa karty na stronie klubu
  arkusz: 'PZTS 1LM'
};
/** Hub rozgrywek PZTS — stąd Patrol PZTS czyta adresy lig centralnych. */
var PZTS_HUB_URL = 'https://pzts.pl/rozgrywki-ligowe';
/** Czytnik omijający Cloudflare (Markdown; ten sam mechanizm co w syncu
 *  strony od 20.10). Do adresu doklejamy PEŁNY URL żądania. */
var PZTS_CZYTNIK_URL = 'https://r.jina.ai/';

/**
 * Nazwa KARTY na stronie (dane.json: zespoly[].nazwa) dla drużyny ŚZTS
 * w danej lidze (v1.4). Klucz = „skrótLigi|nazwa w ŚZTS”. Brak mapowania
 * → karta generowana automatycznie (odcięte końcowe „Gliwice”).
 * Lustrzana kopia ZESPOLY z pipeline strony — utrzymywać wspólnie.
 */
var KARTY_DRUZYN = {
  '2LM|KTS II Gliwice': 'KTS II',
  '2LM|KTS III Gliwice': 'KTS III',
  '3LM|KTS IV Gliwice': 'KTS IV',
  '4LM|KTS V Gliwice': 'KTS V',
  '4LM|KTS VI Gliwice': 'KTS VI',
  '4LM|KTS KA Krokus VII Gliwice': 'KA Krokus VII',
  '2SLA|KTS Gliwice': 'KTS Gliwice · amatorzy',
  '1LM|KTS Gliwice': 'KTS Gliwice I'            // v1.5.0: PZTS
};

/**
 * Mapa naprawcza nazw drużyn z uszkodzonej bazy ŚZTS (serwer zamienia
 * polskie litery na „?”). Klucz = nazwa dokładnie taka, jak ją widzi parser.
 * Lustrzana kopia z pipeline strony (szts-core.ts) — utrzymywać wspólnie.
 */
var NAPRAWA_NAZW = {
  'AKS Miko?ów': 'AKS Mikołów',
  'ATS Ligota ?ab?dzka': 'ATS Ligota Łabędzka',
  'KS Mys?aw II Mys?owice': 'KS Mysław II Mysłowice',
  'KS Mys?aw Mys?owice': 'KS Mysław Mysłowice',
  'KU AZS UJD Cz?stochowa': 'KU AZS UJD Częstochowa',
  'LITS Meble Anders ?ywiec': 'LITS Meble Anders Żywiec',
  'LKS Ci??kowianka Jaworzno': 'LKS Ciężkowianka Jaworzno',
  'LKS M?odo?? Rudno': 'LKS Młodość Rudno',
  'LKS Naprzód ?wibie': 'LKS Naprzód Świbie',
  'LKS Stra?ak II Miko?ów': 'LKS Strażak II Mikołów',
  'LKS Stra?ak III Miko?ów': 'LKS Strażak III Mikołów',
  'LKS Stra?ak Miko?ów': 'LKS Strażak Mikołów',
  'LUKS W?gierska Górka': 'LUKS Węgierska Górka',
  'LZS Chespa ?ywocice': 'LZS Chespa Żywocice',
  'MKS Siemianowiczanka Siemianowice ?l.': 'MKS Siemianowiczanka Siemianowice Śl.',
  'MKS Tajfun Ku?nia Raciborska': 'MKS Tajfun Kuźnia Raciborska',
  'STS I ?ernica': 'STS I Żernica',
  'STS II ?ernica': 'STS II Żernica',
  'TKKF Aut ?agisza B?dzin': 'TKKF Aut Łagisza Będzin',
  'UKS D?browiak D?browa Górnicza': 'UKS Dąbrowiak Dąbrowa Górnicza',
  'UKS Ikar Mierz?cice': 'UKS Ikar Mierzęcice',
  'UKS Wolej Solver II Ruda ?l?ska': 'UKS Wolej Solver II Ruda Śląska',
  'UKS Wolej Solver III Ruda ?l?ska': 'UKS Wolej Solver III Ruda Śląska',
  'UKS Wolej Solver Ruda ?l?ska': 'UKS Wolej Solver Ruda Śląska',
  'ULKS P?awniowice': 'ULKS Pławniowice',
  'ULKS Tajfun Ligota ?ab?dzka': 'ULKS Tajfun Ligota Łabędzka'
};

/**
 * Mapa naprawcza NAZWISK zawodników (v1.4.2) — ta sama wada latin1 serwera.
 * Wartości zweryfikowane 01.11.2026 w rejestrze licencji PZTS ISL
 * (isl.pzts.pl) — łącznik to nr licencji ŚZTS (stabilny ASCII, pokrywa
 * się z numeracją PZTS; numer w komentarzu przy każdym wpisie).
 * Dwóch amatorów bez licencji PZTS zweryfikowano źródłami klubowymi.
 * Klucz = nazwa dokładnie taka, jak ją widzi parser (z „?”).
 * Lustrzana kopia NAPRAWA_IMION z szts-core.ts — utrzymywać wspólnie,
 * ALFABETYCZNIE; nowe uszkodzone nazwisko = widoczne „?” w arkuszu
 * + wpis w „Log” = sygnał do dopisania wiersza (po weryfikacji w ISL).
 */
var NAPRAWA_IMION = {
  'Adam Pasi?ski': 'Adam Pasiński',                          // 11329
  'Andrzej ?amojda': 'Andrzej Żamojda',                      // 11334
  'Artur Bia?ek': 'Artur Białek',                            // 01591
  'Daniel ?asak': 'Daniel Łasak',                            // amator bez licencji PZTS — weryfikacja klubowa
  'Grzegorz Macha?': 'Grzegorz Machał',                      // 08890
  'Jakub D?browski': 'Jakub Dąbrowski',                      // 08885
  'Jaros?aw Koz?owski': 'Jarosław Kozłowski',                // 08887
  'Jaros?aw Tomicki': 'Jarosław Tomicki',                    // 01596
  'Marcin Macha?': 'Marcin Machał',                          // 07756
  'Mariusz ??czycki': 'Mariusz Łęczycki',                    // 11327
  'Micha? Bodnar': 'Michał Bodnar',                          // 08882
  'Micha? Rosiek': 'Michał Rosiek',                          // 08894
  'Miros?aw Soko?owski': 'Mirosław Sokołowski',              // 08895
  'Pawe? Kajdrowicz': 'Paweł Kajdrowicz',                    // 11323
  'Pawe? Stefanów': 'Paweł Stefanów',                        // 08897
  'Piotr ?agowski': 'Piotr Łagowski',                        // 08889
  'Piotr Zem?a': 'Piotr Zemła',                              // 08899
  'Rafa? Adach': 'Rafał Adach',                              // 08881
  'Rafa? Opozda': 'Rafał Opozda',                            // 08892
  'Roman Wi?a': 'Roman Wiża',                                // 08898 — korekta: wcześniej „Wiła”, rejestr PZTS mówi „Wiża”
  'Zdzis?aw Domeradzki': 'Zdzisław Domeradzki',              // amator; potwierdzenie: FB klubu (GP Gliwic 2019)
  '?ukasz Francka': 'Łukasz Francka',                        // 11324
  '?ukasz Strof': 'Łukasz Strof',                            // 01594
  '?ukasz Stopka': 'Łukasz Stopka'                           // 11333
};

/**
 * Imiona z literami spoza latin-1 (ą ć ę ł ń ś ź ż — ó uszkodzenie
 * zostawia w spokoju, bo jest w latin-1). Zamknięty zbiór → naprawa
 * słownikowa jest deterministyczna: maska uszkodzenia (patrz
 * maskaUszkodzenia_) pasuje w całym słowniku do DOKŁADNIE JEDNEGO
 * imienia — złote reguły: „?ukasz”→Łukasz, „Micha?”→Michał,
 * „Rafa?”→Rafał, „Jaros?aw”→Jarosław, „Pawe?”→Paweł, „Zdzis?aw”→Zdzisław.
 */
var IMIONA_PL = [
  'Bartłomiej', 'Błażej', 'Bogusław', 'Bogusława', 'Bolesław', 'Bożena',
  'Bronisław', 'Czesław', 'Elżbieta', 'Grażyna', 'Jarosław', 'Łucja',
  'Łukasz', 'Małgorzata', 'Michał', 'Mieczysław', 'Miłosz', 'Mirosława',
  'Mirosław', 'Paweł', 'Przemysław', 'Radosław', 'Rafał', 'Sławomira',
  'Sławomir', 'Stanisława', 'Stanisław', 'Wacława', 'Wacław', 'Wiesława',
  'Wiesław', 'Władysław', 'Włodzimierz', 'Zdzisława', 'Zdzisław', 'Żaneta'
];

/**
 * Naprawa NARODOWOŚCI w składach (v1.4.2) — ta sama wada latin1.
 * Dziś wszyscy nasi zawodnicy mają „Polska” (bezpieczne znaki), mapa
 * chroni na przyszłość (cudzoziemcy w ligach ŚZTS się zdarzają).
 */
var NAPRAWA_NARODOWOSCI = {
  'Bia?oru?': 'Białoruś',
  'Bo?nia i Hercegowina': 'Bośnia i Hercegowina',
  'Bu?garia': 'Bułgaria',
  'Mo?dowa': 'Mołdowa',
  'S?owacja': 'Słowacja',
  'S?owenia': 'Słowenia',
  'W?gry': 'Węgry',
  'W?ochy': 'Włochy',
  '?otwa': 'Łotwa'
};

/**
 * Korekty godzin — wiedza terenowa klubu vs błąd źródła ŚZTS (Task 93):
 * czwartkowe domowe mecze KTS II w 2LM: źródło pokazuje 19:15, klub gra 19:00.
 * Klucz „data|gospodarz|gość”; wpisy same wygasają po 12.02.2027.
 */
var KOREKTY_GODZIN = {
  '2026-10-22|KTS II Gliwice|GUKS Byczyna': '19:00',
  '2026-11-05|KTS II Gliwice|KTS Olimpijczyk Zawiercie': '19:00',
  '2026-12-03|KTS II Gliwice|MKS Skarbek II Tarnowskie Góry': '19:00',
  '2027-01-14|KTS II Gliwice|KS Naprzód II Borucin': '19:00',
  '2027-02-11|KTS II Gliwice|MUKS Jedynka Pszów': '19:00'
};

/** Rejestr korekt zastosowanych w bieżącym przebiegu (do „Log”). */
var KOREKTY_RUNU = [];

/**
 * v1.5.0: skład PZTS zdjęty z odpowiedzi odswierzPzts_ w TYM przebiegu
 * (darmowy — ta sama strona drużyny co terminarz); odswierzZawodnikow_
 * wykorzystuje go zamiast drugiego pobrania, gdy okno składów otwarte.
 */
var PZTS_SKLAD_BUFOR = null;

/**
 * v1.5.3: notatki diagnostyczne z OSTATNIEGO parsujTabelePzts_ (punkty
 * liczone z bilansu, odstępstwa odczytu od bilansu — jawność);
 * odswierzPzts_ wypisuje je do „Log”, testPztsKanalow pokazuje na ekranie.
 */
var PZTS_NOTATKI = [];

/**
 * Rejestr uszkodzonych tekstów ŚZTS nierozpoznanych przez mapy naprawcze
 * (v1.4.2) — jawność: „?” widoczne w arkuszu + wpis w „Log” = sygnał do
 * dopisania wiersza do NAPRAWA_NAZW / NAPRAWA_IMION (nazwiska weryfikuj
 * w rejestrze PZTS ISL po nr licencji). Obiekt deduplikuje per przebieg.
 */
var USZKODZENIA_RUNU = {};

/** Zgłasza tekst z niewynaprawionym „?” do rejestru przebiegu (deduplikacja). */
function zglaszUszkodzenie_(tekst, licencja) {
  if (!tekst || String(tekst).indexOf('?') < 0) return;
  var klucz = tekst + '|' + (licencja || '');
  if (!USZKODZENIA_RUNU[klucz]) {
    USZKODZENIA_RUNU[klucz] = licencja ? (tekst + ' (lic. ' + licencja + ')') : String(tekst);
  }
}

/**
 * Czy drużyna należy do KTS GLIWICE?
 * Reguła (właściciel 12.11): nazwa zaczyna się od „KTS” i kończy
 * na „Gliwice” — to łapie KTS Gliwice, KTS II–VI Gliwice ORAZ
 * KTS KA Krokus VII Gliwice — a wypuszcza obce „KTS Olimpijczyk
 * Zawiercie” i każdą przyszłą inną drużynę z Gliwic. Dodatkowo: „Krokus”.
 */
function naszaDruzyna_(nazwa) {
  var n = String(nazwa || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!n) return false;
  if (/^KTS\s.*GLIWICE$/.test(n)) return true;   // „KTS … Gliwice”
  if (n.indexOf('KROKUS') >= 0) return true;     // dopisek bezpieczeństwa
  return false;
}

/**
 * Nazwa z ŚZTS → nazwa właściwa (mapa naprawcza) albo bez zmian.
 * Jedyny lejek dla WSZYSTKICH nazw drużyn (tabele, terminarze, linki —
 * nasze i przeciwników). Nierozpoznane uszkodzenie zostaje z „?”
 * i trafia do rejestru przebiegu (jawny sygnał do dopisania do mapy).
 */
function naprawNazwe_(nazwa) {
  var naprawiona = NAPRAWA_NAZW[nazwa] || nazwa;
  if (naprawiona.indexOf('?') >= 0) zglaszUszkodzenie_(naprawiona, null);
  return naprawiona;
}

/** Odwzorowanie szkody ŚZTS: litery spoza latin-1 → „?” (ó zostaje). */
function maskaUszkodzenia_(s) {
  return String(s).replace(/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g, '?');
}

/**
 * Słownikowa naprawa JEDNEGO tokenu (imienia). Warunek bezpieczeństwa:
 * maska tokenu pasuje do dokładnie jednego imienia ze słownika —
 * zero lub >1 trafień = token bez zmian („?” zostaje jawne; naprawia
 * je wtedy tylko mapa pełnych nazwisk).
 */
function naprawImie_(token) {
  if (token.indexOf('?') < 0) return token;
  var trafienia = 0;
  var naprawiony = token;
  for (var i = 0; i < IMIONA_PL.length; i++) {
    if (maskaUszkodzenia_(IMIONA_PL[i]) === token) {
      trafienia++;
      naprawiony = IMIONA_PL[i];
      if (trafienia > 1) return token;          // niejednoznaczne — nie ruszam
    }
  }
  return trafienia === 1 ? naprawiony : token;
}

/**
 * Naprawa pełnego wpisu „Imię [Drugie] Nazwisko” (v1.4.2):
 *  1. mapa pełnych nazwisk NAPRAWA_IMION (najwyższy priorytet),
 *  2. naprawa słownikowa imion — wszystkie tokeny oprócz OSTATNIEGO
 *     (nazwiska to otwarty zbiór: pomyłka byłaby gorsza niż jawne „?”;
     naprawia je wyłącznie mapa).
 * Lustrzana kopia naprawNazwiskoZawodnika z szts-core.ts.
 */
function naprawNazwiskoZawodnika_(nazwaRaw) {
  var zMapy = NAPRAWA_IMION[nazwaRaw];
  if (zMapy !== undefined) return zMapy;
  var tokeny = String(nazwaRaw).split(' ');
  if (tokeny.length < 2) return nazwaRaw;
  for (var i = 0; i < tokeny.length - 1; i++) tokeny[i] = naprawImie_(tokeny[i]);
  return tokeny.join(' ');
}

/**
 * Komórka HTML → znośny tekst. v1.5.3: dekoduje encje HTML (&#NNN;,
 * &#xHH;, &amp; &lt; &gt; &quot; &nbsp; &ndash; &mdash;) i zdejmuje znaki
 * zero-width (U+200B/200C/200D/2060/FEFF/202F) — pzts.pl dokleja je
 * wokół scalonych komórek (rowspan), przez co „Pkt” par ex aequo
 * wyglądał na nie-liczbę (IMPORTHTML Google dekoduje encje i widział
 * „8”, a my widzieliśmy „8&#8203;”). &amp; dekodowane OSTATNIE (kolejność
 * przy podwójnych escapach). 
 */
function czystaKomorka_(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&#[xX]([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[\u200b\u200c\u200d\u2060\ufeff\u202f]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * v1.5.3: komórka → czysta liczba całkowita (1–3 cyfr) albo null.
 * Zdejmuje białe (w tym &nbsp;) i zero-width — działa dla komórek
 * HTML (czystaKomorka_) i Markdown (pztsKomorkaMd_ — tam encji nie ma,
 * ale zero-width teoretycznie tak).
 */
function pztsCzystaLiczba_(komorka) {
  var s = String(komorka).replace(/[\s\u00a0\u200b\u200c\u200d\u2060\ufeff\u202f]/g, '');
  if (!/^\d{1,3}$/.test(s)) return null;
  return parseInt(s, 10);
}

/**
 * v1.5.4: komórka „Pkt” → punkty wprost albo null. U źródła PZTS
 * komórka Pkt pary ex aequo przybiera formę „8 (2) -->” (punkty +
 * dopisek w nawiasie + strzałka sortowania) — pztsCzystaLiczba_
 * odrzuca ją jako nieczystą. Tutaj: PIERWSZA liczba, gdy komórka to
 * wyłącznie „N” / „N (x)” / „N(x)” (ogon od strzałki „-->” ucinamy,
 * przed ucięciem znikają też białe i zero-width). „31:19 (1.632)”
 * (kolumna „Pojed.”) NIE przejdzie: po pierwszej liczbie regex
 * wymaga końca albo nawiasu z samą liczbą — dwukropek wyklucza.
 * Gwarancja zostaje (parsujTabelePzts_): odczyt ≠ 2·Z+R → wpis
 * jawności w „Log” (PZTS_NOTATKI).
 */
function pztsPunktyZKomorki_(komorka) {
  var s = String(komorka).replace(/[\s\u00a0\u200b\u200c\u200d\u2060\ufeff\u202f]/g, '');
  var ciecie = s.indexOf('-->');
  if (ciecie >= 0) s = s.slice(0, ciecie);
  var m = s.match(/^(\d{1,3})(?:\((\d{1,3})\))?$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * Komórki HTML wiersza POZYCYJNIE — bez odfiltrowywania pustych (v1.4).
 * Sekcja „Skład zespołu” ma 7 kolumn; pusta wartość NIE może przesunąć
 * kolejnych (lustrzana zasada parsujSklad z szts-core.ts).
 */
function komorkiPoz_(wierszHtml) {
  var komorki = [];
  var re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
  var m;
  while ((m = re.exec(wierszHtml)) !== null) komorki.push(czystaKomorka_(m[1]));
  return komorki;
}

/** Sekcja „Tabela ligowa” → lista wierszy {pozycja, nazwa, mecze, punkty, stosunek}. */
function parsujTabele_(html) {
  var start = html.indexOf('Tabela ligowa');
  if (start < 0) return [];
  var frag = html.slice(start, html.indexOf('</table>', start));
  var wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  var wynik = [];
  for (var i = 0; i < wiersze.length; i++) {
    var komorki = [];
    var re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    var m;
    while ((m = re.exec(wiersze[i])) !== null) {
      var c = czystaKomorka_(m[1]);
      if (c !== '') komorki.push(c);
    }
    // oczekiwany układ: ["8.", "KTS II Gliwice", "2", "2", "14:6"]
    if (komorki.length >= 5 && /^\d+\.$/.test(komorki[0])) {
      var pozycja = parseInt(komorki[0], 10);
      var nazwa = naprawNazwe_(komorki[1]);
      var mecze = parseInt(komorki[komorki.length - 3], 10);
      var punkty = parseInt(komorki[komorki.length - 2], 10);
      var stosunek = komorki[komorki.length - 1];
      if (nazwa && isFinite(pozycja) && isFinite(mecze) && isFinite(punkty)) {
        wynik.push({ pozycja: pozycja, nazwa: nazwa, mecze: mecze, punkty: punkty, stosunek: stosunek });
      }
    }
  }
  return wynik;
}

/** Sekcja „Terminarz” → lista WSZYSTKICH meczów ligi (sezon + wyniki). */
function parsujTerminarz_(html) {
  var start = html.indexOf('Terminarz');
  if (start < 0) return [];
  var frag = html.slice(start, html.indexOf('</table>', start));
  var wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  var mecze = [];
  for (var i = 0; i < wiersze.length; i++) {
    var w = wiersze[i];
    var dm = w.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;                          // nagłówek / wiersz sędziego
    var data = dm[1];
    if (/-00-00$/.test(data)) continue;         // mecze bez terminu (kolejki nieustalone)

    var gm = w.match(/g\.\s*(\d{1,2}:\d{2})/);
    var godzina = gm ? gm[1] : '';

    // kolejka: dwa formaty u źródła („1<br />” oraz „1/?LA<br />”)
    var kol = w.match(/<strong>\d+<\/strong>\s*<br>[^<]*?(\d+)\s*[^<\d]*<br\s*\/?\s*>/);
    var kolejka = kol ? parseInt(kol[1], 10) : null;

    var komorki = [];
    var re = /<td[^>]*>([\s\S]*?)<\/td>/g;
    var m;
    while ((m = re.exec(w)) !== null) {
      var c = czystaKomorka_(m[1]);
      if (c !== '') komorki.push(c);
    }
    var idxWynik = -1;
    for (var k = 0; k < komorki.length; k++) {
      if (/^(\d+\s*:\s*\d+|-:-)$/.test(komorki[k])) idxWynik = k;
    }
    if (idxWynik < 2) continue;
    var wynik = komorki[idxWynik].replace(/\s+/g, '');
    var gospodarz = naprawNazwe_(komorki[idxWynik - 2]);
    var gosc = naprawNazwe_(komorki[idxWynik - 1]);
    if (!gospodarz || !gosc) continue;

    // korekta godzin (wiedza klubowa vs błąd źródła)
    var korekta = KOREKTY_GODZIN[data + '|' + gospodarz + '|' + gosc];
    var godzinaKoncowa = godzina;
    if (korekta !== undefined) {
      KOREKTY_RUNU.push(data + ' ' + gospodarz + '–' + gosc + ': ' + (godzina || '?') + ' → ' + korekta);
      godzinaKoncowa = korekta;
    }

    mecze.push({
      dataMeczu: data,
      godzina: godzinaKoncowa,
      kolejka: kolejka,
      gospodarz: gospodarz,
      gosc: gosc,
      wynik: wynik,
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynik)
    });
  }
  return mecze;
}

/**
 * Nazwa drużyny (po naprawie) → adres podstrony /druzyna/… (v1.4).
 * Linki siedzą w sekcji „Tabela ligowa” przy nazwach drużyn — wyciągane
 * GRATIS ze strony, którą most i tak pobiera (zero dodatkowych zapytań).
 * Lustrzana kopia parsujLinkiDruzyn z szts-core.ts.
 */
function parsujLinkiDruzyn_(html) {
  var mapa = {};
  var start = html.indexOf('Tabela ligowa');
  if (start < 0) return mapa;
  var koniec = html.indexOf('</table>', start);
  var frag = koniec > start ? html.slice(start, koniec) : html.slice(start);
  var re = /<a[^>]+href="(\/druzyna\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  var m;
  while ((m = re.exec(frag)) !== null) {
    var nazwa = naprawNazwe_(czystaKomorka_(m[2]));
    if (nazwa) mapa[nazwa] = 'https://ligi.slzts.pl' + m[1];
  }
  return mapa;
}

/**
 * Sekcja „Skład zespołu” (podstrona /druzyna/…) → lista zawodników
 * (v1.4). Układ 7 kolumn: Nr licencji | Imię i nazwisko | Narodowość |
 * Rok ur. | Zwycięstwa | Porażki | Punkty. Wiersz nagłówka („Nr licencji”)
 * pomijany; liczby 0 są WARTOŚCIĄ (0 zwycięstw ≠ brak danych); rok poza
 * 1900–2100 → pusty (ŚZTS wystawia „-0001” dla zawodników bez roku).
 * v1.4.2: NAZWISKA i NARODOWOŚCI przechodzą naprawę polskich znaków
 * (mapa nazwisk zweryfikowana rejestrem PZTS ISL + słownik imion);
 * nierozpoznane uszkodzenia zostają z „?” i lądują w „Log”.
 * Lustrzana kopia parsujSklad z szts-core.ts.
 */
function parsujSklad_(html) {
  var start = html.indexOf('Skład zespołu');
  if (start < 0) return [];
  var koniec = html.indexOf('</table>', start);
  var frag = koniec > start ? html.slice(start, koniec) : html.slice(start);
  var wiersze = frag.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  var wynik = [];
  for (var i = 0; i < wiersze.length; i++) {
    var komorki = komorkiPoz_(wiersze[i]);
    if (komorki.length !== 7) continue;                  // nagłówki „Zawodnik | Statystyki | …”
    if (/^nr licencji$/i.test(komorki[0])) continue;     // wiersz nagłówka kolumn
    if (!komorki[1]) continue;                           // pusty wiersz
    // v1.4.2: naprawa polskich znaków (wada latin1 serwera ŚZTS)
    var nazwisko = naprawNazwiskoZawodnika_(komorki[1]);
    if (nazwisko.indexOf('?') >= 0) zglaszUszkodzenie_(nazwisko, komorki[0]);
    var narodowosc = NAPRAWA_NARODOWOSCI[komorki[2]] || komorki[2] || '';
    if (narodowosc.indexOf('?') >= 0) zglaszUszkodzenie_(narodowosc, null);
    var rok = parseInt(komorki[3], 10);
    if (!(rok >= 1900 && rok <= 2100)) rok = 0;
    wynik.push({
      nazwisko: nazwisko,
      licencja: /^\d{3,6}$/.test(komorki[0]) ? komorki[0] : '',
      narodowosc: narodowosc,
      rok: rok > 0 ? String(rok) : '',
      zwyciestwa: /^\d+$/.test(komorki[4]) ? komorki[4] : '',
      porazki: /^\d+$/.test(komorki[5]) ? komorki[5] : '',
      punkty: /^\d+\s*:\s*\d+$/.test(komorki[6]) ? komorki[6].replace(/\s+/g, '') : ''
    });
  }
  return wynik;
}

/** Nazwa karty strony dla drużyny ŚZTS w lidze (mapa → generator). */
function kartaDla_(skrot, nazwaSzts) {
  var k = KARTY_DRUZYN[skrot + '|' + nazwaSzts];
  if (k) return k;
  var n = String(nazwaSzts || '').replace(/\s+Gliwice$/, '').trim();
  n = n.replace(/^KTS\s+KA\s+/, 'KA ');
  return n || nazwaSzts;
}

/* ================= PZTS: parsery czyste (v1.5.0) =================
 * Konwencja lustrzana z sync_statyczny (parsujTerminarzPzts /
 * parsujTabelePzts / parsujSkladGviz — produkcja od 20.10), ale
 * ujednolicona: HTML (kanał bezpośredni) i Markdown (czytnik jina)
 * normalizowane do WSPÓLNEJ postaci „tabele → wiersze → komórki”,
 * a semantyka (klasyfikacja tabel po nagłówkach/kształcie) JEDNA.
 * Struktura stron PZTS (QA 12.11):
 *  · strona LIGI: tabela ligowa Poz|Drużyna|M|Z|R|P|Pojed|Pkt
 *    + okna czasowe (nadchodzące 7 dni / ostatnie wyniki) — PEŁNEGO
 *    terminarza sezonu na stronie ligi nie ma;
 *  · strona DRUŻYNY: tabela składu (Nazwisko i imię z wiekiem w
 *    nawiasie i krajem | Nr licencji | Pojedynki | Zwycięstwa |
 *    Porażki | Skuteczność) + pełnosezonowy terminarz DRUŻYNY
 *    (Data z „g. HH:MM” | numer meczu+kolejka | Gospodarz | Gość |
 *    Wynik | Szczegóły) + tabela wyników ligi (inne drużyny).
 */

/**
 * Kolejka z komórki „numer meczu + kolejka”. U źródła PZTS siedzą
 * tam DWIE liczby: nr meczu i nr kolejki — gviz/CSV pokazuje je jako
 * dwie linie („503\n1”), czytnik Markdown skleja („5031”). Reguły:
 *  · kilka liczb → OSTATNIA (zawsze ≤ 30, inaczej null);
 *  · jedna zbita liczba 4–5 cyfr → pierwsze 3 to nr meczu, reszta
 *    to kolejka („5031”→1, „2348”→8, „34210”→10);
 *  · jedna liczba 1–2 cyfrowa → ona sama („7”→7);
 *  · cokolwiek innego → null (jawne „nie wiem” zamiast zmyślonej).
 */
function pztsKolejka_(s) {
  var runs = String(s || '').match(/\d+/g) || [];
  if (runs.length === 0) return null;
  if (runs.length >= 2) {
    var k = parseInt(runs[runs.length - 1], 10);
    return (k >= 1 && k <= 30) ? k : null;
  }
  var jedyna = runs[0];
  if (jedyna.length >= 4 && jedyna.length <= 5) {
    var k2 = parseInt(jedyna.slice(3), 10);
    return (k2 >= 1 && k2 <= 30) ? k2 : null;
  }
  if (jedyna.length >= 1 && jedyna.length <= 2) return parseInt(jedyna, 10);
  return null;
}

/**
 * Komórka Markdown → tekst. Zdejmuje linki [tekst](url) → tekst oraz
 * pogrubienia; jeśli w komórce jest kilka pogrubień, bierzemy
 * OSTATNIE (konwencja ostatniaPogrubiona z syncu — nazwa drużyny
 * bywa druga po numerze wródka itp.).
 */
function pztsKomorkaMd_(pole) {
  var bezLinkow = String(pole).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  var pogrubienia = bezLinkow.match(/\*\*([^*]+)\*\*/g);
  if (pogrubienia && pogrubienia.length > 0) {
    return pogrubienia[pogrubienia.length - 1].replace(/\*\*/g, '').trim();
  }
  return bezLinkow.replace(/\*/g, '').trim();
}

/** Atrybut liczbowy taga (rowspan/colspan) — 1, gdy brak lub błędny. */
function pztsAtrybut_(tagHtml, nazwa) {
  var m = String(tagHtml).match(new RegExp(nazwa + '\\s*=\\s*"?\\d+"?', 'i'));
  if (!m) return 1;
  var n = parseInt(String(m[0]).replace(/[^0-9]/g, ''), 10);
  return (n >= 1 && n <= 50) ? n : 1;
}

/**
 * Wiersze tabeli HTML z ROZWIĄZANIEM rowspan/colspan (v1.5.1).
 * pzts.pl scala komórkę „Poz.” dla drużyn EX AEQUO (np. „2-3” na 2
 * wiersze): komórka z rowspan=2 należy tylko do PIERWSZEGO wiersza pary,
 * a drugi traci kolumnę i cały przesuwa się w lewo — parser pozycyjny
 * v1.5.0 gubił oba wiersze pary (w tabeli 1LM zostały tylko wiersze
 * bez remisu: 1, 4, 7, 8). Tutaj: kolumny z aktywnym rowspan są
 * WSTRZYKIWANE do wierszy następnych, colspan powiela wartość na
 * kolejne kolumny. Zwraca listę wierszy (komórki tekstowe, bez dziur).
 */
function pztsWierszeZRozpijeciami_(htmlTabeli) {
  var wiersze = [];
  var nosniki = [];   // kolumna → { pozostalo, wartosc }
  var reW = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  var mW;
  while ((mW = reW.exec(htmlTabeli)) !== null) {
    var wiersz = [];
    var kol = 0;
    var reC = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    var mC;
    while ((mC = reC.exec(mW[1])) !== null) {
      // kolumny zajęte przez rowspan-y wyższych wierszy — wstrzykujemy
      while (nosniki[kol] && nosniki[kol].pozostalo > 0) {
        wiersz[kol] = nosniki[kol].wartosc;
        nosniki[kol].pozostalo--;
        if (nosniki[kol].pozostalo === 0) nosniki[kol] = null;
        kol++;
      }
      var rozPion = pztsAtrybut_(mC[0], 'rowspan');
      var rozPoziom = pztsAtrybut_(mC[0], 'colspan');
      var wartosc = czystaKomorka_(mC[1]);
      for (var c = 0; c < rozPoziom; c++) {
        wiersz[kol] = wartosc;
        if (rozPion > 1 && !nosniki[kol]) {
          nosniki[kol] = { pozostalo: rozPion - 1, wartosc: wartosc };
        }
        kol++;
      }
    }
    // wiersz sam nie miał już własnych komórek — czysta kontynuacja
    while (kol < 60 && nosniki[kol] && nosniki[kol].pozostalo > 0) {
      wiersz[kol] = nosniki[kol].wartosc;
      nosniki[kol].pozostalo--;
      if (nosniki[kol].pozostalo === 0) nosniki[kol] = null;
      kol++;
    }
    var wynik = [];
    for (var k = 0; k < wiersz.length; k++) wynik.push(wiersz[k] === undefined ? '' : wiersz[k]);
    if (wynik.join('').replace(/\s/g, '') !== '') wiersze.push(wynik);
  }
  return wiersze;
}

/**
 * HTML albo Markdown → lista tabel, każda = lista wierszy (komórki).
 *  · HTML: <table>…</table> → <tr> → pztsWierszeZRozpijeciami_
 *    (v1.5.1: z ROZWIĄZANIEM rowspan/colspan — pzts.pl scala „Poz.”
 *    dla ex aequo; poprzednio czytano pozycyjnie przez komorkiPoz_);
 *  · Markdown (czytnik r.jina.ai): bloki linii od „|”; separator
 *    „| --- |” pomijany; komórki przez pztsKomorkaMd_.
 * Blok < 2 wierszy nie jest tabelą (szum nagłówków czytnika).
 */
function pztsTabeleZTekstu_(tekst) {
  var tabele = [];
  var t = String(tekst || '');
  if (t.indexOf('<table') >= 0 || t.indexOf('<td') >= 0) {
    var reT = /<table[^>]*>([\s\S]*?)<\/table>/g;
    var mT;
    while ((mT = reT.exec(t)) !== null) {
      var wierszeTab = pztsWierszeZRozpijeciami_(mT[1]);
      if (wierszeTab.length >= 2) tabele.push(wierszeTab);
    }
  } else {
    var linie = t.split('\n');
    var blok = [];
    for (var i = 0; i < linie.length; i++) {
      var l = linie[i].trim();
      if (l.charAt(0) === '|') {
        if (/^\|\s*:?-{2,}/.test(l)) continue;            // separator MD
        var pola = l.split('|');
        pola.shift();                                       // puste przed 1. |
        if (pola.length > 0 && pola[pola.length - 1].trim() === '') pola.pop();
        var komorkiMd = [];
        for (var j = 0; j < pola.length; j++) komorkiMd.push(pztsKomorkaMd_(pola[j]));
        if (komorkiMd.length > 0) blok.push(komorkiMd);
      } else if (blok.length > 0) {
        if (blok.length >= 2) tabele.push(blok);
        blok = [];
      }
    }
    if (blok.length >= 2) tabele.push(blok);
  }
  return tabele;
}

/**
 * Czy tekst strony ligi wygląda na ŻYWĄ rozgrywkę (v1.5.2): ma przyszłą
 * datę (ISO, względem „dzisiaj”) albo nierozegrane spotkanie „-:-”.
 * Zamrożona liga ARCHIWALNA (sezon 2025/26) nie ma żadnego z tych —
 * choć nasza drużyna nadal widnieje w jej tabeli (stąd fałszywy alarm
 * „2 ligi” z v1.5.0/1: żywa id=82 + archiwalna id=73). Skrypty/style
 * odcinane (szablony JS potrafią trzymać „-:-” w kodzie). HTML i Markdown.
 */
function pztsLigaZywa_(tekst, dzisiaj) {
  var t = String(tekst || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  if (/-\s*:\s*-/.test(t)) return true;
  var prog = String(dzisiaj || '');
  if (prog) {
    var re = /20\d{2}-\d{2}-\d{2}/g;
    var m;
    while ((m = re.exec(t)) !== null) {
      if (m[0] > prog) return true;   // porównanie tekstowe dat ISO
    }
  }
  return false;
}

/**
 * Tabela ligowa PZTS ze strony LIGI: Pozycja | Drużyna | M | Z | R | P |
 * Pojed. | Pkt („Pojed.” bywa bilansem „55:11”, średnią z przecinkiem
 * „1,84” albo pustą — nie bierze udziału w klasyfikacji).
 * v1.5.3 — NAPRAWA PUNKTÓW PAR EX AEQUO (żywy audyt 13.11: parom
 * zapisywało P porażek zamiast Pkt — encje HTML przy scalonych
 * komórkach czyniły „Pkt” nieczystym; szczegóły w nagłówku pliku).
 * v1.5.2 — odporność na realne brzydoty pzts.pl (żywy audyt 12.11:
 * w arkuszu zostały 4 z 10 drużyn — dokładnie pary EX AEQUO):
 *  · pozycje-ZAKRESY ex aequo („2-3”, „2. - 3.”) — akceptowane; wiersze
 *    pary dostają kolejne numery (2., 3. — konwencja starego mostu);
 *  · rowspan na „Poz.” — rozwiązywany w pztsWierszeZRozpijeciami_;
 *    dodatkowo wiersz BEZ pozycji (puste w[0], ale kształt tabeli
 *    ligowej) dostaje pozycję następną po poprzednim wierszu;
 *  · tabela PODZIELONA na kilka <table> — zbiórka z WSZYSTKICH + dedup
 *    po (pozycja|nazwa) — duplikat całej tabeli też znika;
 *  · punkty = ostatnia czysta liczba ZA blokiem M/Z/R/P (v1.5.3; wcześniej
 *    „ostatnia czysta liczba wiersza” — lądowała na P porażek); M/Z/R/P =
 *    4 czyste liczby po nazwie, z twardą kontrolą Z+R+P = M (odrzuca
 *    okna czasowe, składy, terminarze i pozostałe tabele strony).
 */
function parsujTabelePzts_(tekst) {
  PZTS_NOTATKI = [];                                        // v1.5.3: diagnostyka per wywołanie
  var tabele = pztsTabeleZTekstu_(tekst);
  var zbiorczo = [];
  var widziane = {};
  for (var t = 0; t < tabele.length; t++) {
    var wiersze = tabele[t];
    for (var i = 0; i < wiersze.length; i++) {
      var w = wiersze[i];
      if (w.length < 7) continue;
      var komPoz = String(w[0] || '').trim();
      var pm = komPoz.match(/^(\d{1,2})(?:[\s.\-–]+\d{1,2})?\s*\.?$/);
      var carry = false;
      if (!pm) {
        if (komPoz !== '') continue;          // ani liczba, ani puste — nie tabela ligowa
        carry = true;                          // wiersz bez pozycji (rowspan/Markdown)
      }
      var nazwa = String(w[1] || '').trim();
      if (!nazwa || /^[\d\s.,:;+\-–]+$/.test(nazwa)) continue;
      var liczby = [];
      var n = 2;
      for (; n < w.length - 1 && liczby.length < 4; n++) {
        var s = pztsCzystaLiczba_(w[n]);
        if (s !== null) liczby.push(s);
        else if (liczby.length > 0) break;
      }
      if (liczby.length < 4) continue;
      var mecze = liczby[0], zw = liczby[1], rm = liczby[2], pe = liczby[3];
      if (zw + rm + pe !== mecze) continue;
      // v1.5.4: Pkt szukamy ZA blokiem M/Z/R/P (n = pierwsza komórka za
      // czwartą liczbą) — skan od końca wiersza. pztsPunktyZKomorki_
      // czyta wprost też komórki par ex aequo „8 (2) -->” (v1.5.3 brała
      // je z bilansu — poprawnie, ale z wpisem diagnostycznym);
      // „Pojed.” („31:19 (1.632)”) nie ma prawa przejść (dwukropek).
      var punkty = null;
      for (var k = w.length - 1; k >= n; k--) {
        var c = pztsPunktyZKomorki_(w[k]);
        if (c !== null) { punkty = c; break; }
      }
      if (punkty === null || punkty > 200) {
        punkty = 2 * zw + rm;               // v1.5.3: punktacja PZTS — 2 pkt za wygraną, 1 za remis
        PZTS_NOTATKI.push(nazwa + ': Pkt nieczytelne — policzone z bilansu 2·Z+R = ' + punkty +
          ' (wiersz: ' + w.join(' | ') + ')');
      } else if (punkty !== 2 * zw + rm) {
        PZTS_NOTATKI.push(nazwa + ': Pkt odczytane ' + punkty + ' ≠ bilans 2·Z+R ' + (2 * zw + rm) +
          ' (wiersz: ' + w.join(' | ') + ')');
      }
      var pozycja = carry
        ? (zbiorczo.length > 0 ? zbiorczo[zbiorczo.length - 1].pozycja + 1 : 1)
        : parseInt(pm[1], 10);
      var zakres = (pm && /\d[\s.\-–]+\d/.test(komPoz)) ? komPoz : '';
      var klucz = pozycja + '|' + nazwa;
      if (widziane[klucz]) continue;
      widziane[klucz] = true;
      zbiorczo.push({
        pozycja: pozycja,
        pozycjaZakres: zakres,
        nazwa: nazwa,
        mecze: mecze,
        punkty: punkty,
        stosunek: zw + '-' + rm + '-' + pe
      });
    }
  }
  // pary ex aequo: oba wiersze pary niosą ten sam zakres („2-3”) —
  // drugiemu dajemy kolejny numer pozycji (2., 3.)
  for (var q = 1; q < zbiorczo.length; q++) {
    if (zbiorczo[q].pozycjaZakres !== '' &&
        zbiorczo[q].pozycjaZakres === zbiorczo[q - 1].pozycjaZakres &&
        zbiorczo[q].pozycja <= zbiorczo[q - 1].pozycja) {
      zbiorczo[q].pozycja = zbiorczo[q - 1].pozycja + 1;
    }
  }
  zbiorczo.sort(function (a, b) { return a.pozycja - b.pozycja; });
  return zbiorczo;
}

/**
 * Pełnosezonowy TERMINARZ NASZEJ DRUŻYNY ze strony DRUŻYNY. Na stronie
 * są tabele z datami również bez nas (wyniki ligi) — wybieramy tę, w
 * której nasza drużyna występuje w KAŻDYM wierszu (a gdy takiej nie
 * ma — tę z największą liczbą wierszy z nami; 0 = brak).
 * Kształt wiersza: Data (z „g. HH:MM”) | nr meczu+kolejka | Gospodarz |
 * Gość | Wynik | Szczegóły. Wynik lokalizowany po wzorcu (jak w ŚZTS),
 * gospodarz/gość = 2 komórki przed nim.
 */
function parsujTerminarzPzts_(tekst, nazwaNaszej) {
  var tabele = pztsTabeleZTekstu_(tekst);
  var nasza = String(nazwaNaszej || 'KTS Gliwice');
  var najlepsza = null;
  var najlepszyWynik = -1;
  for (var t = 0; t < tabele.length; t++) {
    var wiersze = tabele[t];
    var zNami = 0, dataWierszy = 0;
    for (var i = 0; i < wiersze.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(wiersze[i][0] || ''))) continue;
      dataWierszy++;
      var caly = wiersze[i].join(' ');
      if (caly.indexOf(nasza) >= 0) zNami++;
    }
    if (dataWierszy >= 2 && zNami > najlepszyWynik) { najlepszyWynik = zNami; najlepsza = wiersze; }
  }
  if (!najlepsza || najlepszyWynik < 1) return [];

  var mecze = [];
  for (var j = 0; j < najlepsza.length; j++) {
    var w = najlepsza[j];
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(w[0] || ''))) continue;   // nagłówek/inne
    var dm = String(w[0]).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    if (/-00-00$/.test(dm[1])) continue;                            // bez terminu
    var gm = String(w[0]).match(/g\.\s*(\d{1,2}:\d{2})/) ||
             w.join(' ').match(/g\.\s*(\d{1,2}:\d{2})/);
    var idxWynik = -1;
    for (var k = 0; k < w.length; k++) {
      if (/^(\d+\s*:\s*\d+|-:-)$/.test(String(w[k]).trim())) idxWynik = k;
    }
    if (idxWynik < 2) continue;
    var gospodarz = naprawNazwe_(String(w[idxWynik - 2] || '').trim());
    var gosc = naprawNazwe_(String(w[idxWynik - 1] || '').trim());
    if (!gospodarz || !gosc) continue;
    var wynik = String(w[idxWynik]).replace(/\s+/g, '');
    mecze.push({
      dataMeczu: dm[1],
      godzina: gm ? gm[1] : '',
      kolejka: pztsKolejka_(w[1]),
      gospodarz: gospodarz,
      gosc: gosc,
      wynik: wynik,
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynik)
    });
  }
  return mecze;
}

/** Kraje w składach PZTS (zamknięty zbiór — lustrzana kopia z syncu). */
var PZTS_KRAJE = {
  'Polska': true, 'Ukraina': true, 'Białoruś': true, 'Czechy': true,
  'Słowacja': true, 'Niemcy': true, 'Francja': true, 'Chorwacja': true,
  'Litwa': true, 'Łotwa': true, 'Rosja': true
};

/**
 * SKŁAD ze strony DRUŻYNY: nagłówek „Nazwisko i imię | Nr licencji |
 * Pojedynki | Zwycięstwa | Porażki | Skuteczność”. Komórka nazwy jest
 * ZBITA — imię i nazwisko + wiek w nawiasie + kraj („Yunchyk Valentyn
 * (23 l.) Ukraina”); wiek i kraj zdejmujemy, roku ur. PZTS nie podaje
 * (wiek ≠ rok — ekstrapolacja to fałszywa dokładność, rok zostaje
 * pusty). Nazwiska przechodzą przez łańcuch napraw jak ŚZTS (na PZTS
 * to no-op, ale jedna droga = jedno zachowanie). Straż jakości
 * (lustrzano z parsujSkladGviz): co najmniej połowa wierszy musi
 * mieć licencję albo liczby — inaczej to nie skład i zwracamy [].
 */
function parsujSkladPzts_(tekst) {
  var tabele = pztsTabeleZTekstu_(tekst);
  for (var t = 0; t < tabele.length; t++) {
    var wiersze = tabele[t];
    var naglowek = wiersze[0] || [];
    var jestNazwisko = false, jestLicencja = false;
    for (var h = 0; h < naglowek.length; h++) {
      if (/nazwisko/i.test(naglowek[h])) jestNazwisko = true;
      if (/licencj/i.test(naglowek[h])) jestLicencja = true;
    }
    if (!jestNazwisko || !jestLicencja) continue;

    var wynik = [];
    for (var i = 1; i < wiersze.length; i++) {
      var w = wiersze[i];
      var surowy = String(w[0] || '').trim();
      if (!surowy || /nazwisko/i.test(surowy)) continue;         // nagłówek
      if (surowy.indexOf('/') >= 0 || /^https?/i.test(surowy)) continue;  // ścieżka, nie zawodnik
      var bezWieku = surowy.replace(/\(\s*\d+\s*(?:l\.|lat)\s*\)/gi, ' ');
      var czesci = bezWieku.split(/\s+/).filter(function (x) { return x; });
      var narodowosc = '';
      if (czesci.length > 1 && PZTS_KRAJE[czesci[czesci.length - 1]]) {
        narodowosc = czesci.pop();
      }
      var nazwisko = naprawNazwiskoZawodnika_(czesci.join(' '));
      if (!nazwisko || !/[a-ząćęłńóśźż]/i.test(nazwisko)) continue;
      wynik.push({
        nazwisko: nazwisko,
        licencja: /^\d{3,6}$/.test(String(w[1] || '').trim()) ? String(w[1]).trim() : '',
        narodowosc: narodowosc,
        rok: '',
        zwyciestwa: /^\d+$/.test(String(w[3] || '').trim()) ? String(w[3]).trim() : '',
        porazki: /^\d+$/.test(String(w[4] || '').trim()) ? String(w[4]).trim() : '',
        punkty: '',
        skutecznosc: /^\d+\s*%$/.test(String(w[5] || '').trim()) ? String(w[5]).trim() : ''
      });
    }
    var zDanymi = 0;
    for (var q = 0; q < wynik.length; q++) {
      if (wynik[q].licencja !== '' || wynik[q].zwyciestwa !== '' ||
          wynik[q].porazki !== '' || wynik[q].skutecznosc !== '') zDanymi++;
    }
    if (wynik.length > 0 && zDanymi >= Math.max(1, Math.ceil(wynik.length / 2))) return wynik;
  }
  return [];
}

/**
 * Mapa nazwa drużyny → URL podstrony /druzyna/… ze strony LIGI
 * (nazwy w tabeli ligowej są linkami). HTML: href względny lub pełny;
 * Markdown: [nazwa](url). Zdejmowana przy KAŻDYM pobraniu ligi —
 * gratis, zero dodatkowych zapytań (konwencja parsujLinkiDruzyn_).
 */
function pztsLinkiDruzyn_(tekst) {
  var mapa = {};
  var t = String(tekst || '');
  var reH = /<a[^>]+href="([^"]*\/rozgrywki-ligowe\/druzyna\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  var m;
  while ((m = reH.exec(t)) !== null) {
    var nazwaH = czystaKomorka_(m[2]);
    if (nazwaH) mapa[nazwaH] = pztsUrlAbsolutny_(m[1]);
  }
  var reM = /\[([^\]]*)\]\(([^)]*\/rozgrywki-ligowe\/druzyna\/[^)]*)\)/g;
  var m2;
  while ((m2 = reM.exec(t)) !== null) {
    var nazwaM = pztsKomorkaMd_(m2[1]);
    if (nazwaM) mapa[nazwaM] = pztsUrlAbsolutny_(m2[2]);
  }
  return mapa;
}

/** URL względny PZTS → absolutny (pełne zostają bez zmian). */
function pztsUrlAbsolutny_(url) {
  var u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return 'https://pzts.pl' + u;
  return u;
}

/**
 * Adresy lig centralnych PZTS z ich strony rozgrywek (hub) — do
 * Patrolu PZTS. HTML: href=/rozgrywki-ligowe/liga/?id=NN; Markdown:
 * linki pełne. Zwraca listę UNIKALNYCH adresów (max 8 — Ekstraklasa K,
 * Superliga M, 1. liga K gr. płn./płd., 1. liga M gr. płn./płd.).
 */
function pztsAdresyLig_(tekst) {
  var t = String(tekst || '');
  var znalezione = {};
  var reH = /(?:https?:\/\/(?:www\.)?pzts\.pl)?(\/rozgrywki-ligowe\/liga\/\?id=\d+)/g;
  var m;
  while ((m = reH.exec(t)) !== null) znalezione['https://pzts.pl' + m[1]] = true;
  var reM = /\]\((https?:\/\/(?:www\.)?pzts\.pl\/rozgrywki-ligowe\/liga\/\?id=\d+)\)/g;
  while ((m = reM.exec(t)) !== null) znalezione[m[1]] = true;
  var lista = [];
  for (var u in znalezione) { lista.push(u); if (lista.length >= 8) break; }
  return lista;
}

/* ============ KONIEC SEKCJI CZYSTEJ ============ */

/* ================= Konfiguracja środowiska ================= */

var MOST_WERSJA = '1.7.2';
var MENU_NAZWA = 'Most SLZTS';
var STREFA = 'Europe/Warsaw';                    // niezależnie od ustawień projektu
var ARKUSZ_INFO = 'INFO';
var ARKUSZ_CFG = 'Cfg';
var ARKUSZ_LOG = 'Log';
var ARKUSZ_MECZE = 'Mecze KTS';
var ARKUSZ_DRUZYNY = 'Drużyny';                  // v1.4: rejestr dla strony
var ARKUSZ_ZAWODNICY = 'Zawodnicy';              // v1.4: składy ze statystykami
var ARKUSZ_PULS = 'Puls';                         // v1.4.3: znacznik tyknięcia (strażnik świeżości)
var ARKUSZ_PZTS = 'PZTS 1LM';                    // v1.5.0: liga PZTS 1. drużyny (układ jak „Liga …”)
var KOLOR_NAGLOWKA = '#e8eef7';
var KOLOR_NASZEGO = '#fff2cc';                   // podświetlenie meczów naszych
var KOLOR_BLEDU = '#cc0000';                     // czerwona kartka błędu (v1.2)
var SEZON_ETYKIETA = '2026/27';                  // v1.5.0: nazwa sezonu dla archiwum

/* v1.5.5 — pomiary czasu przebiegu (krok 1 optymalizacji): czyste
 * liczniki, ZERO wpływu na logikę; reset na początku każdego przebiegu
 * (wykonajOdswiezenie_). MS_SIEC sumuje czas żądań sieciowych (także
 * nieudanych), MS_SEN — czekanie Utilities.sleep między próbami,
 * FAZY_ — czas faz przebiegu [ms]. */
var MS_SIEC = 0;
var MS_SEN = 0;
var FAZY_ = { ligi: 0, hub: 0, pzts: 0, patrol: 0, mecze: 0, druzyny: 0, sklady: 0 };

/* v1.6.0 — tura równoległa (krok 2 optymalizacji): FETCH_BUFOR_ trzyma
 * odpowiedzi wysłane paczką UrlFetchApp.fetchAll (jednorazowego użytku —
 * pobierzHtml_ i spółka zdejmują wpis z bufora; retry idzie już w sieć),
 * TURA1_ — ile żądań poszło paczką i ile trwała ściana paczki,
 * SZEREGOWE_ — licznik żądań poza paczką (retry tury 2, czytnik
 * r.jina.ai, Patrol PZTS). Reset na początku każdego przebiegu. */
var FETCH_BUFOR_ = {};
var TURA1_ = { ile: 0, ms: 0 };
var SZEREGOWE_ = 0;

/*
 * Budżet czasu przebiegu (v1.2). Przebieg Apps Script ma twardy limit
 * 6 min; UrlFetchApp z „timeoutSeconds: 45” trwa najwyżej 45 s na próbę.
 * CZAS_TWARDY_MS = termin (od startu przebiegu), przed którym muszą
 * zmieścić się pobrania — ogon przebiegu (Mecze KTS + Drużyny +
 * Zawodnicy + Log + STATUS) dostaje pozostałe ~45 s do limitu 6 min.
 */
var CZAS_TWARDY_MS = 315000;      // 5,25 min od startu przebiegu
var REZERWA_LIGI_MS = 110000;     // najgorszy przypadek 1 ligi: 45 s + 10 s + 45 s + parse/zapis
var REZERWA_SKLADU_MS = 110000;   // v1.4: najgorszy przypadek 1 podstrony drużyny
var REZERWA_PZTS_MS = 130000;     // v1.5.0: 2 strony PZTS (liga + drużyna) przez kanał z retry
var DOKONCZEN_MAX = 6;            // rund Dokończenia dziennie (każda = 1 tick co 15 min)

/* v1.4 — zabezpieczenia (wartości stałe; właściciel 12.11) */
var LIMIT_ZAPYTAN = 350;          // twardy limit zapytań do ligi.slzts.pl na dobę
var PROG_SERII = 6;               // tyle nieudanych przebiegów z rzędu = e-mail
var SKLAD_CO_MS = 12 * 60 * 60 * 1000;  // min. odstęp między odświeżeniami składów

/* v1.5.0 — PZTS: osobny, konserwatywny budżet (pzts.pl za Cloudflare —
 * nie chcemy go obciążać; czytnik r.jina.ai ma własne limity darmowe).
 * Typowe zużycie: Patrol ~16 (hub+6 lig patrolowych), dyżury 2–16,
 * składy 1–2 — realnie ~20–40/dobę. */
var LIMIT_ZAPYTAN_PZTS = 120;     // twardy limit zapytań do pzts.pl (+czytnik) na dobę
var LOG_LIMIT_WIERSZY = 1500;     // v1.5.0: rolling window telemetrii (~miesiąc)

/* v1.7.2 — dokończenie wyników (luka 17.11: wynik opublikowany u źródła
 * po oknie Dyżuru czekał do Patrolu 03:15 następnej nocy — na stronie
 * „oczekiwanie” wisiało cały dzień). Godz. 07–22, co 2 h, horyzont 3 dni. */
var OCZEK_CO_MS = 2 * 60 * 60 * 1000;
var OCZEK_HORYZONT_DNI = 3;

/** Funkcje mostu — do czyszczenia martwych triggerów po starych wersjach. */
var FUNKCJE_AKTUALNE = [
  'onOpen', 'Zarzadca', 'pelneOdswiezenie', 'sprawdzWynikiTeraz',
  'przebudujKalendarz', 'zainstalujStrukture', 'zainstalujAutomatyzacje',
  'testPztsKanalow', 'archiwizujSezon'
];

/* ================= Czas (strefa Europe/Warsaw) ================= */

function terazCzas_() { return Utilities.formatDate(new Date(), STREFA, 'yyyy-MM-dd HH:mm'); }
function terazCzasZSek_() { return Utilities.formatDate(new Date(), STREFA, 'yyyy-MM-dd HH:mm:ss'); }   // v1.7.1: Puls — tyknięcie z sekundami (prośba właściciela)
function dzisStr_()   { return Utilities.formatDate(new Date(), STREFA, 'yyyy-MM-dd'); }
function godzinaStr_() { return Utilities.formatDate(new Date(), STREFA, 'HH:mm'); }
function zaDniStr_(n) {
  return Utilities.formatDate(new Date(Date.now() + n * 86400000), STREFA, 'yyyy-MM-dd');
}

/* ================= Arkusze ================= */

function arkusz_(nazwa) {
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(nazwa);
  if (!ws) ws = ss.insertSheet(nazwa);
  return ws;
}

/** Ligi z zakładki „Cfg” (wiersze 4–14); gdy puste/uszkodzone — domyślne. */
function wczytajLigi_() {
  var zLigi = cacheRunu_().ligi;                             // v1.7.0: raz na przebieg
  if (zLigi) return zLigi;
  var ws = SpreadsheetApp.getActive().getSheetByName(ARKUSZ_CFG);
  var ligi = [];
  if (ws) {
    var dane = ws.getRange(4, 1, 11, 4).getValues();   // wiersze 4–14: nagłówek + do 10 lig
    for (var i = 0; i < dane.length; i++) {
      var skrot = String(dane[i][0] || '').trim();
      var nazwa = String(dane[i][1] || '').trim();
      var url = String(dane[i][2] || '').trim();
      var nazwaArk = String(dane[i][3] || '').trim();
      if (!skrot || !nazwa || !url) continue;
      if (!/^https:\/\/ligi\.slzts\.pl\/liga\/\d+\/\d+\/?$/.test(url)) continue;
      ligi.push({ skrot: skrot, nazwa: nazwa, url: url, arkusz: nazwaArk || ('Liga ' + skrot) });
    }
  }
  var wynikLig = ligi.length > 0 ? ligi : LIGI_DOMYSLNE.slice();
  cacheRunu_().ligi = wynikLig;                              // v1.7.0
  return wynikLig;
}

function ligaPoSkrocie_(skrot) {
  var ligi = wczytajLigi_();
  for (var i = 0; i < ligi.length; i++) if (ligi[i].skrot === skrot) return ligi[i];
  return null;
}

/** Biała lista zakładek mostu (v1.3): serwisowe + ligowe z konfiguracji. */
function zakladkiDozwolone_() {
  var dozwolone = {};
  dozwolone[ARKUSZ_INFO] = true;
  dozwolone[ARKUSZ_CFG] = true;
  dozwolone[ARKUSZ_LOG] = true;
  dozwolone[ARKUSZ_MECZE] = true;
  dozwolone[ARKUSZ_DRUZYNY] = true;      // v1.4
  dozwolone[ARKUSZ_ZAWODNICY] = true;    // v1.4
  dozwolone[ARKUSZ_PULS] = true;         // v1.4.3
  dozwolone[ARKUSZ_PZTS] = true;         // v1.5.0
  var ligi = wczytajLigi_();
  for (var i = 0; i < ligi.length; i++) dozwolone[ligi[i].arkusz] = true;
  return dozwolone;
}

/**
 * Zakładki zbędne (v1.3) — wszystkie poza białą listą: stary czytnik
 * IMPORT* (Hub, Slownik, Sondy, Ligi, Druzyny, Druzyna 1–12, Liga 1–9),
 * relikty v1 („STAN”…), ewentualne inne. Zwraca obiekty arkuszy.
 */
function arkuszeZbedne_() {
  var dozwolone = zakladkiDozwolone_();
  var zbedne = [];
  var wszystkie = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < wszystkie.length; i++) {
    if (!dozwolone[wszystkie[i].getName()]) zbedne.push(wszystkie[i]);
  }
  return zbedne;
}

/**
 * Nazwy zbędnych zakładek (v1.3). limit → ucięta lista „… (+n)”
 * (do STATUSU); bez limitu — pełna (do pytania o usunięcie i Logu).
 */
function nazwyZbednych_(limit) {
  var zbedne = arkuszeZbedne_();
  var nazwy = [];
  for (var i = 0; i < zbedne.length; i++) nazwy.push(zbedne[i].getName());
  if (limit && nazwy.length > limit) {
    return nazwy.slice(0, limit).join(', ') + ' … (+' + (nazwy.length - limit) + ')';
  }
  return nazwy.join(', ');
}

/**
 * PULS MOSTU (v1.4.3) — zakładka serwisowa dla czytnika strony (sync
 * na GitHubie czyta ją kanałem gviz): „Wersja | Ostatnie tyknięcie
 * Zarządcy | Zapytania dziś”. Pisany przy KAŻDYM ticku Zarządcy —
 * także w ciche dni, gdy świadomie nie pobieramy nic (Patrol bez
 * meczów w 7 dni = 0 zapytań). Strażnik świeżości po stronie syncu
 * odróżnia dzięki temu „ciszę meczową” od „most umarł” i wie, kiedy
 * zejść do odwodu (pobieranie bezpośrednie). Komórek NIE edytować.
 */
function zbudujPuls_(ws) {
  ws.clear();
  ws.getRange(1, 1).setValue('PULS MOSTU — zakładka serwisowa (aktualizowana automatycznie co 15 min; nie edytować)')
    .setFontWeight('bold');
  ws.getRange(2, 1).setValue('Wersja mostu');
  ws.getRange(3, 1).setValue('Ostatnie tyknięcie Zarządcy');
  ws.getRange(4, 1).setValue('Zapytania dziś (ligi.slzts.pl)');
  ws.getRange(5, 1).setValue('Zapytania dziś (pzts.pl)');   // v1.5.0
  ws.getRange(6, 1).setValue('Przebiegi (24 h)');           // v1.7.1: licznik przebiegów z timerami
  ws.getRange(7, 1).setValue('Czas przebiegu (24 h)');      // v1.7.1: średnio · najkrócej · najdłużej
  // v1.7.1: wartości TEKSTEM — „yyyy-MM-dd HH:mm:ss” nie może zostać
  // rozpoznane przez arkusz jako data i przeformatowane (gubiłoby sekundy)
  ws.getRange(2, 2, 6, 1).setNumberFormat('@');
  ws.setColumnWidth(1, 280); ws.setColumnWidth(2, 330);
}

/** Pisze puls (wywoływane z Zarządca() na początku KAŻDEGO ticku). */
function zapiszPuls_() {
  try {
    var ws = arkusz_(ARKUSZ_PULS);
    if (String(ws.getRange(2, 1).getValue() || '').trim() === '') zbudujPuls_(ws);
    if (String(ws.getRange(5, 1).getValue() || '').trim() === '') zbudujPuls_(ws); // v1.5.0: stare Puls bez wiersza pzts
    if (String(ws.getRange(6, 1).getValue() || '').trim() === '') zbudujPuls_(ws); // v1.7.1: stare Puls bez wierszy statystyki
    var stat = statystykiPrzebiegow24h_();                    // v1.7.1
    ws.getRange(2, 2, 6, 1).setValues([
      [MOST_WERSJA],
      [terazCzasZSek_()],                                     // v1.7.1: z sekundami, jako tekst
      [zapytaniaDzis_() + ' / ' + LIMIT_ZAPYTAN],
      [pztsZapytaniaDzis_() + ' / ' + LIMIT_ZAPYTAN_PZTS],    // v1.5.0
      [stat ? stat.liczba : '—'],                             // v1.7.1
      [stat ? stat.czasy : '—']                               // v1.7.1
    ]);
  } catch (e) { /* puls nie może ubić Zarządcy */ }
}

/**
 * v1.7.1: statystyka czasów przebiegów z okna 24 h — czyta „Log”
 * (najnowsze na górze). Liczone są wyłącznie wpisy z „czas: X s”
 * (timery v1.5.5+); wpisy Patrolu/ciszy bez timerów i wiersze starsze
 * niż 24 h są pomijane (pierwszy starszy przerywa skan — Log jest
 * uporządkowany czasowo malejąco). Zwraca { liczba, czasy } albo null
 * (brak Logu / wyjątek — statystyka nie może ubić ticku ani przebiegu).
 */
function statystykiPrzebiegow24h_() {
  try {
    var ws = SpreadsheetApp.getActive().getSheetByName(ARKUSZ_LOG);
    if (!ws) return null;
    var ostatni = ws.getLastRow();
    if (ostatni < 2) return null;
    var wiersze = Math.min(ostatni - 1, 400);            // doba ticków + ręcznych ≪ 400
    var dane = ws.getRange(2, 1, wiersze, 4).getValues();
    var granica = Utilities.formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000), STREFA, 'yyyy-MM-dd HH:mm');
    var czasy = [];
    for (var i = 0; i < dane.length; i++) {
      var t = String(dane[i][0] || '').trim();
      if (!t) continue;
      if (t < granica) break;                            // starsze niż 24 h — dalej tylko starsze
      var m = String(dane[i][3] || '').match(/czas: (\d+(?:[.,]\d+)?) s/);
      if (m) czasy.push(parseFloat(String(m[1]).replace(',', '.')));
    }
    if (czasy.length === 0) return { liczba: '0', czasy: '— brak przebiegów z timerami w ciągu 24 h' };
    var suma = 0, najkrotszy = czasy[0], najdluzszy = czasy[0];
    for (var c = 0; c < czasy.length; c++) {
      suma += czasy[c];
      if (czasy[c] < najkrotszy) najkrotszy = czasy[c];
      if (czasy[c] > najdluzszy) najdluzszy = czasy[c];
    }
    var pl = function (x) { return String(x.toFixed(1)).replace('.', ',') + ' s'; };
    return {
      liczba: String(czasy.length),
      czasy: 'średnio ' + pl(suma / czasy.length) + ' · najkrócej ' + pl(najkrotszy) + ' · najdłużej ' + pl(najdluzszy)
    };
  } catch (e) {
    return null;
  }
}

/**
 * v1.7.1: dopisuje do Puls świeżą statystykę czasów — wołane po każdym
 * przebiegu, który dopisał do Logu wpis z „czas: …”, żeby liczby były
 * aktualne od razu, a nie dopiero przy najbliższym ticku (≤15 min).
 * Stary układ Puls (bez wierszy statystyki) nie jest tu przebudowywany:
 * zrobi to zapiszPuls_ przy najbliższym ticku — przebudowa wymazałaby
 * wartości, a „tyknięcie Zarządcy” może pisać WYŁĄCZNIE Zarządca
 * (strażnik świeżości odróżnia dzięki temu żywy automat od ręcznej
 * aktywności przy martwym triggerze).
 */
function odswiezStatystykiPulsu_() {
  try {
    var ws = arkusz_(ARKUSZ_PULS);
    if (String(ws.getRange(6, 1).getValue() || '').trim() === '') return;   // stary układ — poczekać na tick
    var stat = statystykiPrzebiegow24h_();
    ws.getRange(6, 2, 2, 1).setValues([
      [stat ? stat.liczba : '—'],
      [stat ? stat.czasy : '—']
    ]);
  } catch (e) { /* statystyka nie może ubić przebiegu */ }
}

/* ================= Własności skryptu (mały stan) ================= */

function props_() { return PropertiesService.getScriptProperties(); }

function stanLig_() {
  try { return JSON.parse(props_().getProperty('most.stan') || '{}'); } catch (e) { return {}; }
}
function zapiszStanLigi_(skrot, ok, blad) {
  var stan = stanLig_();
  stan[skrot] = { ok: ok, czas: terazCzas_(), blad: blad || null };
  props_().setProperty('most.stan', JSON.stringify(stan));
}

/**
 * Ligi zaległe (v1.2): nigdy nie pobrane albo ostatnio nieudane.
 * To one są ponawiane przez „Dokończenie”.
 */
function ligiZalegle_() {
  var stan = stanLig_();
  var ligi = wczytajLigi_();
  var zalegle = [];
  for (var i = 0; i < ligi.length; i++) {
    var s = stan[ligi[i].skrot];
    if (!s || s.ok === false) zalegle.push(ligi[i]);
  }
  return zalegle;
}

function backlog_() { return ligiZalegle_().length > 0; }

/** Licznik zapytań do ligi.slzts.pl (per dzień, zlicza KAŻDĄ próbę fetch). */
function policzZapytanie_() {
  var p = props_();
  var dane;
  try { dane = JSON.parse(p.getProperty('most.licznik') || 'null'); } catch (e) { dane = null; }
  if (!dane || dane.dzien !== dzisStr_()) dane = { dzien: dzisStr_(), ile: 0 };
  dane.ile++;
  p.setProperty('most.licznik', JSON.stringify(dane));
  return dane.ile;
}
function zapytaniaDzis_() {
  try {
    var dane = JSON.parse(props_().getProperty('most.licznik') || 'null');
    if (dane && dane.dzien === dzisStr_()) return dane.ile;
  } catch (e) {}
  return 0;
}

/** v1.5.0: licznik zapytań do pzts.pl (OSOBNY od ŚZTS — inne źródło,
 *  inne tempo, inna ochrona). Zlicza KAŻDĄ próbę: bezpośrednią i przez
 *  czytnik (czytnik to też ruch generowany przez most). */
function policzZapytaniePzts_() {
  var p = props_();
  var dane;
  try { dane = JSON.parse(p.getProperty('pzts.licznik') || 'null'); } catch (e) { dane = null; }
  if (!dane || dane.dzien !== dzisStr_()) dane = { dzien: dzisStr_(), ile: 0 };
  dane.ile++;
  p.setProperty('pzts.licznik', JSON.stringify(dane));
  return dane.ile;
}
function pztsZapytaniaDzis_() {
  try {
    var dane = JSON.parse(props_().getProperty('pzts.licznik') || 'null');
    if (dane && dane.dzien === dzisStr_()) return dane.ile;
  } catch (e) {}
  return 0;
}
function sprawdzLimitPzts_() {
  var ile = pztsZapytaniaDzis_();
  if (ile >= LIMIT_ZAPYTAN_PZTS) {
    throw new Error('dzienny limit ' + LIMIT_ZAPYTAN_PZTS + ' zapytań PZTS wyczerpany — pauza do jutra');
  }
}

/**
 * v1.4 (zabezpieczenie C): twardy dzienny limit zapytań. Wywoływane
 * PRZED każdą próbą fetch — po wyczerpaniu limitu pobieranie rzuca
 * czytelny błąd (trafia do Log/STATUS) zamiast strzelać do ŚZTS.
 */
function sprawdzLimitZapytan_() {
  var ile = zapytaniaDzis_();
  if (ile >= LIMIT_ZAPYTAN) {
    throw new Error('dzienny limit ' + LIMIT_ZAPYTAN + ' zapytań wyczerpany — pauza do jutra (ochrona przed blokadą ŚZTS)');
  }
}

/** Ile rund „Dokończenia” wykonano dziś (v1.2). */
function dokonczeniaDzis_() {
  try {
    var d = JSON.parse(props_().getProperty('most.dokonczenia') || 'null');
    if (d && d.dzien === dzisStr_()) return d.ile;
  } catch (e) {}
  return 0;
}
function zliczDokonczenie_() {
  props_().setProperty('most.dokonczenia',
    JSON.stringify({ dzien: dzisStr_(), ile: dokonczeniaDzis_() + 1 }));
}

/**
 * Mapa nazwa drużyny (ŚZTS) → URL podstrony /druzyna/… (v1.4).
 * Kumulatywna: scalana przy KAŻDYM udanym pobraniu ligi — przebieg,
 * który pobrał jedną ligę, nie gubi linków pozostałych.
 */
function mapaLinkow_() {
  try { return JSON.parse(props_().getProperty('most.linkiDruzyn') || '{}'); } catch (e) { return {}; }
}
function scalLinki_(nowaMapa) {
  if (!nowaMapa) return;
  var m = mapaLinkow_();
  var zmiana = false;
  for (var k in nowaMapa) {
    if (m[k] !== nowaMapa[k]) { m[k] = nowaMapa[k]; zmiana = true; }
  }
  if (zmiana) props_().setProperty('most.linkiDruzyn', JSON.stringify(m));
}

/** Zegar składów (v1.4): epoch [ms] ostatniego UDANEGO odświeżenia. */
function skladyCzas_() {
  return parseInt(props_().getProperty('most.skladyCzas') || '0', 10) || 0;
}

/* ================= Pobieranie ================= */

/** v1.5.5: milisekundy → „2,4 s” (polski przecinek) — timery w Logu. */
function sek_(ms) {
  return String((ms / 1000).toFixed(1)).replace('.', ',') + ' s';
}

/** v1.5.5: zwięzły opis czasów przebiegu (sieć + sen + fazy > 0). */
function fazyTxt_() {
  var czesci = ['sieć ' + sek_(MS_SIEC)];
  if (MS_SEN > 0) czesci.push('sen ' + sek_(MS_SEN));
  if (TURA1_.ile > 0) czesci.push('równolegle ' + TURA1_.ile + ' ż. w ' + sek_(TURA1_.ms));   // v1.6.0
  if (SZEREGOWE_ > 0) czesci.push('szeregowo ' + SZEREGOWE_ + ' ż.');                          // v1.6.0
  if (ZAPISY_PELNE_ + ZAPISY_OSZCZEDZONE_ > 0) czesci.push('zapisy: ' + ZAPISY_PELNE_ + ' pełne · ' + ZAPISY_OSZCZEDZONE_ + ' bez zmian');   // v1.7.0
  for (var k in FAZY_) {
    if (FAZY_[k] > 0) czesci.push(k + ' ' + sek_(FAZY_[k]));
  }
  return czesci.join(' · ');
}


/* ============ ZAPISY GRUPOWE + WARUNKOWE + CACHE PRZEBIEGU (v1.7.0) ============ */

/** v1.7.0: liczniki jawności — ile arkuszy danych przebudowanych w całości,
 *  a ile pominiętych, bo nowa treść jest IDENTYCZNA z zapisaną (świeży
 *  zostaje tylko znacznik czasu w wierszu 2). Widać je w Logu:
 *  „zapisy: N pełne · M bez zmian”. */
var ZAPISY_PELNE_ = 0;
var ZAPISY_OSZCZEDZONE_ = 0;

/** v1.7.0: cache odczytów JEDNEGO przebiegu — parsowanie lig/PZTS ma świeże
 *  dane w ręku, więc „Drużyny”, „Mecze KTS”, STATUS i dyżur nie czytają
 *  ich z powrotem z arkusza; czytniki (czytajTabele_ i in.) najpierw
 *  zaglądają tu, a dopiero potem do arkusza (Dyżur bez pobierania lig =
 *  czytanie z arkusza, jak dotąd). Reset na początku KAŻDEGO przebiegu
 *  (wykonajOdswiezenie_) i po przepisaniu Cfg (zbudujStrukture_);
 *  menu i Zarządca to osobne wykonania = zawsze świeży cache. */
var CACHE_RUNU_ = null;
function cacheRunu_() {
  if (!CACHE_RUNU_) CACHE_RUNU_ = { ligi: null, tabela: {}, terminarz: {}, rejestr: null, meczeKTS: null };
  return CACHE_RUNU_;
}

/** v1.7.0: pusty blok zapisu {wart, tlo, pogrubienie, rozmiar, kolor}. */
function nowyBlok_() { return { wart: [], tlo: [], pogrubienie: [], rozmiar: [], kolor: [] }; }

/** v1.7.0: tło jednego wiersza — tablica kolorów o zadanej liczbie komórek
 *  (nagłówek 5-kolumnowy w arkuszu 7-kolumnowym koloruje tylko swoje 5). */
function tloWiersza_(kolumn, kolor) {
  var t = [];
  for (var i = 0; i < kolumn; i++) t.push(kolor);
  return t;
}

/** v1.7.0: dodaje wiersz do bloku — komórki dosypywane pustymi do szerokości
 *  arkusza; opt = { tlo: [kolor…], bold: true, rozmiar: N, kolor: '#…' } na
 *  poziomie wiersza (styl na pustych komórkach niczego nie pokazuje, więc
 *  to bezpieczne; tlo per komórka — patrz tloWiersza_). */
function wierszBloku_(blok, komorki, kolumn, opt) {
  opt = opt || {};
  var w = komorki.slice();
  while (w.length < kolumn) w.push('');
  blok.wart.push(w);
  var tlo = [];
  for (var q = 0; q < kolumn; q++) tlo.push(opt.tlo ? (opt.tlo[q] || null) : null);
  blok.tlo.push(tlo);
  var waga = [];
  for (var b = 0; b < kolumn; b++) waga.push(opt.bold === true);
  blok.pogrubienie.push(waga);
  var rozmiar = [];
  for (var z = 0; z < kolumn; z++) rozmiar.push(opt.rozmiar || null);
  blok.rozmiar.push(rozmiar);
  var kolor = [];
  for (var q2 = 0; q2 < kolumn; q2++) kolor.push(opt.kolor || null);
  blok.kolor.push(kolor);
}

/** v1.7.0: wyrównanie wierszy do prostokąta (krótsze dosypywane pustymi). */
function prostokat_(wiersze) {
  var kolumn = 0;
  for (var i = 0; i < wiersze.length; i++) kolumn = Math.max(kolumn, wiersze[i].length);
  var prost = [];
  for (var r = 0; r < wiersze.length; r++) {
    var w = wiersze[r].slice();
    while (w.length < kolumn) w.push('');
    prost.push(w);
  }
  return prost;
}

/** v1.7.0: ZAPIS GRUPOWY — cały arkusz JEDNYM zapisem wartości i po jednym
 *  grupowym zapisie każdego aspektu stylów (setBackgrounds/setFontWeights/
 *  setFontSizes/setFontColors przyjmują macierze 2D). Wołany wyłącznie po
 *  ws.clear() — „domyślne” wpisy (null tła / false wagi / rozmiar 10 /
 *  kolor #000000) są tożsame wyglądem ze stanem po wyczyszczeniu, a null
 *  w macierzy tła zachowuje siatkę komórek (dokumentacja Apps Script:
 *  null = reset tła/koloru czcionki). */
function zapiszBloki_(ws, blok) {
  var prost = prostokat_(blok.wart);
  var wierszy = prost.length;
  var kolumn = wierszy > 0 ? prost[0].length : 1;
  var tlo = [], waga = [], rozmiar = [], kolor = [], jestTlo = false;
  for (var r = 0; r < wierszy; r++) {
    var wT = [], wW = [], wR = [], wK = [];
    for (var k = 0; k < kolumn; k++) {
      var t = (blok.tlo[r] && blok.tlo[r][k]) || null;
      wT.push(t); if (t) jestTlo = true;
      wW.push(blok.pogrubienie[r] && blok.pogrubienie[r][k] ? true : false);
      wR.push((blok.rozmiar[r] && blok.rozmiar[r][k]) || 10);
      wK.push((blok.kolor[r] && blok.kolor[r][k]) || '#000000');
    }
    tlo.push(wT); waga.push(wW); rozmiar.push(wR); kolor.push(wK);
  }
  var rg = ws.getRange(1, 1, wierszy, kolumn);
  rg.setNumberFormat('@').setValues(prost);
  if (jestTlo) rg.setBackgrounds(tlo);
  rg.setFontWeights(waga);
  rg.setFontSizes(rozmiar);
  rg.setFontColors(kolor);
}

/** v1.7.0: ZAPIS WARUNKOWY — buduje docelowy obraz arkusza, porównuje z tym,
 *  co JUŻ zapisano (jedno getValues), i przy zgodności POZA wierszem 2
 *  (znacznik czasu — zawsze dostaje świeżą wartość, jedno setValue) nie
 *  rusza ani danych, ani stylów: niezmieniony arkusz kosztuje ~3 wywołania
 *  API zamiast pełnego przebudowania. Rozbieg liczby wierszy albo choć
 *  jednej komórki = pełny zapis (ws.clear + zapiszBloki_ — kasuje też
 *  czerwoną kartkę błędu i ręczne dopiski, jak dotąd). Zwraca true = pełny
 *  zapis (wtedy warto ustawić szerokości kolumn), false = oszczędzono. */
function zapiszWarunkowo_(ws, blok) {
  var docelowe = prostokat_(blok.wart);
  var wierszy = docelowe.length;
  var kolumn = wierszy > 0 ? docelowe[0].length : 1;
  var identyczne = false;
  try {
    if (ws.getLastRow() === wierszy) {
      identyczne = true;
      var jest = ws.getRange(1, 1, wierszy, kolumn).getValues();
      for (var r = 0; r < wierszy && identyczne; r++) {
        if (r === 1) continue;                            // wiersz 2 = znacznik czasu
        for (var k = 0; k < kolumn; k++) {
          var a = jest[r][k] === null || jest[r][k] === undefined ? '' : jest[r][k];
          var b = docelowe[r][k] === null || docelowe[r][k] === undefined ? '' : docelowe[r][k];
          if (String(a) !== String(b)) { identyczne = false; break; }
        }
      }
    }
  } catch (e) { identyczne = false; }
  if (identyczne) {
    try { ws.getRange(2, 1).setValue(docelowe[1][0]); } catch (e2) {}   // świeży znacznik czasu
    ZAPISY_OSZCZEDZONE_++;
    return false;
  }
  ws.clear();
  zapiszBloki_(ws, blok);
  ZAPISY_PELNE_++;
  return true;
}

/**
 * v1.5.5: pojedyncze żądanie z pomiarem czasu — jeden licznik MS_SIEC
 * zbiera czas wszystkich żądań przebiegu; „finally” zalicza także próbę
 * zakończoną wyjątkiem (timeout 45 s to przecież realny koszt sieci).
 * v1.6.0: to ŚCIEŻKA SZEREGOWA (retry tury 2, czytnik r.jina.ai, Patrol
 * PZTS) — każde takie żądanie liczy się do SZEREGOWE_; paczka równoległa
 * ma własny pomiar w pobierzRownolegle_().
 */
function fetchZPomiarem_(url, opcje) {
  var t = Date.now();
  SZEREGOWE_++;                                          // v1.6.0
  try {
    return UrlFetchApp.fetch(url, opcje);
  } finally {
    MS_SIEC += Date.now() - t;
  }
}

/**
 * v1.6.0: odpowiedź z tury równoległej (jednorazowego użytku). Zwraca tekst
 * strony, gdy w buforze siedzi odpowiedź HTTP 200 PRZECHODZĄCA walidację
 * danego rodzaju; null w każdym innym wypadku (brak wpisu, kod ≠ 200,
 * treść bez sekcji) — wołający schodzi wtedy do normalnej ścieżki
 * sieciowej (retry tury 2 z obecnymi sleepami i czytnikiem). Wpis ZAWSZE
 * znika z bufora — użyty czy odrzucony, tylko raz.
 */
function wezZBuforu_(url, rodzaj) {
  var odp = FETCH_BUFOR_[url];
  if (!odp) return null;
  delete FETCH_BUFOR_[url];                    // jednokrotnego użytku
  if (odp.kod !== 200) return null;
  var tekst = String(odp.tekst || '').replace(/^\uFEFF/, '');
  if (tekst.length === 0) return null;
  if (rodzaj === 'liga') {
    if (tekst.indexOf('Tabela ligowa') < 0 || tekst.indexOf('Terminarz') < 0) return null;
  } else if (rodzaj === 'druzyna') {
    if (tekst.indexOf('Skład zespołu') < 0) return null;
  } else if (rodzaj === 'pzts') {
    if (!pztsWygladaNaTresc_(tekst)) return null;
  }
  // 'hub' — bez dodatkowej walidacji (analizuje go analizujHub_)
  return tekst;
}

/**
 * v1.6.0 (krok 2 optymalizacji): TURA RÓWNOLEGŁA — wszystkie strony, których
 * adresy znamy Z GÓRY, lecą JEDNĄ paczką UrlFetchApp.fetchAll (bez sleepów).
 * Odpowiedzi wracają w kolejności żądań (dokumentacja Apps Script), a każdy
 * obiekt żądania ma własne opcje — w tym timeoutSeconds (oficjalny parametr
 * fetchAll; bez niego domyślny timeout to 360 s).
 *  · liczniki budżetów rosną PRZED wysłaniem (policzZapytanie_ /
 *    policzZapytaniePzts_), po jednym na żądanie — tura równoległa nie
 *    dokłada ANI JEDNEGO zapytania ponad to, co dziś pobieranie szeregowe;
 *  · paczka jest tnieta do wolnych miejsc w dziennych limitach — żądania,
 *    które się nie zmieściły, NIE idą w turze 1: przechwyci je stara
 *    ścieżka szeregowa (sprawdzLimitZapytan_ rzuci, gdy limit padnie);
 *  · porażka całości (wyjątek z fetchAll) nie przerywa przebiegu —
 *    bufor zostaje pusty i wszystko wraca do ścieżki szeregowej.
 */
function pobierzRownolegle_(zadania) {
  var lista = [];
  var widziane = {};                                      // v1.6.0: dedup w obrębie paczki
  for (var i = 0; i < zadania.length; i++) {
    if (!zadania[i].url) continue;
    if (widziane[zadania[i].url] || FETCH_BUFOR_[zadania[i].url]) continue;   // już w tej turze
    widziane[zadania[i].url] = true;
    lista.push(zadania[i]);
  }
  if (lista.length === 0) return;
  var miejscaSzts = LIMIT_ZAPYTAN - zapytaniaDzis_();     // wolne miejsca w limitach
  var miejscaPzts = LIMIT_ZAPYTAN_PZTS - pztsZapytaniaDzis_();
  var paczka = [];
  var mapowane = [];                                      // adresy w kolejności paczki
  for (var j = 0; j < lista.length; j++) {
    var z = lista[j];
    if (z.pzts) {
      if (miejscaPzts <= 0) continue;                     // nie zmieści się — droga szeregowa
      miejscaPzts--;
      policzZapytaniePzts_();
      paczka.push({
        url: z.url,
        muteHttpExceptions: true,
        followRedirects: true,
        timeoutSeconds: 20,                               // jak kanał bezpośredni pztsPobierz_
        headers: {
          'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy; rozgrywki PZTS)',
          'Accept': 'text/html'
        }
      });
    } else {
      if (miejscaSzts <= 0) continue;
      miejscaSzts--;
      policzZapytanie_();
      paczka.push({
        url: z.url,
        muteHttpExceptions: true,
        followRedirects: true,
        timeoutSeconds: 45,                               // jak pobierzHtml_ (wiszące ŚZTS)
        headers: { 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy)' }
      });
    }
    mapowane.push(z.url);
  }
  if (paczka.length === 0) return;
  var t = Date.now();
  try {
    var odpowiedzi = UrlFetchApp.fetchAll(paczka);        // kolejność = kolejność żądań
    for (var k = 0; k < odpowiedzi.length && k < mapowane.length; k++) {
      try {
        FETCH_BUFOR_[mapowane[k]] = {
          kod: odpowiedzi[k].getResponseCode(),
          tekst: odpowiedzi[k].getContentText('UTF-8')
        };
      } catch (e) {
        FETCH_BUFOR_[mapowane[k]] = { kod: 0, tekst: '' };  // martwa → tura 2
      }
    }
  } catch (e) {
    /* cała paczka padła — bufor pusty, wszystko wraca do drogi szeregowej;
     * przebieg nie może się wywalić w tym miejscu */
  } finally {
    var trwanie = Date.now() - t;
    TURA1_.ile += paczka.length;                          // v1.6.0: statystyka paczki
    TURA1_.ms += trwanie;
    MS_SIEC += trwanie;                                   // ściana sieci: raz, nie N razy
  }
}

/**
 * Pobiera stronę ligową; waliduje sekcje „Tabela ligowa”/„Terminarz”.
 * v1.2:
 *  · „timeoutSeconds: 45” — ŚZTS potrafi zawiesić połączenie na wiele
 *    minut; bez tego UrlFetchApp czeka DOMYŚLNIE DO 6 MINUT i jedno
 *    wiszące żądanie zabija cały przebieg (to była główna przyczyna
 *    „wielu pustych tabel” w v1.1);
 *  · próby terminowane wobec `deadline` (ms od epoki) — nie zaczynamy
 *    próby, która nie zmieści się przed twardym terminem przebiegu.
 * v1.4: dzienny limit zapytań sprawdzany przed pierwszą próbą.
 */
function pobierzHtml_(url, proby, deadline) {
  proby = proby || 2;
  if (!deadline) deadline = Date.now() + 280000;   // samodzielne wywołanie: bezpieczny budżet
  // v1.6.0: tura równoległa — odpowiedź już poszła paczką? (jednorazowo)
  var zTury1 = wezZBuforu_(url, 'liga');
  if (zTury1 !== null) return zTury1;
  sprawdzLimitZapytan_();
  var ostatniBlad = null;
  for (var i = 1; i <= proby; i++) {
    if (Date.now() + 50000 > deadline) {           // próba trwa do ~45 s + margines
      if (ostatniBlad) throw ostatniBlad;
      throw new Error('budżet czasu przebiegu wyczerpany przed pobraniem');
    }
    policzZapytanie_();
    try {
      var odp = fetchZPomiarem_(url, {             // v1.5.5: pomiar czasu sieci
        muteHttpExceptions: true,
        followRedirects: true,
        timeoutSeconds: 45,                        // ← kluczowa poprawka v1.2
        headers: { 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy; tabele ligowe)' }
      });
      var kod = odp.getResponseCode();
      if (kod !== 200) throw new Error('HTTP ' + kod);
      var tekst = odp.getContentText('UTF-8').replace(/^\uFEFF/, '');
      if (tekst.indexOf('Tabela ligowa') < 0 || tekst.indexOf('Terminarz') < 0) {
        throw new Error('strona bez sekcji ligowych (' + tekst.length + ' B) — przejściowa awaria ŚZTS?');
      }
      return tekst;
    } catch (e) {
      ostatniBlad = e;
      if (i < proby) { var senMs = 10000 * i; MS_SEN += senMs; Utilities.sleep(senMs); }   // 10 s, 20 s (v1.5.5: liczone do MS_SEN)
    }
  }
  throw ostatniBlad;
}

/**
 * Pobiera PODSTRONĘ DRUŻYNY (v1.4) — walidacja sekcji „Skład zespołu”;
 * inaczej identyczna dyscyplina co pobierzHtml_ (timeout 45 s, próby
 * terminowane wobec deadline, dzienny limit zapytań).
 */
function pobierzHtmlDruzyny_(url, proby, deadline) {
  proby = proby || 2;
  if (!deadline) deadline = Date.now() + 280000;
  // v1.6.0: tura równoległa (TURA 1b) — odpowiedź już poszła paczką?
  var zTury1 = wezZBuforu_(url, 'druzyna');
  if (zTury1 !== null) return zTury1;
  sprawdzLimitZapytan_();
  var ostatniBlad = null;
  for (var i = 1; i <= proby; i++) {
    if (Date.now() + 50000 > deadline) {
      if (ostatniBlad) throw ostatniBlad;
      throw new Error('budżet czasu przebiegu wyczerpany przed pobraniem składu');
    }
    policzZapytanie_();
    try {
      var odp = fetchZPomiarem_(url, {             // v1.5.5: pomiar czasu sieci
        muteHttpExceptions: true,
        followRedirects: true,
        timeoutSeconds: 45,
        headers: { 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy; składy drużyn)' }
      });
      var kod = odp.getResponseCode();
      if (kod !== 200) throw new Error('HTTP ' + kod);
      var tekst = odp.getContentText('UTF-8').replace(/^\uFEFF/, '');
      if (tekst.indexOf('Skład zespołu') < 0) {
        throw new Error('strona bez sekcji składu (' + tekst.length + ' B) — przejściowa awaria ŚZTS?');
      }
      return tekst;
    } catch (e) {
      ostatniBlad = e;
      if (i < proby) Utilities.sleep(10000 * i);
    }
  }
  throw ostatniBlad;
}

/**
 * Hub (strona główna ligi.slzts.pl) — tani test: czy ŚZTS nie wystartował
 * z nowszym sezonem (zmiana adresów lig). v1.2: wołany NA KOŃCU przebiegu,
 * best-effort (nigdy kosztem lig); zwraca { uwaga, blad }:
 *  · uwaga  — ostrzeżenie o sezonie (trafia na stałe do STATUS),
 *  · blad   — przejściowy problem z hubem (tylko do Logu, nie do STATUS).
 */
function sprawdzHub_() {
  // v1.6.0: hub zwykle leci w paczce tury 1 (przy przebiegach z hubem)
  var zTury1 = wezZBuforu_(HUB_URL, 'hub');
  if (zTury1 !== null) return analizujHub_(zTury1);
  sprawdzLimitZapytan_();
  policzZapytanie_();
  try {
    var odp = fetchZPomiarem_(HUB_URL, {           // v1.5.5: pomiar czasu sieci
      muteHttpExceptions: true,
      timeoutSeconds: 45,
      headers: { 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA }
    });
    if (odp.getResponseCode() !== 200) {
      return { uwaga: null, blad: 'hub: HTTP ' + odp.getResponseCode() + ' (pomijam)' };
    }
    return analizujHub_(odp.getContentText('UTF-8'));
  } catch (e) {
    return { uwaga: null, blad: 'hub nieosiągalny: ' + e };
  }
}

/** v1.6.0: czysta analiza HTML huba (wydzielona ze sprawdzHub_ bez zmiany
 *  treści) — korzysta z niej i tura równoległa, i ścieżka szeregowa. */
function analizujHub_(html) {
  var maxSezon = 0;
  var m;
  var re = /\/mecz\/(\d+)\//g;
  while ((m = re.exec(html)) !== null) {
    var s = parseInt(m[1], 10);
    if (s > maxSezon) maxSezon = s;
  }
  var naszSezon = 0;
  var lm = wczytajLigi_()[0].url.match(/\/liga\/(\d+)\//);
  if (lm) naszSezon = parseInt(lm[1], 10);
  if (naszSezon > 0 && maxSezon > naszSezon) {
    return {
      uwaga: 'UWAGA: ŚZTS ma już mecze sezonu ' + maxSezon + ' (my czytamy ' + naszSezon +
             ') — po zakończeniu sezonu zaktualizuj adresy w „Cfg”',
      blad: null
    };
  }
  return { uwaga: null, blad: null };
}

/* ================= PZTS: kanał + odświeżanie + patrol (v1.5.0) ================= */

/**
 * Konfiguracja PZTS = domyślne + nadpisania z własności (pzts.urlLigi /
 * pzts.urlDruzyny — ustawiane przez Patrol PZTS przy zmianie sezonu,
 * można też ręcznie w ustawieniach projektu). Jedno źródło prawdy.
 */
function pztsUstawienia_() {
  var cfg = {
    skrot: PZTS_LIGA_DOMYSLNA.skrot,
    nazwa: PZTS_LIGA_DOMYSLNA.nazwa,
    urlLigi: PZTS_LIGA_DOMYSLNA.urlLigi,
    urlDruzyny: PZTS_LIGA_DOMYSLNA.urlDruzyny,
    nazwaDruzyny: PZTS_LIGA_DOMYSLNA.nazwaDruzyny,
    karta: PZTS_LIGA_DOMYSLNA.karta,
    arkusz: PZTS_LIGA_DOMYSLNA.arkusz
  };
  try {
    var p = props_();
    var ul = p.getProperty('pzts.urlLigi');
    var ud = p.getProperty('pzts.urlDruzyny');
    if (ul) cfg.urlLigi = ul;
    if (ud) cfg.urlDruzyny = ud;
  } catch (e) {}
  return cfg;
}

/**
 * Czy PZTS jest zaległe (nigdy nie pobrane, ostatnio nieudane albo
 * zapisane przez INNĄ wersję mostu — v1.5.3: wymiana wersji wymusza
 * JEDNO automatyczne odświeżenie tabeli, żeby poprawki parsera
 * (np. punkty par ex aequo) od razu nadpisały stare dane; znacznik
 * most.pztsTabelaWersja stawia odswierzPzts_ po udanym zapisie).
 */
function pztsZalegla_() {
  var s = stanLig_()['pzts'];
  if (!s || s.ok === false) return true;
  if (props_().getProperty('most.pztsTabelaWersja') !== MOST_WERSJA) return true;   // v1.5.3
  return false;
}

/** v1.6.0: walidacja treści PZTS (wydzielona z pztsPobierz_ bez zmiany
 *  treści) — korzysta z niej i bufor tury równoległej (wezZBuforu_),
 *  i kanał bezpośredni pztsPobierz_. */
function pztsWygladaNaTresc_(tekst) {
  return tekst.length > 3000 &&
    !/just a moment|cloudflare|cf-challenge/i.test(tekst) &&
    /druzyna|Dru\u017cyna|liga|Liga|sk\u0142ad|Sk\u0142ad/.test(tekst);
}

/**
 * Pobiera stronę PZTS dwukanałowo (v1.5.0):
 *  1) BEZPOŚREDNIO UrlFetchApp — pzts.pl stoi za Cloudflare, więc
 *     zwykle HTTP 403 (szybka porażka, tania próba); jeśli jednak
 *     przejdzie — dostajemy pełny HTML;
 *  2) CZYTNIK r.jina.ai (Markdown) — kanał sprawdzony od 20.10 w syncu
 *     strony; nagłówek „Accept: text/plain” jest KRYTYCZNY (bez niego
 *     czytnik odrzuca anonimowy ruch 401 — QA 29.09).
 * Każda próba liczy się do osobnego limitu PZTS (LIMIT_ZAPYTAN_PZTS).
 * Zwraca { tekst, kanal } — 'bezpośrednio' | 'czytnik'.
 * v1.6.0: w 1. próbie kanał bezpośredni ma pierwszeństwo w buforze tury
 * równoległej — bezpośrednie próby obu stron PZTS lecą w paczce razem
 * z ligami ŚZTS od początku przebiegu.
 */
function pztsPobierz_(url, proby, deadline) {
  proby = proby || 2;
  if (!deadline) deadline = Date.now() + 240000;
  sprawdzLimitPzts_();
  var ostatniBlad = null;
  for (var i = 1; i <= proby; i++) {
    if (Date.now() + 40000 > deadline) {
      if (ostatniBlad) throw ostatniBlad;
      throw new Error('budżet czasu przebiegu wyczerpany przed pobraniem PZTS');
    }
    // — kanał 1: BEZPOŚREDNIO — v1.6.0: w 1. próbie najpierw paczka tury 1
    //    (wpis zdejmowany nawet po porażce — natychmiastowy retry byłby
    //    spalonym budżetem PZTS, więc wtedy od razu czytnik); poza paczką
    //    i w kolejnych próbach — próba sieciowa jak dotąd —
    var tekstK1 = null;
    var bylWPaczce = false;
    if (i === 1 && FETCH_BUFOR_[url]) {
      bylWPaczce = true;
      tekstK1 = wezZBuforu_(url, 'pzts');
      if (tekstK1 !== null) return { tekst: tekstK1, kanal: 'bezpośrednio' };
    }
    if (!bylWPaczce) {
      policzZapytaniePzts_();
      try {
        var odp = fetchZPomiarem_(url, {           // v1.5.5: pomiar czasu sieci
          muteHttpExceptions: true,
          followRedirects: true,
          timeoutSeconds: 20,
          headers: {
            'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy; rozgrywki PZTS)',
            'Accept': 'text/html'
          }
        });
        if (odp.getResponseCode() === 200) {
          var tekstH = odp.getContentText('UTF-8').replace(/^\uFEFF/, '');
          if (pztsWygladaNaTresc_(tekstH)) return { tekst: tekstH, kanal: 'bezpośrednio' };
        }
      } catch (e1) { /* timeout lub błąd sieci — schodzimy do czytnika */ }
    }
    // — kanał 2: czytnik r.jina.ai (Markdown) —
    policzZapytaniePzts_();
    try {
      var odp2 = fetchZPomiarem_(PZTS_CZYTNIK_URL + url, {   // v1.5.5: pomiar czasu sieci
        muteHttpExceptions: true,
        followRedirects: true,
        timeoutSeconds: 30,
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA + ' (arkusz klubowy; rozgrywki PZTS)'
        }
      });
      var kod2 = odp2.getResponseCode();
      if (kod2 === 200) {
        var tekstM = odp2.getContentText('UTF-8').replace(/^\uFEFF/, '');
        if (tekstM.length > 3000) return { tekst: tekstM, kanal: 'czytnik' };
        throw new Error('czytnik: podejrzanie krótka odpowiedź (' + tekstM.length + ' B)');
      }
      throw new Error('czytnik: HTTP ' + kod2 +
        ((kod2 === 401 || kod2 === 429) ? ' (limit/reputacja IP — ponawiam)' : ''));
    } catch (e2) {
      ostatniBlad = e2;
    }
    if (i < proby) { var senPz = 8000 * i; MS_SEN += senPz; Utilities.sleep(senPz); }   // v1.5.5: liczone do MS_SEN
  }
  throw ostatniBlad || new Error('PZTS: nieznany b\u0142\u0105d pobierania');
}

/** Zakładka „PZTS 1LM” — układ IDENTYCZNY jak „Liga …” (TABELA LIGOWA +
 *  TERMINARZ; czytnik strony czyta ją tym samym parserem). Różnica:
 *  5. kolumna tabeli = „Z–R–P” (PZTS nie wystawia bilansu setów),
 *  terminarz = pełny sezon NASZEJ drużyny (każdy mecz „★”). */
function zapiszArkuszPzts_(cfg, tabela, mecze, etykieta, kanal) {
  var ws = arkusz_(cfg.arkusz);
  var wT = [];
  for (var i = 0; i < tabela.length; i++) {
    var w = tabela[i];
    wT.push([String(w.pozycja) + '.', w.nazwa, String(w.mecze), String(w.punkty), w.stosunek]);
  }
  var wM = [];
  for (var j = 0; j < mecze.length; j++) {
    var m = mecze[j];
    var nasz = naszaDruzyna_(m.gospodarz) || naszaDruzyna_(m.gosc);
    wM.push([
      m.dataMeczu, m.godzina || '', m.kolejka == null ? '' : String(m.kolejka),
      m.gospodarz, m.gosc, m.wynik, nasz ? '★' : ''
    ]);
  }
  // v1.7.0: cały arkusz = jeden blok (jak ligi ŚZTS) + zapis warunkowy —
  // przy niezmienionej treści jedno getValues + świeży znacznik czasu
  var blok = nowyBlok_();
  wierszBloku_(blok, [cfg.nazwa + ' (PZTS)'], 7, { bold: true, rozmiar: 13 });
  wierszBloku_(blok, ['Źródło: ' + cfg.urlLigi + ' oraz ' + cfg.urlDruzyny +
    ' · kanał: ' + (kanal || '?') + ' · aktualizacja: ' + terazCzas_() + ' (' + etykieta + ')'], 7, { kolor: '#666666' });
  wierszBloku_(blok, [''], 7, null);
  wierszBloku_(blok, ['TABELA LIGOWA'], 7, { bold: true, rozmiar: 11 });
  wierszBloku_(blok, ['Pozycja', 'Drużyna', 'Mecze', 'Punkty', 'Z–R–P'], 7,
    { bold: true, tlo: tloWiersza_(5, KOLOR_NAGLOWKA) });
  for (var t = 0; t < wT.length; t++) wierszBloku_(blok, wT[t], 7, null);
  wierszBloku_(blok, [''], 7, null);
  wierszBloku_(blok, ['TERMINARZ'], 7, { bold: true, rozmiar: 11 });
  wierszBloku_(blok, ['Data', 'Godzina', 'Kolejka', 'Gospodarz', 'Gość', 'Wynik', 'Nasz'], 7,
    { bold: true, tlo: tloWiersza_(7, KOLOR_NAGLOWKA) });
  for (var m2 = 0; m2 < wM.length; m2++) {
    wierszBloku_(blok, wM[m2], 7, wM[m2][6] === '★' ? { tlo: tloWiersza_(7, KOLOR_NASZEGO) } : null);
  }
  if (zapiszWarunkowo_(ws, blok)) ustawSzerokosciLigi_(ws);   // v1.7.0: szerokości tylko przy przebudowaniu
}

/** Czerwona kartka błędu PZTS — TYLKO gdy zakładka pusta (ostatnia dobra
 *  tabela zostaje; lustrzana konwencja zapiszBladWArkuszu_). */
function zapiszBladPzts_(blad) {
  try {
    var ws = arkusz_(ARKUSZ_PZTS);
    var a1 = String(ws.getRange(1, 1).getValue() || '');
    var pusta = ws.getLastRow() === 0 || a1.indexOf('NIE UDAŁO SIĘ') === 0;
    if (!pusta) return;
    ws.clear();
    ws.getRange(1, 1).setValue('NIE UDAŁO SIĘ POBRAĆ — PZTS (1. Liga Mężczyzn · gr. południowa)')
      .setFontWeight('bold').setFontSize(12).setFontColor(KOLOR_BLEDU);
    ws.getRange(2, 1).setValue(terazCzas_() + ' · błąd: ' + String(blad).substring(0, 180))
      .setFontColor(KOLOR_BLEDU);
    ws.getRange(3, 1).setValue('Automat „Dokończenie” ponowi co ~15 min. Gdy trwa — menu „PZTS: testuj kanały”.')
      .setFontColor('#666666');
    ws.setColumnWidth(1, 720);
  } catch (e2) { /* kosmetyka — błąd i tak ląduje w Log/STATUS */ }
}

/**
 * Odświeża dane PZTS: strona LIGI (tabela) + strona DRUŻYNY (pełny
 * terminarz + skład). Ochrona anti-wipe lustrzana z lig ŚZTS (podejrzanie
 * ubogi zrzut NIE nadpisuje ostatniego dobrego). Z błędu odpowiedzi strony
 * drużyny zdejmowany też SKŁAD (darmowy — ta sama strona). Auto-adopt:
 * jeśli tabela ligowa linkuje naszą drużynę pod innym adresem niż znamy,
 * przyjmujemy nowy (props pzts.urlDruzyny) i odnotowujemy w Logu.
 * Zwraca liczbę meczów; awaria = wyjątek (caller izoluje PZTS od ŚZTS).
 */
function odswierzPzts_(etykieta, deadline) {
  sprawdzLimitPzts_();
  var cfg = pztsUstawienia_();

  var liga = pztsPobierz_(cfg.urlLigi, 2, deadline);
  var tabela = parsujTabelePzts_(liga.tekst);
  if (tabela.length < 5) {
    throw new Error('tabela ligowa podejrzanie uboga (' + tabela.length + ' z ~10 drużyn) — ' +
      'zmiana układu strony pzts.pl? STARA TABELA ZOSTAJE; gdy się powtarza: menu „PZTS: testuj kanały”');
  }

  var linki = pztsLinkiDruzyn_(liga.tekst);
  var urlZLigi = linki[cfg.nazwaDruzyny];
  if (urlZLigi && urlZLigi !== cfg.urlDruzyny) {
    props_().setProperty('pzts.urlDruzyny', urlZLigi);
    cfg.urlDruzyny = urlZLigi;
    dopiszLog_('PZTS auto-adopt', pztsZapytaniaDzis_(),
      'adres podstrony drużyny → ' + urlZLigi + ' (z tabeli ligowej)', null);
  }

  var druzyna = pztsPobierz_(cfg.urlDruzyny, 2, deadline);
  var mecze = parsujTerminarzPzts_(druzyna.tekst, cfg.nazwaDruzyny);
  if (mecze.length === 0) {
    throw new Error('0 meczów naszej drużyny na stronie drużyny — zmiana struktury pzts.pl?');
  }

  var stare = statystykiArkuszaLigi_({ arkusz: cfg.arkusz });
  if (stare.mecze >= 6 && mecze.length < stare.mecze) {
    throw new Error('partial read? ' + mecze.length + ' meczów < ' + stare.mecze +
      ' zapisanych — ZACHOWUJĘ ostatni dobry');
  }
  if (stare.tabela >= 6 && tabela.length * 2 < stare.tabela) {
    throw new Error('podejrzanie mała tabela (' + tabela.length + ' vs ' + stare.tabela +
      ') — ZACHOWUJĘ ostatnią dobrą');
  }

  zapiszArkuszPzts_(cfg, tabela, mecze, etykieta, liga.kanal);
  PZTS_SKLAD_BUFOR = parsujSkladPzts_(druzyna.tekst);
  zapiszStanLigi_('pzts', true, null);
  props_().setProperty('most.pztsTabelaWersja', MOST_WERSJA);   // v1.5.3: wersja, która zapisała tabelę
  var cachePz = cacheRunu_();                                    // v1.7.0: dla Drużyn/Mecze bez powtórnego czytania
  cachePz.tabela[cfg.arkusz] = tabela;
  cachePz.terminarz[cfg.arkusz] = mecze;
  if (PZTS_NOTATKI.length > 0) {                                // v1.5.3: jawność punktów z bilansu
    dopiszLog_('PZTS punkty (diagnostyka)', pztsZapytaniaDzis_(),
      PZTS_NOTATKI.length + '×: ' + PZTS_NOTATKI.join(' · ').substring(0, 240), null);
  }
  return mecze.length;
}

/**
 * PATROL PZTS (raz dziennie): przegląda tabele WSZYSTKICH lig centralnych
 * PZTS (adresy z ich strony rozgrywek). Każda liga z naszą drużyną jest
 * KLASYFIKOWANA (v1.5.2): ŻYWA (przyszły mecz albo nierozegrane „-:-”)
 * czy ARCHIWALNA (zamrożona po zeszłym sezonie — nasza drużyna wciąż
 * widnieje w jej tabeli, ale to nie bieżące rozgrywki; stąd fałszywy
 * alarm „2 ligi” w v1.5.0/1: żywa id=82 + archiwalna id=73).
 * Auto-adopt WYŁĄCZNIE z ligi ŻYWEJ; alarm dopiero przy ≥2 ŻYWYCH
 * (realna druga drużyna klubu, np. kobiece ligi); archiwum — tylko
 * wpis w Logu. Budżet: hub + do 8 lig przez kanał z retry; przerwane
 * na budżecie czasu dokończy jutro. Patrol odpala się PONOWNIE po
 * zmianie WERSJI mostu (znacznik most.pztsPatrolWersja) — świeża
 * instalacja od razu przelicza i czyści stary alarm w INFO.
 */
function patrolPzts_(deadline) {
  var p = props_();
  var dzis = dzisStr_();
  if (p.getProperty('most.pztsPatrol') === dzis &&
      p.getProperty('most.pztsPatrolWersja') === MOST_WERSJA) return;   // raz dziennie, per wersja
  var cfg = pztsUstawienia_();
  var naszeZywe = [];
  var naszeArchiwum = [];
  var sprawdzone = 0;
  var problemy = [];
  try {
    var hub = pztsPobierz_(PZTS_HUB_URL, 1, deadline);
    var adresy = pztsAdresyLig_(hub.tekst);
    if (adresy.length === 0) {
      problemy.push('hub nie oddał adresów lig (0)');
    } else {
      for (var i = 0; i < adresy.length; i++) {
        if (Date.now() + 45000 > deadline) {
          problemy.push('przerwano na budżecie czasu po ' + sprawdzone + ' ligach');
          break;
        }
        try {
          var strona = pztsPobierz_(adresy[i], 1, deadline);
          var zywa = pztsLigaZywa_(strona.tekst, dzis);          // v1.5.2
          var tabela = parsujTabelePzts_(strona.tekst);
          sprawdzone++;
          for (var j = 0; j < tabela.length; j++) {
            if (!naszaDruzyna_(tabela[j].nazwa)) continue;
            var linki = pztsLinkiDruzyn_(strona.tekst);
            var wpis = {
              nazwa: tabela[j].nazwa,
              urlLigi: adresy[i],
              urlDruzyny: linki[tabela[j].nazwa] || '',
              zywa: zywa
            };
            if (zywa) naszeZywe.push(wpis); else naszeArchiwum.push(wpis);
          }
        } catch (eL) {
          problemy.push(String(adresy[i]).replace(/^.*\?id=/, 'id=') + ': ' + eL);
        }
      }
    }
  } catch (e) {
    problemy.push('hub: ' + e);
  }
  p.setProperty('most.pztsPatrol', dzis);
  p.setProperty('most.pztsPatrolWersja', MOST_WERSJA);           // v1.5.2

  var uwaga = null;
  var naszeRazem = naszeZywe.length + naszeArchiwum.length;
  if (sprawdzone === 0 && naszeRazem === 0) {
    uwaga = 'Patrol PZTS: 0 lig sprawdzonych (awaria pobierania pzts.pl/czytnika) — menu „PZTS: testuj kanały”';
  } else if (naszeRazem === 0) {
    uwaga = 'Patrol PZTS: żadna liga centralna PZTS nie ma naszej drużyny (' +
      sprawdzone + ' lig sprawdzonych) — przerwa w rozgrywkach? sprawdź pzts.pl';
  } else if (naszeZywe.length === 0) {
    uwaga = 'Patrol PZTS: nasza drużyna TYLKO w archiwalnych ligach PZTS (' +
      naszeArchiwum.length + ', sezon 2025/26?) — bieżących rozgrywek bez nas? sprawdź pzts.pl';
  } else if (naszeZywe.length === 1) {
    var jedyna = naszeZywe[0];
    if (jedyna.urlLigi !== cfg.urlLigi ||
        (jedyna.urlDruzyny && jedyna.urlDruzyny !== cfg.urlDruzyny)) {
      p.setProperty('pzts.urlLigi', jedyna.urlLigi);
      if (jedyna.urlDruzyny) p.setProperty('pzts.urlDruzyny', jedyna.urlDruzyny);
      dopiszLog_('Patrol PZTS · auto-adopt', pztsZapytaniaDzis_(),
        'nasza drużyna gra teraz w ' + jedyna.urlLigi + ' — most przełączył się sam', null);
    }
  } else {
    var lista = [];
    for (var n = 0; n < naszeZywe.length; n++) {
      lista.push(naszeZywe[n].nazwa + ' → ' + naszeZywe[n].urlLigi);
    }
    uwaga = 'Patrol PZTS: nasze drużyny w ' + naszeZywe.length +
      ' ŻYWYCH ligach PZTS! (' + lista.join(' · ') +
      ') — moduł obsługuje JEDNĄ; zgłoś do rozbudowy mostu';
  }
  if (uwaga) p.setProperty('most.pztsUwaga', uwaga);
  else p.deleteProperty('most.pztsUwaga');

  dopiszLog_('Patrol PZTS', pztsZapytaniaDzis_(),
    'lig sprawdzone: ' + sprawdzone + ' · nasze drużyny: ' + naszeRazem +
    ' (żywe: ' + naszeZywe.length + ', archiwalne: ' + naszeArchiwum.length + ')' +
    (problemy.length > 0 ? ' · problemy: ' + problemy.join(' | ').substring(0, 150) : ''), null);
}

/* ================= Zapis danych ================= */

/**
 * Statystyka ZAPISANYCH danych ligi w arkuszu (v1.4 — zabezpieczenie B):
 * ile wierszy ma sekcja TABELA LIGOWA i ile meczów TERMINARZ. Nowy zrzut
 * porównujemy z tym — zbyt ubogi zrzut nie nadpisze dobrych danych.
 */
function statystykiArkuszaLigi_(liga) {
  var wynik = { tabela: 0, mecze: 0 };
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(liga.arkusz);
  if (!ws || ws.getLastRow() === 0) return wynik;
  try { wynik.mecze = czytajTerminarz_(liga).length; } catch (e) {}
  try {
    var n = Math.min(ws.getLastRow(), 120);
    var wart = ws.getRange(1, 1, n, 5).getValues();
    var sekcja = 0;                      // 0 = szukam „TABELA LIGOWA”, 1 = liczę
    for (var i = 0; i < wart.length; i++) {
      var a = String(wart[i][0] || '').trim();
      if (sekcja === 0) {
        if (a === 'TABELA LIGOWA') sekcja = 1;
        continue;
      }
      if (a === 'TERMINARZ') break;
      if (a === 'Pozycja') continue;     // nagłówek kolumn
      if (/^\d+\.$/.test(a)) wynik.tabela++;
    }
  } catch (e2) {}
  return wynik;
}

function zapiszArkuszLigi_(liga, tabela, mecze, etykieta) {
  var ws = arkusz_(liga.arkusz);
  var wT = [];
  for (var i = 0; i < tabela.length; i++) {
    var w = tabela[i];
    wT.push([String(w.pozycja) + '.', w.nazwa, String(w.mecze), String(w.punkty), w.stosunek]);
  }
  var wM = [];
  for (var j = 0; j < mecze.length; j++) {
    var m = mecze[j];
    var nasz = naszaDruzyna_(m.gospodarz) || naszaDruzyna_(m.gosc);
    wM.push([
      m.dataMeczu, m.godzina || '', m.kolejka == null ? '' : String(m.kolejka),
      m.gospodarz, m.gosc, m.wynik, nasz ? '★' : ''
    ]);
  }
  // v1.7.0: cały arkusz = jeden blok (wartości + style macierzowo, gwiazdki
  // w macierzy tła); zapis WARUNKOWY — przy niezmienionej treści jedno
  // getValues + świeży znacznik czasu zamiast pełnego przebudowania.
  var blok = nowyBlok_();
  wierszBloku_(blok, [liga.nazwa], 7, { bold: true, rozmiar: 13 });
  wierszBloku_(blok, ['Źródło: ' + liga.url + ' · aktualizacja: ' + terazCzas_() + ' (' + etykieta + ')'], 7, { kolor: '#666666' });
  wierszBloku_(blok, [''], 7, null);
  wierszBloku_(blok, ['TABELA LIGOWA'], 7, { bold: true, rozmiar: 11 });
  wierszBloku_(blok, ['Pozycja', 'Drużyna', 'Mecze', 'Punkty', 'Sety'], 7,
    { bold: true, tlo: tloWiersza_(5, KOLOR_NAGLOWKA) });
  for (var t = 0; t < wT.length; t++) wierszBloku_(blok, wT[t], 7, null);
  wierszBloku_(blok, [''], 7, null);
  wierszBloku_(blok, ['TERMINARZ'], 7, { bold: true, rozmiar: 11 });
  wierszBloku_(blok, ['Data', 'Godzina', 'Kolejka', 'Gospodarz', 'Gość', 'Wynik', 'Nasz'], 7,
    { bold: true, tlo: tloWiersza_(7, KOLOR_NAGLOWKA) });
  for (var m2 = 0; m2 < wM.length; m2++) {
    wierszBloku_(blok, wM[m2], 7, wM[m2][6] === '★' ? { tlo: tloWiersza_(7, KOLOR_NASZEGO) } : null);
  }
  if (zapiszWarunkowo_(ws, blok)) ustawSzerokosciLigi_(ws);   // v1.7.0: szerokości tylko przy przebudowaniu (trwają po clear)
}

function ustawSzerokosciLigi_(ws) {
  ws.setColumnWidth(1, 100);  // Data / Pozycja
  ws.setColumnWidth(2, 240);  // Drużyna / Godzina
  ws.setColumnWidth(3, 80);   // Mecze / Kolejka
  ws.setColumnWidth(4, 240);  // Punkty / Gospodarz
  ws.setColumnWidth(5, 240);  // Sety / Gość
  ws.setColumnWidth(6, 80);   // Wynik
  ws.setColumnWidth(7, 60);   // Nasz
}

/**
 * v1.2: gdy pobranie ligi się NIE udało, a jej zakładka jest jeszcze pusta
 * (nie ma ostatniej dobrej tabeli) — wpisujemy CZERWONĄ kartkę z błędem.
 * Pusta zakładka przestaje być zagadką, a kartka znika sama przy pierwszym
 * udanym pobraniu (zapiszArkuszLigi_ czyści arkusz).
 */
function zapiszBladWArkuszu_(liga, blad) {
  try {
    var ws = arkusz_(liga.arkusz);
    var a1 = String(ws.getRange(1, 1).getValue() || '');
    var pusta = ws.getLastRow() === 0 || a1.indexOf('NIE UDAŁO SIĘ') === 0;
    if (!pusta) return;                     // mamy ostatnią dobrą tabelę — zostaje
    ws.clear();
    ws.getRange(1, 1).setValue('NIE UDAŁO SIĘ POBRAĆ — ' + liga.nazwa)
      .setFontWeight('bold').setFontSize(12).setFontColor(KOLOR_BLEDU);
    ws.getRange(2, 1).setValue(terazCzas_() + ' · błąd: ' + String(blad).substring(0, 180))
      .setFontColor(KOLOR_BLEDU);
    ws.getRange(3, 1).setValue('Automat „Dokończenie” ponowi pobieranie co ~15 min (wymaga zainstalowanej automatyzacji — menu „' + MENU_NAZWA + '”).')
      .setFontColor('#666666');
    ws.setColumnWidth(1, 720);
  } catch (e2) { /* kartka jest kosmetyką — błąd i tak ląduje w Log/STATUS */ }
}

/**
 * Odświeża jedną ligę: pobierz → sparsuj → (v1.4: ochrona danych) → zapisz.
 * Rzucany błąd = stan ligi. v1.4 zbiera też linki podstron drużyn (dla
 * arkusza „Zawodnicy”) — kumulatywnie w most.linkiDruzyn.
 */
function odswierzLige_(liga, etykieta, deadline) {
  var html = pobierzHtml_(liga.url, 2, deadline);
  var tabela = parsujTabele_(html);
  var mecze = parsujTerminarz_(html);
  if (tabela.length === 0) throw new Error('tabela ligowa pusta (0 wierszy)');

  // v1.4 (zabezpieczenie B): nowy zrzut podejrzanie ubogi vs zapisany —
  // prawdopodobna zmiana struktury ligi.slzts.pl → NIE dotykam dobrych
  // danych; ostatnia dobra wersja zostaje, błąd idzie do Log/STATUS,
  // a Dokończenie ponowi (i przy trwałej zmianie struktury pokaże ją
  // w STATUS wyraźnie, zamiast cicho wyczyścić tabele).
  var stare = statystykiArkuszaLigi_(liga);
  if (stare.tabela >= 6 && tabela.length * 2 < stare.tabela) {
    throw new Error('podejrzanie mała nowa tabela: ' + tabela.length + ' wierszy vs ' +
      stare.tabela + ' zapisanych — prawdopodobna zmiana struktury ŚZTS; ZACHOWUJĘ ostatnią dobrą');
  }
  if (stare.mecze >= 20 && mecze.length === 0) {
    throw new Error('nowy zrzut bez terminarza (0 vs ' + stare.mecze +
      ' zapisanych meczów) — prawdopodobna zmiana struktury ŚZTS; ZACHOWUJĘ ostatni dobry');
  }

  zapiszArkuszLigi_(liga, tabela, mecze, etykieta);
  scalLinki_(parsujLinkiDruzyn_(html));   // v1.4: URL-e podstron — za darmo
  zapiszStanLigi_(liga.skrot, true, null);
  var cacheLg = cacheRunu_();             // v1.7.0: sparsowane dane zostają w pamięci przebiegu
  cacheLg.tabela[liga.arkusz] = tabela;
  cacheLg.terminarz[liga.arkusz] = mecze;
  return mecze.length;
}

/** Czyta TABELĘ LIGOWĄ Z POWROTU z arkusza ligi (v1.4 — do rejestru Drużyny). */
function czytajTabele_(liga) {
  var zT = cacheRunu_().tabela[liga.arkusz];                // v1.7.0: świeżo sparsowane w tym przebiegu
  if (zT) {
    var zTab = [];
    for (var z = 0; z < zT.length; z++) {
      zTab.push({ pozycja: zT[z].pozycja, nazwa: zT[z].nazwa,
        mecze: String(zT[z].mecze), punkty: String(zT[z].punkty), stosunek: String(zT[z].stosunek) });
    }
    return zTab;
  }
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(liga.arkusz);
  if (!ws || ws.getLastRow() === 0) return [];
  var n = Math.min(ws.getLastRow(), 120);
  var wart = ws.getRange(1, 1, n, 5).getValues();
  var wiersze = [];
  var sekcja = 0;                          // 0 = szukam nagłówka, 1 = wiersze danych
  for (var i = 0; i < wart.length; i++) {
    var a = String(wart[i][0] || '').trim();
    if (sekcja === 0) {
      if (a === 'TABELA LIGOWA') sekcja = 1;
      continue;
    }
    if (a === 'TERMINARZ') break;
    if (a === 'Pozycja') continue;         // nagłówek kolumn
    if (!/^\d+\.$/.test(a)) continue;
    var nazwa = String(wart[i][1] || '').trim();
    if (!nazwa) break;
    wiersze.push({
      pozycja: parseInt(a, 10),
      nazwa: nazwa,
      mecze: String(wart[i][2] || '').trim(),
      punkty: String(wart[i][3] || '').trim(),
      stosunek: String(wart[i][4] || '').trim()
    });
  }
  return wiersze;
}

/** Czyta terminarz Z POWROTU z arkusza ligi (po zapisie wartości). */
function czytajTerminarz_(liga) {
  var zM = cacheRunu_().terminarz[liga.arkusz];             // v1.7.0: świeżo sparsowane w tym przebiegu
  if (zM) return zM.slice();
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(liga.arkusz);
  if (!ws || ws.getLastRow() < 3) return [];
  var n = Math.min(ws.getLastRow(), 500);
  var wart = ws.getRange(1, 1, n, 7).getValues();
  var i = 0;
  for (; i < wart.length; i++) {
    if (String(wart[i][0]).trim() === 'TERMINARZ') break;
  }
  if (i >= wart.length) return [];
  var mecze = [];
  for (var j = i + 2; j < wart.length; j++) {     // +2 = nagłówek kolumn
    var data = String(wart[j][0] || '').trim();
    if (!data) break;
    var gospodarz = String(wart[j][3] || '').trim();
    var gosc = String(wart[j][4] || '').trim();
    if (!gospodarz || !gosc) break;
    var wynik = String(wart[j][5] || '').trim();
    var kol = parseInt(String(wart[j][2] || '').trim(), 10);
    mecze.push({
      dataMeczu: data,
      godzina: String(wart[j][1] || '').trim(),
      kolejka: isNaN(kol) ? null : kol,
      gospodarz: gospodarz,
      gosc: gosc,
      wynik: wynik,
      rozegrany: /^\d+\s*:\s*\d+$/.test(wynik)
    });
  }
  return mecze;
}

/** Buduje „Mecze KTS” — kalendarz WSZYSTKICH meczów naszych drużyn. */
function przebudujMeczeKTS_(etykieta) {
  var wiersze = [];
  var ligi = wczytajLigi_();
  for (var i = 0; i < ligi.length; i++) {
    var mecze = czytajTerminarz_(ligi[i]);
    for (var j = 0; j < mecze.length; j++) {
      var m = mecze[j];
      var nasze = [];
      if (naszaDruzyna_(m.gospodarz)) nasze.push(m.gospodarz);
      if (naszaDruzyna_(m.gosc)) nasze.push(m.gosc);
      if (nasze.length === 0) continue;
      wiersze.push([
        m.dataMeczu, m.godzina, ligi[i].skrot,
        m.kolejka == null ? '' : String(m.kolejka),
        m.gospodarz, m.gosc, m.wynik,
        m.rozegrany ? 'tak' : 'nie', nasze.join(' + ')
      ]);
    }
  }
  // v1.5.0: PZTS — pełnosezonowy terminarz 1. drużyny z „PZTS 1LM”
  // (skrót ligi „1LM” — czytnik strony po nim rozpoznaje źródło PZTS).
  var cfgP = pztsUstawienia_();
  var meczePzts = czytajTerminarz_({ arkusz: cfgP.arkusz });
  for (var p = 0; p < meczePzts.length; p++) {
    var mp = meczePzts[p];
    var naszeP = [];
    if (naszaDruzyna_(mp.gospodarz)) naszeP.push(mp.gospodarz);
    if (naszaDruzyna_(mp.gosc)) naszeP.push(mp.gosc);
    if (naszeP.length === 0) continue;
    wiersze.push([
      mp.dataMeczu, mp.godzina, cfgP.skrot,
      mp.kolejka == null ? '' : String(mp.kolejka),
      mp.gospodarz, mp.gosc, mp.wynik,
      mp.rozegrany ? 'tak' : 'nie', naszeP.join(' + ')
    ]);
  }
  wiersze.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });

  var ws = arkusz_(ARKUSZ_MECZE);
  var nagl = ['Data', 'Godzina', 'Liga', 'Kolejka', 'Gospodarz', 'Gość', 'Wynik', 'Rozegrany', 'Nasza drużyna'];
  var blok = nowyBlok_();                                   // v1.7.0: zapis grupowy + warunkowy
  wierszBloku_(blok, ['KALENDARZ MECZÓW KTS GLIWICE'], 9, { bold: true, rozmiar: 13 });
  wierszBloku_(blok, ['Wszystkie drużyny klubu — ŚZTS (KTS…Gliwice + Krokus) i PZTS (1. drużyna) · zbudowano: ' +
    terazCzas_() + ' (' + etykieta + ')'], 9, { kolor: '#666666' });
  wierszBloku_(blok, [''], 9, null);
  wierszBloku_(blok, nagl, 9, { bold: true, tlo: tloWiersza_(9, KOLOR_NAGLOWKA) });
  for (var iw = 0; iw < wiersze.length; iw++) wierszBloku_(blok, wiersze[iw], 9, null);
  if (zapiszWarunkowo_(ws, blok)) {
    ws.setColumnWidth(1, 100); ws.setColumnWidth(2, 70); ws.setColumnWidth(3, 60);
    ws.setColumnWidth(4, 70); ws.setColumnWidth(5, 240); ws.setColumnWidth(6, 240);
    ws.setColumnWidth(7, 70); ws.setColumnWidth(8, 90); ws.setColumnWidth(9, 260);
  }
  cacheRunu_().meczeKTS = wiersze;                          // v1.7.0: STATUS/dyżur bez powtórnego czytania
  return wiersze.length;
}

/** Wiersze „Mecze KTS” (bez nagłówka) — do dyżuru i statusu. */
function wierszeMeczyKTS_() {
  var zMK = cacheRunu_().meczeKTS;                          // v1.7.0: właśnie zbudowane w tym przebiegu
  if (zMK) return zMK;
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(ARKUSZ_MECZE);
  if (!ws || ws.getLastRow() < 5) return [];
  var n = ws.getLastRow() - 4;
  var wart = ws.getRange(5, 1, n, 9).getValues();
  var wynik = [];
  for (var i = 0; i < wart.length; i++) {
    if (!String(wart[i][0] || '').trim()) continue;
    wynik.push(wart[i]);
  }
  return wynik;
}

/** Mecze danego dnia bez wyniku (kolumny: [data, godzina, liga, …, rozegrany]). */
function meczeDniaBezWyniku_(dzien) {
  var mecze = wierszeMeczyKTS_();
  var wynik = [];
  for (var i = 0; i < mecze.length; i++) {
    if (String(mecze[i][0]).trim() === dzien && String(mecze[i][7]).trim() === 'nie') {
      wynik.push(mecze[i]);
    }
  }
  return wynik;
}

function kalendarzPusty_() { return wierszeMeczyKTS_().length === 0; }

/**
 * v1.7.2: mecze z ostatnich N dni bez wyniku (Dokończenie wyników).
 * Zwraca { liczba, ligi: [liga…], pzts: bool } — ligi unikalne, PZTS gdy
 * wśród meczów jest 1LM. Intencja: mecz DNIA tylko z zapisu Dyżuru nie jest
 * rozegrany — ale „rozegrany = nie” oznacza też mecz jeszcze niepotwierdzony;
 * horyzont 3 dni i okno 07–22 chronią przed wiecznym dopytywaniem
 * (mecze odwołane/wpisane z opóźnieniem wychwyci Patrol i ręczne polecenia).
 */
function meczeOczekujace_(dni) {
  var odDnia = zaDniStr_(-dni);
  var doDnia = zaDniStr_(-1);          // wczoraj (dzień sportowy może trwać do 00:30)
  var mecze = wierszeMeczyKTS_();
  var liczba = 0;
  var pzts = false;
  var mapa = {};
  var ligi = [];
  for (var i = 0; i < mecze.length; i++) {
    var d = String(mecze[i][0] || '').trim();
    if (String(mecze[i][7] || '').trim() !== 'nie') continue;
    if (d < odDnia || d > doDnia) continue;
    liczba++;
    var skrot = String(mecze[i][2] || '').trim();
    if (skrot === PZTS_LIGA_DOMYSLNA.skrot) { pzts = true; continue; }
    if (!mapa[skrot]) {
      mapa[skrot] = true;
      var liga = ligaPoSkrocie_(skrot);
      if (liga) ligi.push(liga);
    }
  }
  return { liczba: liczba, ligi: ligi, pzts: pzts };
}

function meczW7Dni_() {
  var dzis = dzisStr_();
  var za7 = zaDniStr_(7);
  var mecze = wierszeMeczyKTS_();
  for (var i = 0; i < mecze.length; i++) {
    var d = String(mecze[i][0]).trim();
    if (String(mecze[i][7]).trim() === 'nie' && d >= dzis && d <= za7) return true;
  }
  return false;
}

/* ================= „Drużyny” — rejestr dla strony (v1.4) ================= */

/**
 * Buduje arkusz „Drużyny”: po jednej linii na KAŻDĄ naszą drużynę
 * znalezioną w zapisanych tabelach ligowych. Lokalne — 0 zapytań.
 * Kolumny: Karta | Nazwa w ŚZTS | Liga | Skrót | Stan | URL drużyny | URL ligi.
 * To gotowe mapowanie dla generatora dane.json strony (karta ↔ wiersz
 * tabeli ↔ podstrona składu).
 */
function przebudujDruzyny_(etykieta) {
  var ligi = wczytajLigi_();
  var linki = mapaLinkow_();
  var wiersze = [];
  for (var i = 0; i < ligi.length; i++) {
    var tabela = czytajTabele_(ligi[i]);
    for (var j = 0; j < tabela.length; j++) {
      if (!naszaDruzyna_(tabela[j].nazwa)) continue;
      wiersze.push([
        kartaDla_(ligi[i].skrot, tabela[j].nazwa),
        tabela[j].nazwa,
        ligi[i].nazwa,
        ligi[i].skrot,
        tabela[j].pozycja + '. miejsce · ' + tabela[j].punkty + ' pkt',
        linki[tabela[j].nazwa] || '',
        ligi[i].url
      ]);
    }
  }
  // v1.5.0: PZTS — 1. drużyna z zakładki „PZTS 1LM” (nazwa u źródła
  // „KTS Gliwice” → karta „KTS Gliwice I”; liga i URL-e z konfiguracji)
  var cfgPz = pztsUstawienia_();
  var tabelaPz = czytajTabele_({ arkusz: cfgPz.arkusz });
  for (var q = 0; q < tabelaPz.length; q++) {
    if (!naszaDruzyna_(tabelaPz[q].nazwa)) continue;
    wiersze.push([
      kartaDla_(cfgPz.skrot, tabelaPz[q].nazwa),
      tabelaPz[q].nazwa,
      cfgPz.nazwa,
      cfgPz.skrot,
      tabelaPz[q].pozycja + '. miejsce · ' + tabelaPz[q].punkty + ' pkt',
      cfgPz.urlDruzyny,
      cfgPz.urlLigi
    ]);
  }

  var ws = arkusz_(ARKUSZ_DRUZYNY);
  var nagl = ['Karta (strona)', 'Nazwa u źródła', 'Liga', 'Skrót', 'Stan', 'URL podstrony drużyny', 'URL ligi'];
  var blok = nowyBlok_();                                   // v1.7.0: zapis grupowy + warunkowy
  wierszBloku_(blok, ['DRUŻYNY KLUBU — rejestr dla strony KTS'], 7, { bold: true, rozmiar: 13 });
  wierszBloku_(blok, ['Karta = nazwa na stronie (dane.json) · źródła: ŚZTS + PZTS · zbudowano: ' + terazCzas_() +
    ' (' + etykieta + ') · budowane lokalnie z zapisanych tabel (0 zapytań)'], 7, { kolor: '#666666' });
  wierszBloku_(blok, [''], 7, null);
  wierszBloku_(blok, nagl, 7, { bold: true, tlo: tloWiersza_(7, KOLOR_NAGLOWKA) });
  for (var iw = 0; iw < wiersze.length; iw++) wierszBloku_(blok, wiersze[iw], 7, null);
  if (zapiszWarunkowo_(ws, blok)) {
    ws.setColumnWidth(1, 200); ws.setColumnWidth(2, 240); ws.setColumnWidth(3, 240);
    ws.setColumnWidth(4, 70); ws.setColumnWidth(5, 200); ws.setColumnWidth(6, 420); ws.setColumnWidth(7, 300);
  }
  cacheRunu_().rejestr = wiersze;                           // v1.7.0: składy i STATUS bez powtórnego czytania
  return wiersze.length;
}

/** Rejestr z arkusza „Drużyny” (wiersze 5+) — do składów i STATUSU. */
function czytajRejestr_() {
  var zR = cacheRunu_().rejestr;                            // v1.7.0: właśnie przebudowane w tym przebiegu
  if (zR) {
    var rejC = [];
    for (var i = 0; i < zR.length; i++) {
      rejC.push({ karta: zR[i][0], szts: zR[i][1], liga: zR[i][2], skrot: zR[i][3],
        stan: zR[i][4], urlDruzyny: zR[i][5], urlLigi: zR[i][6] });
    }
    return rejC;
  }
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(ARKUSZ_DRUZYNY);
  var rejestr = [];
  if (!ws || ws.getLastRow() < 5) return rejestr;
  var n = ws.getLastRow() - 4;
  var wart = ws.getRange(5, 1, n, 7).getValues();
  for (var i = 0; i < wart.length; i++) {
    var karta = String(wart[i][0] || '').trim();
    var nazwaSzts = String(wart[i][1] || '').trim();
    if (!karta || !nazwaSzts) continue;
    rejestr.push({
      karta: karta,
      szts: nazwaSzts,
      liga: String(wart[i][2] || '').trim(),
      skrot: String(wart[i][3] || '').trim(),
      stan: String(wart[i][4] || '').trim(),
      urlDruzyny: String(wart[i][5] || '').trim(),
      urlLigi: String(wart[i][6] || '').trim()
    });
  }
  return rejestr;
}

/* ================= „Zawodnicy” — składy ze statystykami (v1.4) ================= */

/** Skład (obiekty z parsujSklad_/parsujSkladPzts_) → wiersze [nazwisko…skutecznosc]. */
function wierszeZawodnikow_(zawodnicy) {
  var w = [];
  for (var i = 0; i < zawodnicy.length; i++) {
    var z = zawodnicy[i];
    w.push([z.nazwisko, z.licencja, z.narodowosc, z.rok, z.zwyciestwa, z.porazki, z.punkty, z.skutecznosc || '']);
  }
  return w;
}

/** Stare składy z arkusza „Zawodnicy” → mapa karta → wiersze (do przytrzymania).
 *  v1.5.0: czytamy 9 kolumn (dodana „Skuteczność”); stary układ 8-kolumnowy
 *  czyta się poprawnie — brakująca kolumna wychodzi pusta. */
function czytajStareSklady_() {
  var ss = SpreadsheetApp.getActive();
  var ws = ss.getSheetByName(ARKUSZ_ZAWODNICY);
  var mapa = {};
  if (!ws || ws.getLastRow() < 5) return mapa;
  // v1.4.2: stary układ v1.4/v1.4.1 (7 kolumn — „Nr licencji” w A4, bez
  // kolumny „Drużyna”) nie ma karty w kolumnie A: nie ma czego przytrzymywać
  // (w kol. 1 siedziałyby numery licencji zamiast nazw kart).
  if (String(ws.getRange(4, 1).getDisplayValue()).trim() !== 'Drużyna') return mapa;
  var n = ws.getLastRow() - 4;
  var wart = ws.getRange(5, 1, n, 9).getValues();
  for (var i = 0; i < wart.length; i++) {
    var karta = String(wart[i][0] || '').trim();
    var nazwisko = String(wart[i][1] || '').trim();
    if (!karta || !nazwisko) continue;
    if (!mapa[karta]) mapa[karta] = [];
    mapa[karta].push([
      nazwisko,
      String(wart[i][2] || ''), String(wart[i][3] || ''), String(wart[i][4] || ''),
      String(wart[i][5] || ''), String(wart[i][6] || ''), String(wart[i][7] || ''),
      String(wart[i][8] || '')
    ]);
  }
  return mapa;
}

/** Zapis „Zawodników” z bufora mapa karta → wiersze (kolejność rejestru). */
function zapiszArkuszZawodnikow_(bufor, rejestr, etykieta, statystyka) {
  var ws = arkusz_(ARKUSZ_ZAWODNICY);
  var nagl = ['Drużyna', 'Nazwisko', 'Licencja', 'Narodowość', 'Rok ur.', 'Zwycięstwa', 'Porażki', 'Punkty/Sety', 'Skuteczność'];
  var blok = nowyBlok_();                                   // v1.7.0: zapis grupowy + warunkowy
  wierszBloku_(blok, ['ZAWODNICY — składy drużyn ze statystykami (ŚZTS + PZTS)'], 9, { bold: true, rozmiar: 13 });
  wierszBloku_(blok, ['Źródła: podstrony /druzyna/… na ligi.slzts.pl i pzts.pl · aktualizacja: ' +
    terazCzas_() + ' (' + etykieta + ') · ' + statystyka], 9, { kolor: '#666666' });
  wierszBloku_(blok, [''], 9, null);
  wierszBloku_(blok, nagl, 9, { bold: true, tlo: tloWiersza_(9, KOLOR_NAGLOWKA) });
  var dane = [];
  for (var i = 0; i < rejestr.length; i++) {
    var w = bufor[rejestr[i].karta];
    if (!w) continue;
    for (var j = 0; j < w.length; j++) {
      var wiersz = [rejestr[i].karta].concat(w[j]);
      while (wiersz.length < nagl.length) wiersz.push('');   // stary bufor 8-kol → 9
      dane.push(wiersz);
    }
  }
  for (var iz = 0; iz < dane.length; iz++) wierszBloku_(blok, dane[iz], 9, null);
  if (zapiszWarunkowo_(ws, blok)) {
    ws.setColumnWidth(1, 200); ws.setColumnWidth(2, 220); ws.setColumnWidth(3, 90);
    ws.setColumnWidth(4, 110); ws.setColumnWidth(5, 80); ws.setColumnWidth(6, 100);
    ws.setColumnWidth(7, 90); ws.setColumnWidth(8, 110); ws.setColumnWidth(9, 100);
  }
  return dane.length;
}

/**
 * Odświeża SKŁADY wszystkich drużyn z rejestru (v1.4):
 *  · pobiera tylko podstrony drużyn, które mają URL (z linków w tabelach);
 *  · awaria jednej podstrony = STARE dane tej drużyny zostają (składy
 *    to dodatek — nie ubijają przebiegu);
 *  · całość zapisywana JEDNYM zapisem po zebraniu bufora;
 *  · wszystko pod budżetem czasu (deadline) — niezmieśczone odroczone.
 * Zwraca { ok, zle, odroczone, bezUrl, uwagi }.
 */
function odswierzZawodnikow_(deadline, etykieta) {
  var rejestr = czytajRejestr_();
  if (rejestr.length === 0) {
    return { ok: 0, zle: 0, odroczone: 0, bezUrl: 0, uwagi: ['rejestr „Drużyny” pusty — najpierw przebieg lig'] };
  }
  var stare = czytajStareSklady_();
  // v1.6.0: TURA 1b — podstrony drużyn ŚZTS jedną paczką (rejestr jest już
  // świeży po przebudowie „Drużyn” w tym przebiegu — scalLinki_ z tabel
  // ligowych mogło dodać nowe adresy; drużyna PZTS pobiera się osobno,
  // zwykle darmowym buforem z odswierzPzts_)
  var zadaniaSkladow = [];
  for (var zs = 0; zs < rejestr.length; zs++) {
    var ds = rejestr[zs];
    if (!ds.urlDruzyny || ds.skrot === PZTS_LIGA_DOMYSLNA.skrot) continue;
    if (Date.now() + REZERWA_SKLADU_MS > deadline) continue;   // i tak zostałby odroczony
    zadaniaSkladow.push({ url: ds.urlDruzyny, pzts: false });
  }
  pobierzRownolegle_(zadaniaSkladow);
  var bufor = {};
  var ok = 0, zle = 0, odroczone = 0, bezUrl = 0;
  var uwagi = [];
  for (var i = 0; i < rejestr.length; i++) {
    var d = rejestr[i];
    if (!d.urlDruzyny) {
      bezUrl++;
      if (stare[d.karta]) bufor[d.karta] = stare[d.karta];
      continue;
    }
    if (Date.now() + REZERWA_SKLADU_MS > deadline) {
      odroczone++;
      if (stare[d.karta]) bufor[d.karta] = stare[d.karta];
      continue;
    }
    // v1.5.0: PZTS — osobny kanał (bezpośrednio/czytnik), inny parser;
    // przy okazji zużywa darmowy bufor z odswierzPzts_ tego przebiegu
    // (strona drużyny pobrana już dla terminarza — zero dodatkowych zapytań)
    if (d.skrot === PZTS_LIGA_DOMYSLNA.skrot) {
      try {
        var zawPzts = PZTS_SKLAD_BUFOR;
        if (!zawPzts || zawPzts.length === 0) {
          var strD = pztsPobierz_(d.urlDruzyny, 2, deadline);
          zawPzts = parsujSkladPzts_(strD.tekst);
        }
        if (zawPzts.length === 0) {
          throw new Error('skład PZTS pusty (0 zawodników) — zmiana strony drużyny?');
        }
        bufor[d.karta] = wierszeZawodnikow_(zawPzts);
        ok++;
      } catch (ep) {
        zle++;
        uwagi.push('PZTS skład: ' + ep);
        if (stare[d.karta]) bufor[d.karta] = stare[d.karta];   // awaria = trzymamy stare
      }
      continue;
    }
    try {
      var html = pobierzHtmlDruzyny_(d.urlDruzyny, 2, deadline);
      var zawodnicy = parsujSklad_(html);
      if (zawodnicy.length === 0) {
        throw new Error('skład pusty (0 zawodników) — zmiana struktury strony drużyny?');
      }
      bufor[d.karta] = wierszeZawodnikow_(zawodnicy);
      ok++;
    } catch (e) {
      zle++;
      uwagi.push(d.karta + ': ' + e);
      if (stare[d.karta]) bufor[d.karta] = stare[d.karta];   // awaria = trzymamy stare
    }
  }
  var statystyka = ok + ' ✓' + (zle > 0 ? ' · ' + zle + ' ✗ (stare dane zostają)' : '') +
    (odroczone > 0 ? ' · ' + odroczone + ' ⏭ (odroczono — budżet czasu)' : '') +
    (bezUrl > 0 ? ' · ' + bezUrl + ' bez URL podstrony' : '');
  var ileWierszy = zapiszArkuszZawodnikow_(bufor, rejestr, etykieta, statystyka);
  return { ok: ok, zle: zle, odroczone: odroczone, bezUrl: bezUrl, uwagi: uwagi, wierszy: ileWierszy };
}

/** Czy mece danego dnia mają już komplet wyników (v1.4 — sygnał do składów). */
function wynikiDniaKompletne_(dzien) {
  var mecze = wierszeMeczyKTS_();
  var byly = 0;
  for (var i = 0; i < mecze.length; i++) {
    if (String(mecze[i][0]).trim() === dzien) {
      if (String(mecze[i][7]).trim() === 'nie') return false;
      byly++;
    }
  }
  return byly > 0;
}

/**
 * Decyzja „czy w tym przebiegu odświeżać składy” (v1.4):
 *  · min. 12 h od ostatniego UDANEGO odświeżenia (SKLAD_CO_MS) — dla
 *    AUTOMATU (Patrol / Dyżur); TTL chroni podstrony ŚZTS przed mieleniem;
 *  · KAŻDE polecenie ręczne z menu (v1.4.2: instalacja, pełne odświeżenie,
 *    Patrol „teraz”, Dyżur „teraz”) — NATYCHMIAST, bez TTL; bez tego
 *    instalacja poprawki na świeżo pobrane (uszkodzone) składy zostawiłaby
 *    stare „?” — poprawka niewidoczna mimo poprawnego skryptu;
 *  · wymiana wersji mostu (most.skladyWersja ≠ MOST_WERSJA, v1.4.2) —
 *    jedno wymuszone odświeżenie z automatu (samonaprawa po upgrade);
 *  · Dyżur — tylko gdy wyniki dnia meczowego KOMPLETNE (statystyki
 *    zmieniają się po meczach) i dziś nie było jeszcze odświeżenia
 *    z dyżuru (most.skladyDzien ustawiane wyłącznie tutaj).
 */
function czyOdswiezycSklady_(tryb, reczny) {
  // v1.4.2: KAŻDE polecenie ręczne (instalacja / pełne odświeżenie /
  // Patrol „teraz” / Dyżur „teraz”) — NATYCHMIAST, bez TTL. Krytyczne przy
  // wymianie wersji: bez tego instalacja v1.4.2 zaraz po pobraniu składów
  // przez v1.4.1 (TTL < 12 h) zostawiłaby w „Zawodnikach” STARE nazwiska
  // z „?” — poprawka byłaby niewidoczna mimo poprawnego skryptu.
  if (reczny) return true;
  // v1.4.2: wymiana wersji mostu → jedno wymuszone odświeżenie składów
  // (Patrol/Dyżur dogania naprawione nazwiska najpóźniej pierwszym
  // przebiegiem po instalacji, nawet jeśli nikt nic nie kliknął).
  if (props_().getProperty('most.skladyWersja') !== MOST_WERSJA) return true;
  var ostatnio = skladyCzas_();
  if (ostatnio > 0 && Date.now() - ostatnio < SKLAD_CO_MS) return false;
  if (tryb === 'Patrol') return true;
  if (tryb.indexOf('Dyżur') === 0) {
    if (props_().getProperty('most.skladyDzien') === dzisStr_()) return false;
    var dzienSportowy = godzinaStr_() < '03:00' ? zaDniStr_(-1) : dzisStr_();
    return wynikiDniaKompletne_(dzienSportowy);
  }
  return false;
}

/* ================= Log i status ================= */

function dopiszLog_(tryb, zapytania, szczegoly, blad) {
  var ws = arkusz_(ARKUSZ_LOG);
  if (ws.getLastRow() === 0 || String(ws.getRange(1, 1).getValue()).trim() !== 'Czas') {
    ws.clear();
    ws.getRange(1, 1, 1, 5).setValues([['Czas', 'Tryb', 'Zapytania', 'Szczegóły', 'Błąd']])
      .setFontWeight('bold').setBackground(KOLOR_NAGLOWKA);
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 140); ws.setColumnWidth(2, 170); ws.setColumnWidth(3, 90);
    ws.setColumnWidth(4, 420); ws.setColumnWidth(5, 260);
  }
  ws.insertRowBefore(2);
  ws.getRange(2, 1, 1, 5).setNumberFormat('@').setValues([[
    terazCzas_(), tryb, String(zapytania), szczegoly || '', blad ? String(blad).substring(0, 250) : ''
  ]]);
  // v1.5.0: rolling window 1500 wierszy (~miesiąc telemetrii przy 48
  // tickach/dobę; wcześniej 400). Trim automatyczny, najnowsze na górze.
  if (ws.getMaxRows() > LOG_LIMIT_WIERSZY) {
    ws.deleteRows(LOG_LIMIT_WIERSZY + 1, ws.getMaxRows() - LOG_LIMIT_WIERSZY);
  }
}

function aktualizujStatus_(ostatniTryb) {
  var ws = arkusz_(ARKUSZ_INFO);
  var stan = stanLig_();
  var ligi = wczytajLigi_();
  var wierszeStanu = [];
  for (var i = 0; i < ligi.length; i++) {
    var s = stan[ligi[i].skrot];
    wierszeStanu.push(ligi[i].skrot + ': ' + (s ? (s.ok ? '✓ ' + s.czas : '✗ ' + (s.blad || 'błąd')) : '— jeszcze nie pobrano'));
  }
  // v1.5.0: PZTS — stan w tym samym bloku co ligi ŚZTS
  var sP = stan['pzts'];
  wierszeStanu.push('PZTS (1LM): ' + (sP ? (sP.ok ? '✓ ' + sP.czas : '✗ ' + (sP.blad || 'błąd')) : '— jeszcze nie pobrano'));
  // najbliższy mecz
  var dzis = dzisStr_();
  var najblizszy = '— brak zaplanowanych meczów';
  var mecze = wierszeMeczyKTS_();
  for (var j = 0; j < mecze.length; j++) {
    if (String(mecze[j][7]).trim() === 'nie' && String(mecze[j][0]).trim() >= dzis) {
      najblizszy = mecze[j][0] + ' ' + (mecze[j][1] || '') + ' · ' + mecze[j][2] +
        ' · ' + mecze[j][4] + ' – ' + mecze[j][5] + ' (' + mecze[j][8] + ')';
      break;
    }
  }
  // v1.4: składy zawodników — ostatnie odświeżenie i rozmiar
  var skladyTxt = 'Składy zawodników: — jeszcze nie pobrano';
  var ostatnioSklady = skladyCzas_();
  if (ostatnioSklady > 0) {
    var dS = new Date(ostatnioSklady);
    skladyTxt = 'Składy zawodników: ostatnio ' +
      Utilities.formatDate(dS, STREFA, 'dd.MM HH:mm') + ' · rejestr: ' +
      czytajRejestr_().length + ' drużyn';
  }

  var ostrzezenia = [];
  var uwagaSezon = props_().getProperty('most.uwagaSezon');
  if (uwagaSezon) ostrzezenia.push(uwagaSezon);
  if (backlog_()) ostrzezenia.push('zaległość pobierania — Dokończenie ponowi');
  var formuly = props_().getProperty('most.formulyImport');
  if (formuly) ostrzezenia.push(formuly);
  var pztsUwaga = props_().getProperty('most.pztsUwaga');
  if (pztsUwaga) ostrzezenia.push(pztsUwaga);          // v1.5.0: alarm Patroli PZTS
  // v1.4: ostrzeżenie o zbliżaniu się do dziennego limitu zapytań
  var ileZapytan = zapytaniaDzis_();
  if (ileZapytan > LIMIT_ZAPYTAN / 2) {
    ostrzezenia.push('zużyto ponad połowę dziennego limitu zapytań (' + ileZapytan + '/' + LIMIT_ZAPYTAN + ')');
  }

  // Porządek zakładek (v1.3) — STATUS pilnuje białej listy na bieżąco.
  var zbednePelne = arkuszeZbedne_();
  var porzadek = zbednePelne.length === 0
    ? 'Porządek zakładek: ✓ tylko używane przez most'
    : 'Porządek zakładek: ZBĘDNE (' + zbednePelne.length + '): ' + nazwyZbednych_(10) +
      ' — usuń: menu „' + MENU_NAZWA + '” → Zainstaluj / napraw strukturę';

  var dane = [
    ['Most SLZTS v' + MOST_WERSJA + ' · ostatni przebieg: ' + terazCzas_() + ' (' + ostatniTryb + ')'],
    ['Zapytania do ligi.slzts.pl dziś: ' + ileZapytan + ' / ' + LIMIT_ZAPYTAN +
     ' · do pzts.pl: ' + pztsZapytaniaDzis_() + ' / ' + LIMIT_ZAPYTAN_PZTS +
     ' (osobne budżety) · Dokończenia dziś: ' + dokonczeniaDzis_() + '/' + DOKONCZEN_MAX]
  ].concat(
    wierszeStanu.map(function (w) { return [w]; }),
    [
      ['Najbliższy mecz: ' + najblizszy],
      [skladyTxt],
      ['Ostrzeżenia: ' + (ostrzezenia.length > 0 ? ostrzezenia.join(' · ') : 'brak')],
      [porzadek]
    ]
  );
  ws.getRange(5, 1, 9 + ligi.length, 1).clearContent();
  ws.getRange(5, 1, dane.length, 1).setValues(dane);
}

/* ================= Seria niepowodzeń + alert e-mail (v1.4) ================= */

/**
 * Zabezpieczenie D. Seria = kolejne przebiegi, w których ZERO lig się
 * udało (a przynajmniej jedna była próbowana). Po PROG_SERII — e-mail
 * do konta właściciela (max 1/dobę). Pierwszy sukces zeruje serię.
 * Świadome pominięcia limitu zapytań NIE liczą się do serii (to decyzja
 * ochronna, nie awaria ŚZTS).
 */
function zarzadzSeria_(sukcesy, bledy, tryb) {
  var p = props_();
  if (sukcesy > 0) {
    if (p.getProperty('most.seria') !== '0') p.setProperty('most.seria', '0');
    return;
  }
  if (!bledy || bledy.length === 0) return;          // nic nie próbowano — nie liczę
  var tylkoLimit = true;
  for (var i = 0; i < bledy.length; i++) {
    if (String(bledy[i]).indexOf('dzienny limit') < 0) { tylkoLimit = false; break; }
  }
  if (tylkoLimit) return;

  var seria = parseInt(p.getProperty('most.seria') || '0', 10) || 0;
  seria++;
  p.setProperty('most.seria', String(seria));

  if (seria >= PROG_SERII && p.getProperty('most.alertDzien') !== dzisStr_()) {
    p.setProperty('most.alertDzien', dzisStr_());
    var url = '';
    try { url = SpreadsheetApp.getActive().getUrl(); } catch (e) {}
    var adres = '';
    try { adres = Session.getActiveUser().getEmail(); } catch (e2) {}
    if (!adres) return;
    try {
      MailApp.sendEmail(adres,
        'Most SLZTS — ' + PROG_SERII + ' nieudanych przebiegów z rzędu',
        'Most SLZTS v' + MOST_WERSJA + ' nie może pobrać danych z ligi.slzts.pl — ' +
        seria + ' przebiegów z rzędu bez ani jednej udanej ligi.\n\n' +
        'Ostatni błąd (' + tryb + '):\n' + bledy.join('\n').substring(0, 500) + '\n\n' +
        'Co sprawdzić:\n' +
        '1. Czy ligi.slzts.pl otwiera się w przeglądarce (awaria serwera ŚZTS?).\n' +
        '2. Czy adresy lig w zakładce „Cfg” są aktualne (zmiana sezonu = nowe adresy).\n' +
        '3. Pełny dziennik: zakładka „Log”.\n\n' +
        'Ten alert przychodzi maksymalnie raz na dobę i zniknie sam po pierwszym udanym pobraniu.\n' +
        'Arkusz: ' + url);
    } catch (e3) { /* brak autoryzacji maila itp. — nie może ubić przebiegu */ }
  }
}

/* ================= Główny przebieg ================= */

/**
 * Wspólny przebieg odświeżania. v1.2: LIGI NAJPIERW, hub na końcu
 * (best-effort); wszystko pod budżetem czasu (CZAS_TWARDY_MS); błąd
 * krytyczny nie pozbawia nas Loga i STATUSU.
 * v1.4:
 *  · LockService — drugi przebieg w trakcie pierwszego jest pomijany
 *    (zabezpieczenie A; kolizja trigger×menu albo menu×menu);
 *  · po ligach: przebudowa rejestru „Drużyny” (lokalne) i — wg reguł
 *    czyOdswiezycSklady_ — odświeżenie składów „Zawodnicy”;
 *  · po przebiegu: zarządzanie serią niepowodzeń (zabezpieczenie D).
 *
 * @param tryb     etykieta (Patrol / Dyżur meczowy / Dokończenie / menu)
 * @param ligy     lista lig do pobrania (ŚZTS)
 * @param zHubem   czy sprawdzać stronę główną ŚZTS (Patrol i instalacja)
 * @param reczny   true = wywołane z menu (może pokazać okienko)
 * @param pzts     v1.5.0: czy w tym przebiegu odświeżyć też PZTS (kanał
 *                 i budżet osobne; awaria PZTS NIE ubija ŚZTS)
 */
function wykonajOdswiezenie_(tryb, ligy, zHubem, reczny, pzts) {
  // v1.4 (zabezpieczenie A): jeden przebieg naraz — trigger albo menu
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    try { dopiszLog_(tryb, 0, 'pominięto — inny przebieg mostu właśnie działa (blokada LockService)', null); } catch (e0) {}
    if (reczny) {
      try {
        var ui0 = SpreadsheetApp.getUi();
        ui0.alert(MENU_NAZWA,
          'Inny przebieg mostu właśnie działa (automat albo drugie polecenie z menu).\n' +
          'Poczekaj 1–2 minuty i spróbuj ponownie.', ui0.ButtonSet.OK);
      } catch (e1) {}
    }
    return;
  }

  try {
    var start = Date.now();
    var deadline = start + CZAS_TWARDY_MS;
    KOREKTY_RUNU = [];
    USZKODZENIA_RUNU = {};                                 // v1.4.2
    PZTS_SKLAD_BUFOR = null;                               // v1.5.0
    MS_SIEC = 0; MS_SEN = 0;                               // v1.5.5: timery przebiegu
    FAZY_ = { ligi: 0, hub: 0, pzts: 0, patrol: 0, mecze: 0, druzyny: 0, sklady: 0 };
    FETCH_BUFOR_ = {};                                     // v1.6.0: tura równoległa
    TURA1_ = { ile: 0, ms: 0 };                            // v1.6.0
    SZEREGOWE_ = 0;                                        // v1.6.0
    CACHE_RUNU_ = null;                                    // v1.7.0: cache odczytów przebiegu
    ZAPISY_PELNE_ = 0; ZAPISY_OSZCZEDZONE_ = 0;            // v1.7.0: zapisy grupowe
    var zapytaniaPrzed = zapytaniaDzis_();
    var wyniki = [];
    var bledy = [];
    var odroczone = [];
    var ileMeczy = 0;
    var sukcesy = 0;

    try {
      // v1.6.0: TURA 1 — paczka równoległa wszystkiego, co znamy z góry:
      // ligi przebiegu + strony PZTS (liga i drużyna, kanał bezpośredni)
      // + hub, jeśli ten przebieg go sprawdza. Składy dołączą drugą paczką
      // (TURA 1b w odswierzZawodnikow_) po przebudowie „Drużyn” — ich
      // adresy zależą od rejestru, który dopiero ta przebudowa odświeża.
      var zadaniaTury1 = [];
      for (var z1 = 0; z1 < ligy.length; z1++) {
        if (Date.now() + REZERWA_LIGI_MS <= deadline) {
          zadaniaTury1.push({ url: ligy[z1].url, pzts: false });
        }
      }
      if (pzts && Date.now() + REZERWA_PZTS_MS <= deadline) {
        var cfgP1 = pztsUstawienia_();
        zadaniaTury1.push({ url: cfgP1.urlLigi, pzts: true });
        zadaniaTury1.push({ url: cfgP1.urlDruzyny, pzts: true });
      }
      if (zHubem && Date.now() + 55000 <= deadline) {
        zadaniaTury1.push({ url: HUB_URL, pzts: false });
      }
      pobierzRownolegle_(zadaniaTury1);

      // — LIGI (najpierw dane, dodatki potem) —
      var tLigi = Date.now();                            // v1.5.5: timer fazy
      for (var i = 0; i < ligy.length; i++) {
        if (Date.now() + REZERWA_LIGI_MS > deadline) {
          zapiszStanLigi_(ligy[i].skrot, false, 'odroczono — limit czasu przebiegu');
          odroczone.push(ligy[i].skrot);
          wyniki.push(ligy[i].skrot + ' ⏭ (odroczono — dokończy „Dokończenie”)');
          continue;
        }
        try {
          var t1Ligi = Date.now();                        // v1.5.5: czas per liga
          var ile = odswierzLige_(ligy[i], tryb, deadline);
          sukcesy++;
          wyniki.push(ligy[i].skrot + ' ✓ (' + ile + ' meczów · ' + sek_(Date.now() - t1Ligi) + ')');
        } catch (e) {
          zapiszStanLigi_(ligy[i].skrot, false, String(e));
          zapiszBladWArkuszu_(ligy[i], e);
          bledy.push(ligy[i].skrot + ': ' + e);
          wyniki.push(ligy[i].skrot + ' ✗ ' + e);
        }
      }

      FAZY_.ligi = Date.now() - tLigi;                   // v1.5.5: koniec fazy LIGI

      // — HUB (best-effort, NA KOŃCU — nigdy kosztem lig) —
      if (zHubem) {
        if (Date.now() + 55000 <= deadline) {
          var tHub = Date.now();                          // v1.5.5
          var hub = sprawdzHub_();
          FAZY_.hub = Date.now() - tHub;                  // v1.5.5
          if (hub.uwaga) {
            props_().setProperty('most.uwagaSezon', hub.uwaga);
            wyniki.push('hub: ' + hub.uwaga);
          } else {
            props_().deleteProperty('most.uwagaSezon');
            wyniki.push(hub.blad ? 'hub: ' + hub.blad : 'hub ✓');
          }
        } else {
          wyniki.push('hub ⏭ (brak budżetu czasu)');
        }
      }

      // — PZTS (v1.5.0): osobny kanał i budżet; awaria PZTS NIE ubija
      //    ŚZTS — stan „pzts” ląduje w Log/STATUS, Dokończenie ponowi —
      if (pzts) {
        if (Date.now() + REZERWA_PZTS_MS <= deadline) {
          try {
            var tPzts = Date.now();                       // v1.5.5
            var ilePzts = odswierzPzts_(tryb, deadline);
            FAZY_.pzts = Date.now() - tPzts;              // v1.5.5
            wyniki.push('PZTS ✓ (' + ilePzts + ' meczów)');
          } catch (ep) {
            zapiszStanLigi_('pzts', false, String(ep));
            zapiszBladPzts_(ep);
            bledy.push('PZTS: ' + ep);
            wyniki.push('PZTS ✗ ' + ep);
          }
        } else {
          wyniki.push('PZTS ⏭ (brak budżetu czasu — dogoni Dokończenie)');
        }
      }

      // — PATROL PZTS (v1.5.0): raz dziennie (bramka wewnętrzna), przy
      //    przebiegach z hubem (Patrol / pełne / instalacja) — skan tabel
      //    WSZYSTKICH lig centralnych PZTS (wykrycie + auto-adopt) —
      if (zHubem && Date.now() + 60000 <= deadline) {
        var tPatrol = Date.now();                         // v1.5.5
        try { patrolPzts_(deadline); } catch (epat) { wyniki.push('Patrol PZTS ✗ ' + epat); }
        FAZY_.patrol = Date.now() - tPatrol;              // v1.5.5
      }

      var tMecze = Date.now();                            // v1.5.5
      ileMeczy = przebudujMeczeKTS_(tryb);
      FAZY_.mecze = Date.now() - tMecze;                  // v1.5.5
    } catch (e) {
      // błąd krytyczny — Log i STATUS i tak muszą powstać
      bledy.push('KRYTYCZNY: ' + String(e));
      wyniki.push('przerwano błędem krytycznym: ' + e);
      try { var tM2 = Date.now(); ileMeczy = przebudujMeczeKTS_(tryb); FAZY_.mecze += Date.now() - tM2; } catch (e2) {}   // v1.5.5
    }

    // — „Drużyny” (v1.4): rejestr lokalnie z zapisanych tabel (0 zapytań) —
    var ileDruzyn = 0;
    try {
      var tDruzyny = Date.now();                         // v1.5.5
      ileDruzyn = przebudujDruzyny_(tryb);
      FAZY_.druzyny = Date.now() - tDruzyny;              // v1.5.5
      wyniki.push('Drużyny: ' + ileDruzyn);
    } catch (ed) {
      wyniki.push('Drużyny ✗ ' + ed);
    }

    // — „Zawodnicy” (v1.4): składy wg reguł harmonogramu —
    var tekstSkladow = null;
    if (czyOdswiezycSklady_(tryb, reczny)) {
      try {
        var tSklady = Date.now();                        // v1.5.5
        var sk = odswierzZawodnikow_(deadline, tryb);
        FAZY_.sklady = Date.now() - tSklady;              // v1.5.5
        tekstSkladow = 'Zawodnicy: ' + sk.ok + ' drużyn ✓' +
          (sk.zle > 0 ? ' · ' + sk.zle + ' ✗' : '') +
          (sk.odroczone > 0 ? ' · ' + sk.odroczone + ' ⏭' : '') +
          ' · ' + sk.wierszy + ' wierszy';
        wyniki.push(tekstSkladow);
        if (sk.ok > 0) {
          props_().setProperty('most.skladyCzas', String(Date.now()));   // zegar TTL 12 h
          props_().setProperty('most.skladyWersja', MOST_WERSJA);         // v1.4.2: wersja, która odświeżyła składy
          if (tryb.indexOf('Dyżur') === 0) {
            props_().setProperty('most.skladyDzien', dzisStr_());        // blokada 1×/dzień dla dyżuru
          }
        }
        if (sk.uwagi && sk.uwagi.length > 0) bledy = bledy.concat(sk.uwagi);
      } catch (ez) {
        wyniki.push('Zawodnicy ✗ ' + ez);
      }
    }

    // v1.4.2: nierozpoznane uszkodzenia znaków ŚZTS — jawny sygnał do map
    // naprawczych („?” pozostaje też widoczne w danych arkusza).
    var uszkodzeniaTxt = [];
    for (var ku in USZKODZENIA_RUNU) uszkodzeniaTxt.push(USZKODZENIA_RUNU[ku]);
    if (uszkodzeniaTxt.length > 0) {
      wyniki.push('nierozpoznane „?” ŚZTS (dopisz do map naprawczych): ' +
        uszkodzeniaTxt.join('; ').substring(0, 220));
    }

    var szczegoly = wyniki.join(' · ') + ' · Mecze KTS: ' + ileMeczy +
      (KOREKTY_RUNU.length > 0 ? ' · korekty godzin: ' + KOREKTY_RUNU.length : '') +
      ' · czas: ' + sek_(Date.now() - start) + ' [' + fazyTxt_() + ']';   // v1.5.5: timery faz
    var zapytania = zapytaniaDzis_() - zapytaniaPrzed;

    try { dopiszLog_(tryb, zapytania, szczegoly, bledy.length > 0 ? bledy.join(' | ') : null); } catch (e3) {}
    try { odswiezStatystykiPulsu_(); } catch (e3b) {}   // v1.7.1: świeża statystyka w Puls od razu po przebiegu
    try { aktualizujStatus_(tryb); } catch (e4) {}
    try { zarzadzSeria_(sukcesy, bledy, tryb); } catch (e5) {}   // v1.4: zabezpieczenie D

    if (reczny) {
      try {
        var ui = SpreadsheetApp.getUi();
        var txt = 'Most SLZTS v' + MOST_WERSJA + ' — ' + tryb + '\n\n' +
          wyniki.join('\n') +
          '\n\nMecze KTS: ' + ileMeczy + ' · Drużyny: ' + ileDruzyn +
          ' · zapytania w tym przebiegu: ' + zapytania +
          ' (dziś: ' + zapytaniaDzis_() + '/' + LIMIT_ZAPYTAN + ')' +
          ' · czas: ' + sek_(Date.now() - start) + ' [' + fazyTxt_() + ']';   // v1.5.5: timery faz
        if (tekstSkladow === null && ligy.length > 0) {
          txt += '\n\nSkłady „Zawodnicy” w tym przebiegu: NIE odświeżane (min. 12 h od ostatniego albo poza harmonogramem — Patrol / po komplecie wyników dyżuru).';
        }
        if (odroczone.length > 0) {
          txt += '\n\nODROCZONE (limit czasu przebiegu): ' + odroczone.join(', ') +
            '\nAutomat „Dokończenie” pobierze je przy najbliższym ticku (~15 min; wymaga zainstalowanej automatyzacji).';
        }
        if (bledy.length > 0) txt += '\n\nBŁĘDY:\n' + bledy.join('\n');
        ui.alert(MENU_NAZWA, txt, ui.ButtonSet.OK);
      } catch (e6) {}
    }
  } finally {
    try { lock.releaseLock(); } catch (e7) {}
  }
}

/**
 * Zarządca — trigger co 15 minut.
 * 1) Patrol ok. 03:00 (raz dziennie) · 2) Dyżur meczowy 15:00–00:30 ·
 * 3) Dokończenie zaległych lig (maks. 6 rund dziennie) ·
 * 4) cisza = zero zapytań i zero logów.
 * v1.4: po wyczerpaniu dziennego limitu zapytań — pełna cisza
 * (żaden tryb nie strzela do ŚZTS; licznik w STATUS wyjaśnia dlaczego).
 */
function Zarzadca() {
  zapiszPuls_();                      // v1.4.3: heartbeat — strażnik świeżości syncu
  var props = props_();
  var dzis = dzisStr_();
  var godz = godzinaStr_();

  // v1.4 (zabezpieczenie C): limit wyczerpany — pauza do jutra
  if (zapytaniaDzis_() >= LIMIT_ZAPYTAN) return;

  // 1) PATROL — raz dziennie w oknie 03:00–03:59
  if (godz >= '03:00' && godz < '04:00' && props.getProperty('most.patrol') !== dzis) {
    props.setProperty('most.patrol', dzis);
    if (meczW7Dni_() || backlog_()) {
      wykonajOdswiezenie_('Patrol', wczytajLigi_(), true, false, true);   // v1.5.0: +PZTS +Patrol PZTS
      return;
    }
    dopiszLog_('Patrol', 0, 'pominięto: brak meczów w 7 dni i brak zaległości (0 zapytań)', null);
    return;
  }

  // 2) DYŻUR MECZOWY — 15:00–00:30 w dni meczowe
  var oknoWieczor = godz >= '15:00' && godz <= '23:59';
  var oknoPolnoc = godz < '00:30';
  if (oknoWieczor || oknoPolnoc) {
    var dzienSportowy = oknoPolnoc ? zaDniStr_(-1) : dzis;
    var mecze = meczeDniaBezWyniku_(dzienSportowy);
    if (mecze.length > 0) {
      var skroty = {};
      var cele = [];
      var pztsDzis = false;
      for (var i = 0; i < mecze.length; i++) {
        var skrot = String(mecze[i][2]).trim();
        if (skrot === PZTS_LIGA_DOMYSLNA.skrot) pztsDzis = true;   // v1.5.0
        if (!skroty[skrot]) {
          skroty[skrot] = true;
          var liga = ligaPoSkrocie_(skrot);
          if (liga) cele.push(liga);
        }
      }
      if (cele.length > 0 || pztsDzis) {
        wykonajOdswiezenie_('Dyżur meczowy (' + mecze.length + ' bez wyniku)', cele, false, false, true);
        return;
      }
    } else if (kalendarzPusty_() && oknoWieczor) {
      // pierwsze uruchomienie bez danych — zbuduj kalendarz
      wykonajOdswiezenie_('Dyżur (pierwsze zbieranie)', wczytajLigi_(), false, false, true);
      return;
    } else if (oknoWieczor || oknoPolnoc) {
      // wyniki kompletne — to tu dyżur dociąga SKŁADY (v1.4): statystyki
      // zawodników zmieniają się po meczach. czyOdswiezycSklady_ pilnuje
      // (12 h TTL + raz dziennie z dyżuru), więc poniższe przebiegi po
      // komplecie wyników są tanie: 0 zapytań o ligi, najwyżej 7 o składy.
      // v1.5.0: PZTS też — tabela 1. ligi + skład (stats po meczu).
      if (props.getProperty('most.skladyDzien') !== dzis && wynikiDniaKompletne_(dzienSportowy)) {
        var rejestr = czytajRejestr_();
        var maUrl = false;
        for (var r = 0; r < rejestr.length; r++) {
          if (rejestr[r].urlDruzyny) { maUrl = true; break; }
        }
        if (rejestr.length > 0 && maUrl) {
          wykonajOdswiezenie_('Dyżur (składy po wynikach)', [], false, false, true);
          return;
        }
      }
    }
  }

  // 3) DOKOŃCZENIE (v1.2) — liga niepobrana/nieudana (awaria lub wiszące
  //    połączenie ŚZTS) jest ponawiana na kolejnych tickach do skutku,
  //    maks. DOKONCZEN_MAX rund dziennie. Cisza = brak zaległości.
  //    v1.5.0: zaległa jest też PZTS (osobny licznik stanu „pzts”).
  var zalegle = ligiZalegle_();
  var pztsZal = pztsZalegla_();
  if ((zalegle.length > 0 || pztsZal) && dokonczeniaDzis_() < DOKONCZEN_MAX) {
    zliczDokonczenie_();
    wykonajOdswiezenie_('Dokończenie (' + zalegle.length + ' zaległe' + (pztsZal ? ' + PZTS' : '') + ')',
      zalegle, false, false, pztsZal);
    return;
  }

  // 3b) DOKOŃCZENIE WYNIKÓW (v1.7.2) — luka z 17.11: mecz rozegrowany, ale
  //     wynik nie zdążył w oknie Dyżuru (publikacja u źródła po 00:30 albo
  //     mecz przełożony). Wcześniej taki mecz czekał do Patrolu 03:15
  //     NASTĘPNEJ nocy — na stronie „oczekiwanie” wisi cały dzień.
  //     Teraz: w godz. 07:00–22:00 co OCZEK_CO_MS (2 h) tick sprawdza ligi
  //     meczów z ostatnich 3 dni bez wyniku (Mecze KTS, kolumna „rozegrany”
  //     = nie; zapis z Dyżuru nie jest wymagany — wystarczy brak wyniku).
  //     Budżet: ~6 przebiegów × 1–2 ligi = 6–12 zapytań dziennie, najwyżej,
  //     gdy coś realnie czeka. Puste dni = zero zapytań (tylko odczyt arkusza).
  var godzOczek = godz >= '07:00' && godz <= '22:00';
  var ostOczek = props.getProperty('most.oczekOstatni');        // timestamp [ms] ostatniego sprawdzenia
  var oczekiwane = godzOczek ? meczeOczekujace_(OCZEK_HORYZONT_DNI) : { liczba: 0, ligi: [], pzts: false };
  if (oczekiwane.liczba > 0 && (!ostOczek || Date.now() - Number(ostOczek) >= OCZEK_CO_MS)) {
    props.setProperty('most.oczekOstatni', String(Date.now()));
    wykonajOdswiezenie_('Dokończenie wyników (' + oczekiwane.liczba + ' bez wyniku)',
      oczekiwane.ligi, false, false, oczekiwane.pzts);
    return;
  }

  // 4) CISZA — poza oknami nic nie robię (0 zapytań)
}

/* ================= Menu i instalacja ================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAZWA)
    .addItem('Pełne odświeżenie', 'pelneOdswiezenie')
    .addItem('Sprawdź wyniki teraz', 'sprawdzWynikiTeraz')
    .addItem('Przebuduj kalendarz', 'przebudujKalendarz')
    .addSeparator()
    .addItem('Zainstaluj / napraw strukturę', 'zainstalujStrukture')
    .addItem('Zainstaluj automatyzację', 'zainstalujAutomatyzacje')
    .addSeparator()
    .addItem('PZTS: testuj kanały', 'testPztsKanalow')
    .addItem('Archiwizuj sezon (snapshot)', 'archiwizujSezon')
    .addToUi();
}

/** Opakowanie pozycji menu: błąd trafia do „Log” i na ekran, nie w próżnię. */
function przyMenu_(etykieta, fn) {
  try {
    fn();
  } catch (e) {
    try { dopiszLog_(etykieta, 0, 'BŁĄD przebiegu', String(e)); } catch (e2) {}
    try {
      var ui = SpreadsheetApp.getUi();
      ui.alert(MENU_NAZWA + ' — ' + etykieta + ': BŁĄD', String(e), ui.ButtonSet.OK);
    } catch (e3) {}
  }
}

function pelneOdswiezenie() {
  przyMenu_('Pełne odświeżenie', function () {
    wykonajOdswiezenie_('Pełne odświeżenie', wczytajLigi_(), true, true, true);
  });
}

function sprawdzWynikiTeraz() {
  przyMenu_('Sprawdź wyniki teraz', function () {
    var mecze = meczeDniaBezWyniku_(dzisStr_());
    var cele = [];
    var skroty = {};
    for (var i = 0; i < mecze.length; i++) {
      var skrot = String(mecze[i][2]).trim();
      if (!skroty[skrot]) {
        skroty[skrot] = true;
        var liga = ligaPoSkrocie_(skrot);
        if (liga) cele.push(liga);
      }
    }
    var etykieta = 'Sprawdź wyniki teraz';
    if (cele.length === 0) { cele = wczytajLigi_(); etykieta += ' (brak meczów dziś — wszystkie ligi)'; }
    wykonajOdswiezenie_(etykieta, cele, false, true, true);
  });
}

function przebudujKalendarz() {
  przyMenu_('Przebuduj kalendarz', function () {
    wykonajOdswiezenie_('Przebuduj kalendarz', wczytajLigi_(), false, true, true);
  });
}

/**
 * v1.5.0: PZTS — test kanałów (uruchom RAZ po instalacji). Sprawdza
 * oba kanały na stronie 1. ligi i próbuje sparsować tabelę z odpowiedzi;
 * werdykt ląduje na ekranie i w Logu. Bez kluczy, 2 zapytania PZTS.
 */
function testPztsKanalow() {
  przyMenu_('PZTS: testuj kanały', function () {
    var ui = SpreadsheetApp.getUi();
    var cfg = pztsUstawienia_();
    var raport = [];

    // — KANAŁ 1: bezpośrednio —
    var k1 = '';
    try {
      sprawdzLimitPzts_();
      policzZapytaniePzts_();
      var odp = UrlFetchApp.fetch(cfg.urlLigi, {
        muteHttpExceptions: true, followRedirects: true, timeoutSeconds: 20,
        headers: { 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA, 'Accept': 'text/html' }
      });
      var kod = odp.getResponseCode();
      var tresc = odp.getContentText('UTF-8') || '';
      if (kod === 200 && tresc.length > 3000 && !/just a moment|cloudflare|cf-challenge/i.test(tresc)) {
        var probe1 = parsujTabelePzts_(tresc);
        var notki1 = PZTS_NOTATKI.slice();                     // v1.5.3
        k1 = 'HTTP 200 — DZIAŁA (' + tresc.length + ' B' +
          (probe1.length > 0 ? ', tabela: ' + probe1.length + ' drużyn)' : ', ale tabeli nie widać)') +
          (notki1.length > 0 ? '\n· punkty: ' + notki1.length + ' wiersz(y) z bilansu/odstępstwo (szczegóły w Logu)' : '');
      } else if (kod === 403) {
        k1 = 'HTTP 403 — Cloudflare blokuje (SPODZIEWANE — pracuje czytnik)';
      } else {
        k1 = 'HTTP ' + kod + ' (' + tresc.length + ' B) — nie użyteczny';
      }
    } catch (e) { k1 = 'błąd: ' + e; }
    raport.push('KANAŁ 1 (bezpośrednio UrlFetchApp):\n' + k1);

    // — KANAŁ 2: czytnik —
    var k2 = '';
    try {
      sprawdzLimitPzts_();
      policzZapytaniePzts_();
      var odp2 = UrlFetchApp.fetch(PZTS_CZYTNIK_URL + cfg.urlLigi, {
        muteHttpExceptions: true, followRedirects: true, timeoutSeconds: 30,
        headers: { 'Accept': 'text/plain', 'User-Agent': 'Most-KTS-Gliwice/' + MOST_WERSJA }
      });
      var kod2 = odp2.getResponseCode();
      var t2 = odp2.getContentText('UTF-8') || '';
      if (kod2 === 200 && t2.length > 3000) {
        var probe2 = parsujTabelePzts_(t2);
        var notki2 = PZTS_NOTATKI.slice();                     // v1.5.3
        k2 = 'HTTP 200 — DZIAŁA (' + t2.length + ' B' +
          (probe2.length > 0 ? ', tabela: ' + probe2.length + ' drużyn)' : ', ale tabeli nie widać)') +
          (notki2.length > 0 ? '\n· punkty: ' + notki2.length + ' wiersz(y) z bilansu/odstępstwo (szczegóły w Logu)' : '');
      } else if (kod2 === 401 || kod2 === 429) {
        k2 = 'HTTP ' + kod2 + ' — czytnik odrzuca (limit/reputacja IP — spróbuj ponownie za chwilę)';
      } else {
        k2 = 'HTTP ' + kod2 + ' (' + t2.length + ' B)';
      }
    } catch (e2) { k2 = 'błąd: ' + e2; }
    raport.push('KANAŁ 2 (czytnik r.jina.ai):\n' + k2);

    var dziala = (k1.indexOf('DZIAŁA') >= 0) || (k2.indexOf('DZIAŁA') >= 0);
    raport.push(dziala
      ? 'WERDYKT: PZTS działa — zaległości dogoni automat (Dokończenie/dyżur).'
      : 'WERDYKT: żaden kanał nie odpowiedział — most przytrzyma zakładkę „PZTS 1LM” (dane ŚZTS pracują normalnie). Daj znać — dołożę kanał formułowy jak w starym moście PZTS.');

    if (PZTS_NOTATKI.length > 0) {                            // v1.5.3: diagnostyka punktów z ostatniej próby
      dopiszLog_('PZTS: test kanałów — punkty', 0,
        PZTS_NOTATKI.join(' · ').substring(0, 280), null);
    }
    dopiszLog_('PZTS: test kanałów', 2, raport.join(' · ').replace(/\n/g, ' ').substring(0, 300), null);
    ui.alert('PZTS: test kanałów', raport.join('\n\n'), ui.ButtonSet.OK);
  });
}

/**
 * v1.5.0: ARCHIWIZACJA SEZONU — snapshot zakładek danych (Liga…, PZTS 1LM,
 * Mecze KTS, Drużyny, Zawodnicy) jako WARTOŚCI do osobnego skoroszytu
 * + ogon Logu (100 najnowszych wpisów, aneks „kryminalistyczny”).
 * Link ląduje w INFO (most.archiwum) i Logu. Po archiwizacji most działa
 * dalej — to snapshot, nie zamknięcie (nowy sezon = nowe adresy w Cfg
 * + własności pzts.*, ewentualnie czyszczenie ręczne).
 */
function archiwizujSezon() {
  przyMenu_('Archiwizuj sezon', function () {
    var ui = SpreadsheetApp.getUi();
    var ss = SpreadsheetApp.getActive();
    var juz = props_().getProperty('most.archiwum');
    if (juz) {
      var odp = ui.alert(MENU_NAZWA,
        'Archiwum tego sezonu już utworzono:\n' + juz +
        '\n\nUtworzyć KOLEJNY snapshot (np. po zakończeniu fazy)?',
        ui.ButtonSet.YES_NO);
      if (odp !== ui.Button.YES) return;
    }
    var nowy = SpreadsheetApp.create('Most KTS — archiwum ' + SEZON_ETYKIETA);
    var zrodla = [];
    var ligi = wczytajLigi_();
    for (var i = 0; i < ligi.length; i++) zrodla.push(ligi[i].arkusz);
    zrodla.push(ARKUSZ_PZTS);
    zrodla.push(ARKUSZ_MECZE);
    zrodla.push(ARKUSZ_DRUZYNY);
    zrodla.push(ARKUSZ_ZAWODNICY);
    var skopiowano = [];
    for (var z = 0; z < zrodla.length; z++) {
      var zr = ss.getSheetByName(zrodla[z]);
      if (!zr || zr.getLastRow() === 0) continue;
      var szer = Math.max(zr.getLastColumn(), 1);
      var wart = zr.getRange(1, 1, zr.getLastRow(), szer).getValues();
      var cel = (skopiowano.length === 0) ? nowy.getSheets()[0] : nowy.insertSheet();
      cel.setName(String(zrodla[z]).substring(0, 90));
      cel.getRange(1, 1, wart.length, szer).setValues(wart);
      skopiowano.push(zrodla[z]);
    }
    // Log — 100 najnowszych wpisów (najnowsze na górze)
    var log = ss.getSheetByName(ARKUSZ_LOG);
    if (log && log.getLastRow() > 1) {
      var n = Math.min(log.getLastRow() - 1, 100);
      var ogon = log.getRange(2, 1, n, 5).getValues();
      var celLog = nowy.insertSheet('Log (ogon)');
      celLog.getRange(1, 1, n, 5).setValues(ogon);
    }
    props_().setProperty('most.archiwum', nowy.getUrl() + ' · ' + terazCzas_());
    dopiszLog_('Archiwizuj sezon', 0,
      'utworzono archiwum ' + SEZON_ETYKIETA + ' (' + skopiowano.join(', ') + ') — ' + nowy.getUrl(), null);
    ui.alert(MENU_NAZWA,
      'Archiwum sezonu ' + SEZON_ETYKIETA + ' utworzone.\n\n' +
      'Skopiowano (wartości): ' + skopiowano.join(', ') + '\n\n' +
      'Link: ' + nowy.getUrl() + '\n\n(link też w Logu)',
      ui.ButtonSet.OK);
  });
}

/** Szuka formuł IMPORT* (IMPORTHTML/IMPORTXML/…) we wszystkich zakładkach. */
function znajdzFormulyImport_() {
  var ss = SpreadsheetApp.getActive();
  var znalezione = [];   // [opis „zakładka!komórka”, formuła]
  var arkusze = ss.getSheets();
  for (var i = 0; i < arkusze.length; i++) {
    var ws = arkusze[i];
    if (ws.getLastRow() === 0) continue;
    var f = ws.getDataRange().getFormulas();
    for (var r = 0; r < f.length; r++) {
      for (var c = 0; c < f[r].length; c++) {
        var formula = String(f[r][c] || '');
        if (formula.indexOf('=IMPORT') === 0) {
          znalezione.push([ws.getName() + '!' + ws.getRange(r + 1, c + 1).getA1Notation(), formula]);
        }
      }
    }
  }
  return znalezione;
}

function zbudujStrukture_() {
  var ss = SpreadsheetApp.getActive();

  // — INFO —
  var info = arkusz_(ARKUSZ_INFO);
  info.clear();
  info.getRange(1, 1).setValue('MOST KTS → SLZTS · v' + MOST_WERSJA).setFontWeight('bold').setFontSize(14);
  info.getRange(2, 1).setValue('Skrypt pobiera tabele, terminarze i składy z ligi.slzts.pl jako WARTOŚCI — zero formuł IMPORT*, zero zbędnych zapytań.');
  info.getRange(4, 1).setValue('STATUS (aktualizowany automatycznie po każdym przebiegu)').setFontWeight('bold');
  var instrukcjeInfo = [
    ['OBSŁUGA — menu „' + MENU_NAZWA + '” (pasek menu arkusza, na końcu):'],
    ['· Pełne odświeżenie — wszystkie ligi + PZTS + składy natychmiast (hub best-effort na końcu)'],
    ['· Sprawdź wyniki teraz — ligi dzisiejszych meczów (lub wszystkie, gdy dziś brak) + PZTS'],
    ['· Przebuduj kalendarz — pełne przeładowanie terminarzy do „Mecze KTS”'],
    ['· Zainstaluj / napraw strukturę — zakładki + porządek (pyta o usunięcie zbędnych) + automatyzacja + pełne odświeżenie (START TUTAJ)'],
    ['· Zainstaluj automatyzację — trigger co 15 minut (Zarządca)'],
    ['· PZTS: testuj kanały — sprawdza pobieranie z pzts.pl (uruchom RAZ po instalacji v1.5.0)'],
    ['· Archiwizuj sezon — snapshot zakładek danych do osobnego skoroszytu (na koniec sezonu)'],
    [''],
    ['AUTOMAT: Patrol dzienny ok. 03:00 (tylko gdy mecz ≤7 dni lub zaległość) · Dyżur meczowy 15:00–00:30 (ligi dzisiejszych meczów, do wyników) · Dokończenie: zaległa liga/PZTS ponawiana co ~15 min (max 6/dzień) · poza tym 0 zapytań.'],
    ['PATROL PZTS (raz dziennie): przegląda tabele WSZYSTKICH lig centralnych PZTS (męskich i kobiecych) — wykrywa naszą drużynę w każdej z nich; rozróżnia ligi ŻYWE od archiwalnych (z zeszłego sezonu), sam przełącza adres ligi po zmianie sezonu i alarmuje, gdy ŻYWYCH lig z nami > 1.'],
    ['NASZE DRUŻYNY: nazwa od „KTS” kończąca się na „…Gliwice” (KTS, KTS II–VI, KTS KA Krokus VII Gliwice) LUB zawiera „Krokus” — działa identycznie dla ŚZTS i PZTS.'],
    ['DANE DLA STRONY KTS (v1.5): „Mecze KTS” = kalendarz CAŁEGO KLUBU (ŚZTS + PZTS — mecze PZTS mają skrót „1LM”) · „Drużyny” = rejestr (karta ↔ nazwa u źródła ↔ liga ↔ stan ↔ URL-e) · „Zawodnicy” = składy ze statystykami („Skuteczność” tylko PZTS) · „Liga …” i „PZTS 1LM” = tabele + terminarze.'],
    ['SKŁADY: odświeżane co ≥12 h — Patrol ok. 03:00 oraz raz po wieczornym komplecie wyników (statystyki zmieniają się po meczach); awaria podstrony = stare dane zostają. „Pełne odświeżenie” = natychmiast, bez limitu 12 h.'],
    ['NAPRAWA ZNAKÓW: serwer ŚZTS psuje litery ł/ą/ę/ś/ż/ź/ć/ń na „?” — nazwy drużyn (także przeciwników), nazwiska i narodowości naprawiane mapami (nazwiska zweryfikowane rejestrem licencji PZTS); PZTS podaje poprawne znaki. Nierozpoznane zostają z „?” i są wypisywane w „Log”.'],
    ['ZAKŁADKA „PULS” (v1.4.3): znacznik tyknięcia Zarządcy (co 15 min, z sekundami — v1.7.1) + statystyka czasów przebiegów z 24 h (v1.7.1) — czyta je strażnik świeżości po stronie czytnika strony; komórek nie edytować ręcznie.'],
    [''],
    ['ZABEZPIECZENIA (v1.4/v1.5):'],
    ['· Blokada nakładania się przebiegów (LockService) — drugi start w trakcie pierwszego jest pomijany.'],
    ['· Ochrona danych: zrzut podejrzanie ubogi (tabela <50% zapisanych wierszy / terminarz zniknął) NIE nadpisuje ostatniej dobrej wersji — działa też dla PZTS.'],
    ['· Izolacja źródeł: awaria PZTS NIE ubija pobierania ŚZTS (i odwrotnie) — jak w syncu strony.'],
    ['· Dzienny limit ' + LIMIT_ZAPYTAN + ' zapytań do ligi.slzts.pl + OSOBNY limit ' + LIMIT_ZAPYTAN_PZTS + ' zapytań do pzts.pl — po wyczerpaniu pauza do jutra.'],
    ['· E-mail po ' + PROG_SERII + ' nieudanych przebiegach z rzędu (max 1/dobę, do konta właściciela) — chroni przed cichą śmiercią mostu.'],
    [''],
    ['KONFIGURACJA LIG ŚZTS (edytowalna): „Cfg” · dziennik przebiegów: „Log” (limit ' + LOG_LIMIT_WIERSZY + ' wierszy) · PZTS: adresy w kodzie, nadpisywane automatycznie przez Patrol PZTS po zmianie sezonu · strefa czasowa logiki: ' + STREFA + '.']
  ];
  // v1.4.1: numRows liczone z tablicy (poprawka błędu „data 19 vs range 17/1”)
  info.getRange(12 + wczytajLigi_().length, 1, instrukcjeInfo.length, 1).setValues(instrukcjeInfo);
  info.setColumnWidth(1, 720);
  info.setFrozenRows(2);

  // — Cfg — (v1.3: ligi w wierszach 5–14, do 10; stary układ v1.1/v1.2
  //    z notatkami w wierszach 10–13 jest migrowany z zachowaniem lig)
  var cfg = arkusz_(ARKUSZ_CFG);
  var a4 = String(cfg.getRange(4, 1).getValue() || '').trim();
  var staryUkladCfg = a4 !== '' &&
    String(cfg.getRange(10, 1).getValue() || '').indexOf('Reguła') === 0;
  if (a4 === '' || staryUkladCfg) {
    var ligiCfg = (a4 !== '') ? wczytajLigi_() : [];   // migracja: ligi użytkownika
    if (ligiCfg.length === 0) ligiCfg = LIGI_DOMYSLNE.slice();
    cfg.clear();
    cfg.getRange(1, 1).setValue('KONFIGURACJA MOSTU (edytowalna — np. nowe adresy lig po zmianie sezonu)').setFontWeight('bold').setFontSize(12);
    cfg.getRange(2, 1).setValue('Ligi: wiersze 5–14 (do 10) — adresy zmieniasz tutaj, kod pozostaje bez zmian. Puste/popsute wiersze są pomijane (skrypt wraca do wbudowanych domyślnych).');
    cfg.getRange(4, 1, 1, 4).setValues([['Skrót', 'Nazwa ligi', 'Adres (ligi.slzts.pl)', 'Arkusz']])
      .setFontWeight('bold').setBackground(KOLOR_NAGLOWKA);
    var w = [];
    for (var i = 0; i < ligiCfg.length; i++) {
      var l = ligiCfg[i];
      w.push([l.skrot, l.nazwa, l.url, l.arkusz]);
    }
    cfg.getRange(5, 1, w.length, 4).setNumberFormat('@').setValues(w);
    var notatkiCfg = [
      ['Reguła naszych drużyn: nazwa od „KTS” kończąca się na „Gliwice” LUB zawierająca „Krokus” (wbudowana w kod).'],
      ['Harmonogram: trigger co 15 min · Patrol ok. 03:00 · Dyżur meczowy 15:00–00:30 · Dokończenie zaległości co ~15 min (max 6/dzień).'],
      ['v1.4 — składy „Zawodnicy”: co ≥12 h (Patrol + raz po wieczornym komplecie wyników); URL-e podstron drużyn zbierane automatycznie z tabel ligowych.'],
      ['v1.4 — zabezpieczenia: blokada równoległych przebiegów · ochrona przed nadpisaniem dobrych danych · limit ' + LIMIT_ZAPYTAN + ' zapytań/dobę · e-mail po ' + PROG_SERII + ' nieudanych przebiegach.'],
      ['v1.5.0 — PZTS: 1. drużyna (liga 1LM) w zakładce „PZTS 1LM”; adresy w kodzie, Patrol PZTS nadpisze je sam po zmianie sezonu; osobny limit ' + LIMIT_ZAPYTAN_PZTS + ' zapytań/dobę; awaria PZTS nie ubija ŚZTS.'],
      ['v1.5.3 — PZTS: naprawa PUNKTÓW par ex aequo (Pkt czytany ZA blokiem M/Z/R/P, gdy nieczytelny — punkty z bilansu 2·Z+R, każdy taki przypadek w Logu); encje HTML i znaki zero-width dekodowane; po wymianie wersji most sam odświeża tabelę PZTS.'],
      ['v1.5.2 — PZTS: tabela odporna na ex aequo (scala „Poz.” z rowspan/zakresy „2-3”); Patrol rozróżnia ligi ŻYWE od archiwalnych — auto-adopt tylko z żywej, alarm tylko przy ≥2 żywych.'],
      ['Godziny meczów KTS II (czwartki domowe): korekta źródła 19:15 → 19:00 (wbudowana, wygasa 12.02.2027).'],
      ['Porządek zakładek: „Zainstaluj / napraw strukturę” pyta o usunięcie zakładek spoza mostu (stary czytnik IMPORT*, relikty v1 — np. „STAN”).'],
      ['Strefa czasowa logiki: ' + STREFA + '.']
    ];
    cfg.getRange(16, 1, notatkiCfg.length, 1).setValues(notatkiCfg);  // v1.4.1: samoliczący zakres
    cfg.setColumnWidth(1, 70); cfg.setColumnWidth(2, 260); cfg.setColumnWidth(3, 340); cfg.setColumnWidth(4, 120);
  }
  CACHE_RUNU_ = null;   // v1.7.0: Cfg mógł zostać przepisany — ligi czytane świeżo

  // — Log (nagłówek założy się przy pierwszym wpisie) + zakładki lig —
  arkusz_(ARKUSZ_LOG);
  var ligi = wczytajLigi_();
  for (var j = 0; j < ligi.length; j++) arkusz_(ligi[j].arkusz);
  arkusz_(ARKUSZ_PZTS);              // v1.5.0 (wypełni się pierwszym przebiegiem)
  arkusz_(ARKUSZ_MECZE);
  arkusz_(ARKUSZ_DRUZYNY);          // v1.4
  arkusz_(ARKUSZ_ZAWODNICY);        // v1.4
  zbudujPuls_(arkusz_(ARKUSZ_PULS)); // v1.4.3 (v1.5.0: + wiersz zapytań PZTS)
}

/**
 * Instaluje/czyści triggery: usuwa martwe (po starych wersjach skryptu)
 * i zakłada świeży co 15 minut dla „Zarządca”.
 */
function zainstalujAutomatyzacje_(raportuj) {
  var FUNKCJE = {};
  for (var i = 0; i < FUNKCJE_AKTUALNE.length; i++) FUNKCJE[FUNKCJE_AKTUALNE[i]] = true;
  var usuniete = 0;
  var istniejace = ScriptApp.getProjectTriggers();
  for (var j = 0; j < istniejace.length; j++) {
    var t = istniejace[j];
    var h = t.getHandlerFunction();
    // usuwamy: nasz Zarządca (założymy świeży) oraz wszystko, czego już
    // nie ma w kodzie (martwe handlery po poprzednich wersjach skryptu)
    if (h === 'Zarzadca' || !FUNKCJE[h]) {
      ScriptApp.deleteTrigger(t);
      usuniete++;
    }
  }
  ScriptApp.newTrigger('Zarzadca').timeBased().everyMinutes(15).create();
  if (raportuj) {
    var ui = SpreadsheetApp.getUi();
    ui.alert(MENU_NAZWA, 'Automatyzacja zainstalowana.\n\n' +
      'Trigger „Zarządca” co 15 minut (aktywny od teraz).\n' +
      'Usunięte stare triggery: ' + usuniete + '.\n\n' +
      'Cisza = brak zapytań; Patrol ok. 03:00; Dyżur meczowy 15:00–00:30;\n' +
      'Dokończenie zaległości co ~15 min (max 6 rund dziennie);\n' +
      'składy „Zawodnicy” co ≥12 h (Patrol + po wieczornych wynikach).', ui.ButtonSet.OK);
  }
  return usuniete;
}

function zainstalujAutomatyzacje() {
  przyMenu_('Zainstaluj automatyzację', function () {
    zainstalujAutomatyzacje_(true);
    dopiszLog_('Zainstaluj automatyzację', 0, 'trigger co 15 min założony', null);
  });
}

function zainstalujStrukture() {
  przyMenu_('Zainstaluj / napraw strukturę', function () {
    var ui = SpreadsheetApp.getUi();

    // 1) zakładki + konfiguracja
    zbudujStrukture_();

    // 2) PORZĄDEK ZAKŁADEK (v1.3) — biała lista: INFO, Cfg, Log, Mecze KTS,
    //    Drużyny, Zawodnicy + zakładki ligowe z Cfg. Wszystko inne (stary
    //    czytnik IMPORT*: Hub, Slownik, Sondy, Ligi, Druzyny, Druzyna 1–12,
    //    Liga 1–9; relikty v1: „STAN”…) — po potwierdzeniu USUWANE.
    //    Formuły IMPORT* siedzące w nich znikają razem z zakładkami.
    var zbedne = arkuszeZbedne_();
    var usunietoZakladek = 0;
    if (zbedne.length > 0) {
      var nazwyUsuwane = [];
      for (var i = 0; i < zbedne.length; i++) nazwyUsuwane.push(zbedne[i].getName());
      var odpZakladki = ui.alert(MENU_NAZWA,
        'Znalazłem ' + zbedne.length + ' zakładek, których most NIE używa:\n' +
        nazwyUsuwane.join(', ') +
        '\n\nTo pozostałości starego czytnika (Hub, Sondy, Liga 1–9, Druzyna 1–12…) i/lub pierwszej wersji skryptu (m.in. „STAN”). ' +
        'Ich formuły IMPORT* co godzinę strzelają zapytaniami do ligi.slzts.pl — dokładnie to, przed czym most ma chronić.\n\n' +
        'USUNĄĆ je na stałe? (Ewentualne dane odzyskasz: Plik → Historia wersji.)',
        ui.ButtonSet.YES_NO);
      if (odpZakladki === ui.Button.YES) {
        var ss = SpreadsheetApp.getActive();
        for (var d = 0; d < zbedne.length; d++) {
          try { ss.deleteSheet(zbedne[d]); usunietoZakladek++; } catch (ed) {}
        }
        dopiszLog_('Porządek zakładek', 0,
          'usunięto ' + usunietoZakladek + ' z ' + zbedne.length + ': ' + nazwyUsuwane.join(', '), null);
      } else {
        dopiszLog_('Porządek zakładek', 0,
          'pozostawiono ' + zbedne.length + ' zbędnych (decyzja użytkownika): ' + nazwyUsuwane.join(', '), null);
        ui.alert(MENU_NAZWA,
          'Rozumiem — zostawiam wszystkie zakładki.\n\n' +
          'Pamiętaj: zbędne zakładki starego czytnika wciąż strzelają formułami IMPORT* do ligi.slzts.pl (≈44 zapytania na godzinę). ' +
          'STATUS w INFO będzie je wypisywał, dopóki ich nie usuniesz (możesz też ręcznie: prawy przycisk na zakładce → Usuń).',
          ui.ButtonSet.OK);
      }
    }

    // 3) stare formuły IMPORT* (jeśli zostały w zachowanych zakładkach)
    var formuly = znajdzFormulyImport_();
    var usunietoFormul = 0;
    if (formuly.length > 0) {
      var lista = [];
      for (var i2 = 0; i2 < Math.min(formuly.length, 8); i2++) lista.push(formuly[i2][0]);
      var odp = ui.alert(MENU_NAZWA,
        'Znalazłem ' + formuly.length + ' formuł IMPORT* (IMPORTHTML/IMPORTXML…):\n' +
        lista.join('\n') + (formuly.length > 8 ? '\n…' : '') +
        '\n\nOne same odświeżają się co godzinę i strzelają zapytaniami do ligi.slzts.pl —' +
        ' dokładnie to, przed czym ma chronić ten most.\n\nZamienić je na wartości (zatrzymać)?',
        ui.ButtonSet.YES_NO);
      if (odp === ui.Button.YES) {
        var ss2 = SpreadsheetApp.getActive();
        for (var f = 0; f < formuly.length; f++) {
          var czesci = formuly[f][0].split('!');
          var ws = ss2.getSheetByName(czesci[0]);
          if (ws) {
            var kom = ws.getRange(czesci[1]);
            kom.setValue(kom.getDisplayValue());   // wartość zamiast formuły
            usunietoFormul++;
          }
        }
      }
    }
    if (usunietoFormul > 0) {
      props_().setProperty('most.formulyImport', 'zamieniono ' + usunietoFormul + ' formuł IMPORT* na wartości');
    } else if (formuly.length > 0) {
      props_().setProperty('most.formulyImport', 'pozostawiono ' + formuly.length + ' formuł IMPORT* (decyzja użytkownika) — nadal strzelają do ŚZTS!');
    } else {
      props_().deleteProperty('most.formulyImport');
    }

    // 4) automatyzacja (trigger) — przy okazji czyści martwe triggery po v1/v1.1
    zainstalujAutomatyzacje_(false);

    // 5) pełne odświeżenie — DANE OD RAZU (ligi + PZTS + Drużyny +
    //    Zawodnicy); liga, której źródło nie da pobrać, dostanie czerwoną
    //    kartkę i Dokończenie ją dogoni (~15 min)
    wykonajOdswiezenie_('Zainstaluj / napraw strukturę', wczytajLigi_(), true, true, true);
  });
}
