/* js/kontakt-stopki.js — 1.26.3: ADRES W STOPCE → DOMYŚLNA APLIKACJA DO
   NAWIGACJI (właściciel 03.11 wieczór: „kliknięcie w adres powoduje
   otwarcie domyślnej aplikacji służącej do nawigacji, np google maps").
   Telefon (tel:) i e-mail (mailto:) obsługują to systemy natywnie — bez
   JS. 1.26.4 (właściciel 04.11: „na androidzie kliknięcie w adres
   nie odpala google maps, tylko jakiś dialog z resolver app”):
   geo: zostało ZUPEŁNIE porzucone — schemat geo: obsługuje wiele apek
   (Google Maps, CoMaps, OsmAnd…), więc Android pokazywał systemowy
   dialog wyboru aplikacji zamiast od razu otwierać mapy. Teraz:
   • iPhone   → data-maps-apple = https://maps.apple.com/?q=… (Mapy Apple,
     domyślna apka nawigacji iOS; geo: na iOS bywa podchwytywane przez
     inne apki, np. Google Earth — badanie 07.2025),
   • Android  → href z HTML   = https://www.google.com/maps/search/?api=1&query=…
     (URL Google Maps to App Link — Chrome otwiera nim APKĘ Google Maps
     wprost, bez wybierania; gdyby apki nie było, otwiera wersję webową;
     to oficjalny, udokumentowany uniwersalny format „Maps URLs”),
   • desktop  → ten sam href (mapa w przeglądarce; działa też bez JS,
     przy „kopiuj link” i jako spójny fallback dla wszystkiego, czego
     nie znamy).
   JS przechwytuje więc tylko iPhone; Android i desktop idą po href
   natywnie. Delegacja zdarzeń na dokumencie — jeden plik obsługujący
   stopkę WSZYSTKICH 4 stron (index, galeria, archiwum, drużyna). */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.footer-adres') : null;
    if (!a) return;
    var url = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? a.getAttribute('data-maps-apple')
      : null;
    if (url) { e.preventDefault(); window.location.href = url; }
  });
})();
