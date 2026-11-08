// ==UserScript==
// @name         Reply-tabi kuplan reunaan (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.6.0
// @description  Puhekuplan reply-nappi (.chat-reply-button) kuplan oikeaan reunaan kiinnittyväksi tabiksi, sama ↩-merkki. Hover leventää kuplaa (tabi kuplan SISÄLLÄ) ja siirtää päälle osuvat naapurikuplat sivuun. kp 8.11. 02:20-02:23
// @author       re-lab
// ==/UserScript==

// kp 02:20 "puhekuplissa olis tällanen lisäväkänen oik reunas mist vois replyy. nykyisen ulkopuolisen napin sijaan"
//   · 02:22 "ei tarvii värei kopsaa. lähinnä tota muotoo" · "ton nuolen tilalla vois olla tollanen tai saman kaltanen nuoli siin väkäsessä"
//   · 02:23 "kupla levenee vähän kun hoveraa ja väkänen tulee esiin -> tarvittaessa siirtää viereistä kuplaa ettei overlap".
// Clientin oma nappi (ChatWidgetMessageView.tsx, .chat-reply-button, ChatWidgetView.scss:1219) on kuplan ulkopuolella
// (right:-25px, 21x21). Tämä: hover kasvattaa .chat-content-paddingia LEVEYS px (kupla itse levenee), nappi istuu sen
// tilaan kuplan sisälle reunasta 4 px kuplan korkuisena tabina (kp 02:35 'piti olla kuplan sisällä'),
// ja oikealla puolella päälle osuvat kuplat siirtyvät CSS `translate`-ominaisuudella (ei kosketa clientin left/top-arvoja).
// Näkyvyys (hover) ja klikkaus pysyvät clientin omina.
(() => {
  'use strict';
  // 1.6.0: merkit data-attribuutteina, ei luokkina — React kirjoittaa bubble-containerin className:n uudelleen kun reply
  // aloitetaan (reply-target), ja luokka katosi: kupla jäi leveäksi ilman varjostusta (kp 03:06 'miks käy näin').
  const VERSIO = '1.6.0';
  const LEVEYS = 16;
  const VARJO = LEVEYS + 5; // varjostettu kaista kuplan ulkoreunasta: lisätty tila + osa kuplan 6 px oikeaa reunakuvaa
  if (window.__kuplaReplyTabi && typeof window.__kuplaReplyTabi.pois === 'function') { try { window.__kuplaReplyTabi.pois(); } catch (e) {} }

  const tyyli = document.createElement('style');
  tyyli.id = 'kp-reply-tabi';
  tyyli.textContent = `
    .nitro-chat-widget .bubble-container[data-kp-rt-auki] .chat-content { padding-right: ${6 + LEVEYS}px !important; }
    /* kp 02:56 + 02:59: ei omaa muotoa ("boxy"). Varjostus piirretään kuplan päälle maskilla, joka on kuplan OMA
       border-image (sama kuva, slice, width, outset), joten se seuraa kuplan reunaa ja pyöristyksiä ylhäältä alas.
       Divider = gradientin 1 px kova raja. Nappi itse on läpinäkyvä klikkialue + nuoli. */
    .nitro-chat-widget .bubble-container[data-kp-rt-auki] .chat-bubble::after {
      content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
      background: linear-gradient(to right, transparent calc(100% - ${VARJO}px), rgba(0,0,0,.4) calc(100% - ${VARJO}px),
        rgba(0,0,0,.4) calc(100% - ${VARJO - 1}px), rgba(0,0,0,.13) calc(100% - ${VARJO - 1}px));
      -webkit-mask-box-image-source: var(--kp-rt-src); -webkit-mask-box-image-slice: var(--kp-rt-slice);
      -webkit-mask-box-image-width: var(--kp-rt-w); -webkit-mask-box-image-outset: var(--kp-rt-out);
      -webkit-mask-box-image-repeat: stretch;
    }
    .nitro-chat-widget .bubble-container[data-kp-rt-auki] .chat-bubble:has(~ .chat-reply-button:hover)::after,
    .nitro-chat-widget .bubble-container[data-kp-rt-auki]:has(.chat-reply-button:hover) .chat-bubble::after {
      background: linear-gradient(to right, transparent calc(100% - ${VARJO}px), rgba(0,0,0,.45) calc(100% - ${VARJO}px),
        rgba(0,0,0,.45) calc(100% - ${VARJO - 1}px), rgba(0,0,0,.25) calc(100% - ${VARJO - 1}px));
    }
    .nitro-chat-widget .bubble-container .chat-reply-button {
      top: 0 !important; bottom: 0 !important; height: auto !important; transform: none !important;
      right: 0 !important; width: ${VARJO}px !important; min-width: 0 !important; max-width: none !important;
      padding: 0 3px 0 0 !important; box-sizing: border-box !important; border: 0 !important; border-radius: 0 !important;
      background: transparent !important; color: #111 !important; font-size: 12px !important; font-weight: bold !important;
    }
    .nitro-chat-widget .bubble-container .chat-reply-button:hover { background: transparent !important; }
    .nitro-chat-widget .bubble-container .chat-reply-button::before { inset: 0 !important; }
    .nitro-chat-widget .bubble-container[data-kp-rt-siirretty] { transition: translate .08s ease-out; }
  `;
  document.head.appendChild(tyyli);

  let auki = null;
  let leveys = null; // [chat-bubble, alkuperäinen inline max-width]
  let siirretyt = [];

  const palauta = () => {
    for (const e of siirretyt) { e.style.translate = ''; e.removeAttribute('data-kp-rt-siirretty'); }
    siirretyt = [];
    if (leveys) { leveys[0].style.maxWidth = leveys[1]; leveys = null; }
    if (auki) auki.removeAttribute('data-kp-rt-auki');
    auki = null;
  };

  // Siirrä oikealla puolella pystysuunnassa päällekkäin osuvat kuplat. Ketjuttaa: siirretty kupla voi työntää seuraavaa.
  const tyonna = kupla => {
    const kaikki = [...kupla.parentElement.querySelectorAll(':scope > .bubble-container')].filter(e => e !== kupla);
    const esteet = [kupla.getBoundingClientRect()];
    const ehdokkaat = kaikki.map(e => ({ e, r: e.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left);
    for (const { e, r } of ehdokkaat) {
      let dx = 0;
      for (const s of esteet) {
        const pysty = r.top < s.bottom - 1 && r.bottom > s.top + 1;
        const vaaka = r.left + dx < s.right && r.right + dx > s.left;
        if (pysty && vaaka && r.left >= s.left) dx = Math.max(dx, s.right - r.left + 1);
      }
      if (dx > 0) {
        e.setAttribute('data-kp-rt-siirretty', '');
        e.style.translate = `${Math.ceil(dx)}px 0`;
        siirretyt.push(e);
        esteet.push({ left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom });
      }
    }
  };

  const yli = ev => {
    const kupla = ev.target.closest && ev.target.closest('.nitro-chat-widget > .bubble-container');
    if (kupla === auki) return;
    palauta();
    if (!kupla || !kupla.querySelector(':scope > .chat-reply-button')) return;
    auki = kupla;
    // kp 02:52 'et saa viedä tilaa tekstiltä': max-width kasvaa saman verran kuin padding, joten teksti rivittyy kuten ennen
    const kpl = kupla.querySelector(':scope > .chat-bubble');
    if (kpl) {
      const c = getComputedStyle(kpl);
      kpl.style.setProperty('--kp-rt-src', c.borderImageSource); kpl.style.setProperty('--kp-rt-slice', c.borderImageSlice);
      kpl.style.setProperty('--kp-rt-w', c.borderImageWidth); kpl.style.setProperty('--kp-rt-out', c.borderImageOutset);
    }
    if (kpl && kpl.style.maxWidth) { leveys = [kpl, kpl.style.maxWidth]; kpl.style.maxWidth = (parseFloat(kpl.style.maxWidth) + LEVEYS) + 'px'; }
    kupla.setAttribute('data-kp-rt-auki', '');
    tyonna(kupla);
  };
  const ulos = ev => { if (auki && !(ev.relatedTarget && auki.contains(ev.relatedTarget))) palauta(); };

  document.addEventListener('mouseover', yli, true);
  document.addEventListener('mouseout', ulos, true);

  window.__kuplaReplyTabi = { versio: VERSIO, pois() {
    document.removeEventListener('mouseover', yli, true);
    document.removeEventListener('mouseout', ulos, true);
    palauta(); tyyli.remove(); delete window.__kuplaReplyTabi;
  } };
})();
