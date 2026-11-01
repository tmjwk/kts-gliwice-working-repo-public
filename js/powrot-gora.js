/* ============================================================
   KTS Gliwice — PRZYCISK POWROTU NA GÓRĘ (1.17.1)

   Prośba właściciela (02.11): „każda strona powinna mieć przycisk
   powrotu do góry strony, który pojawia się gdy przewija się stronę
   w dół — aby nie trzeba było skrollować z powrotem do góry".

   Wspólny, samowystarczalny moduł podpinany na WSZYSTKICH stronach
   (index, galeria, archiwum, druzyna) — zero zależności od app.js /
   galeria.js. Bez Gutenbergów: sam buduje przycisk, sam go pokazuje
   i chowa.

   ZASADY:
   - pojawia się po zescrollowaniu ~0,9 wysokości ekranu w dół
     (krótsze niż ekran strony nigdy go nie pokażą — nie ma po co);
   - klik = natychmiastowy powrót na górę (płynnie; przy syste-
     mowym „reduce motion” — skok);
   - ukrywa się przy górze oraz gdy otwarte jest pełnoekranowe
     przykrycie (lightbox galerii ustawia body overflow:hidden —
     wtedy przycisk znika, żeby nie wchodził w obraz); natywny
     <dialog> aktualności i tak przykrywa go warstwą top-layer;
   - z-index 45: NAD przyklejonym nagłówkiem (40), POD toastem
     danych (50) i lightboxem (60) — toast na wąskim ekranie
     przykrywa przycisk (czytelność komunikatu ważniejsza);
   - ukryty przycisk wypada z kolei tabulacji (tabindex=-1
     + aria-hidden) — klawiatura nie trafia w niewidoczny element.
   ============================================================ */
"use strict";

(function () {
  /* podwójne podpięcie (skrypt na stronie dwa razy?) — nic nie robić */
  if (window.__KTS_POWROT_GORA) return;
  window.__KTS_POWROT_GORA = true;

  const IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
    + ' aria-hidden="true" focusable="false"><path d="M5 14.5 12 7.5l7 7"/></svg>';

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "przycisk-gora";
  btn.id = "przycisk-gora";
  btn.setAttribute("aria-label", "Wróć na początek strony");
  btn.title = "Wróć na początek strony";
  btn.innerHTML = IKONA;

  const zmien = (widoczny) => {
    btn.classList.toggle("widoczny", widoczny);
    if (widoczny) {
      btn.removeAttribute("tabindex");
      btn.removeAttribute("aria-hidden");
    } else {
      btn.tabIndex = -1;
      btn.setAttribute("aria-hidden", "true");
    }
  };

  /* ~0,9 ekranu w dół = przycisk ma sens; wyżej — gość i tak blisko */
  const prog = () => Math.round(window.innerHeight * 0.9);

  const odswiez = () => {
    /* lightbox/overlay: body ma zablokowany scroll → chowamy */
    if (document.body.style.overflow === "hidden") { zmien(false); return; }
    zmien(window.scrollY > prog());
  };

  btn.addEventListener("click", () => {
    const lekki = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: lekki ? "instant" : "smooth" });
    } catch {
      window.scrollTo(0, 0);   // starsze przeglądarki: bez opcji
    }
    btn.blur();                // fokus wraca do strony (Enter nie odpali ponownie)
  });

  window.addEventListener("scroll", odswiez, { passive: true });
  window.addEventListener("resize", odswiez, { passive: true });
  window.addEventListener("pageshow", odswiez);

  /* otwarcie/zamknięcie lightboxa NIE wywołuje zdarzenia scroll, a
     zmienia body overflow (ukrycie/przywrócenie scrolla strony) —
     obserwator stylu body wyłapie każdy overlay, który tak działa */
  if (typeof MutationObserver === "function") {
    new MutationObserver(odswiez)
      .observe(document.body, { attributes: true, attributeFilter: ["style"] });
  }

  const podepnij = () => {
    document.body.appendChild(btn);
    zmien(false);
    odswiez();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", podepnij);
  } else {
    podepnij();
  }
})();
