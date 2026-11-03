/* js/kontakt-stopki.js — 1.26.3: ADRES W STOPCE → DOMYŚLNA APLIKACJA DO
   NAWIGACJI (właściciel 03.11 wieczór: „kliknięcie w adres powoduje
   otwarcie domyślnej aplikacji służącej do nawigacji, np google maps").
   Telefon (tel:) i e-mail (mailto:) obsługują to systemy natywnie — bez
   JS. Sam ADRES nie ma jednego uniwersalnego schematu, więc klik jest
   kierowany wg platformy (cel w atrybutach data-*, żeby adres żył
   w HTML — jak „drużyna = wiersz danych"):
   • Android  → data-geo      = geo:0,0?q=… (systemowy wybór/domyślna
     apka map: Google Maps, CoMaps, OsmAnd… — geo:0,0?q= to udokumentowany
     format wyszukiwania adresu),
   • iPhone   → data-maps-apple = https://maps.apple.com/?q=… (Mapy Apple,
     domyślna apka nawigacji iOS; geo: na iOS bywa podchwytywane przez
     inne apki, np. Google Earth — badanie 07.2025),
   • desktop  → href z HTML   = https://www.google.com/maps/search/?api=1&query=…
     (mapa w przeglądarce; działa też bez JS, przy „kopiuj link” i jako
     spójny fallback dla wszystkiego, czego nie znamy).
   Delegacja zdarzeń na dokumencie — jeden plik obsługujący stopkę
   WSZYSTKICH 4 stron (index, galeria, archiwum, drużyna). */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.footer-adres') : null;
    if (!a) return;
    var ua = navigator.userAgent;
    var url = /Android/i.test(ua) ? a.getAttribute('data-geo')
      : /iPhone|iPad|iPod/i.test(ua) ? a.getAttribute('data-maps-apple')
      : null;
    if (url) { e.preventDefault(); window.location.href = url; }
  });
})();
