// ==UserScript==
// @name         Reply-tabi kuplan reunaan (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.1.0
// @description  Puhekuplan reply-nappi (.chat-reply-button) kuplan oikeaan reunaan kiinnittyväksi tabiksi, sama ↩-merkki. Hover leventää kuplaa ja siirtää päälle osuvat naapurikuplat sivuun. kp 8.11. 02:20-02:23
// @author       re-lab
// ==/UserScript==

// kp 02:20 "puhekuplissa olis tällanen lisäväkänen oik reunas mist vois replyy. nykyisen ulkopuolisen napin sijaan"
//   · 02:22 "ei tarvii värei kopsaa. lähinnä tota muotoo" · "ton nuolen tilalla vois olla tollanen tai saman kaltanen nuoli siin väkäsessä"
//   · 02:23 "kupla levenee vähän kun hoveraa ja väkänen tulee esiin -> tarvittaessa siirtää viereistä kuplaa ettei overlap".
// Clientin oma nappi (ChatWidgetMessageView.tsx, .chat-reply-button, ChatWidgetView.scss:1219) on kuplan ulkopuolella
// (right:-25px, 21x21). Tämä: hover lisää kuplaan LEVEYS px oikealle, nappi istuu siihen tilaan kuplan korkuisena tabina,
// ja oikealla puolella päälle osuvat kuplat siirtyvät CSS `translate`-ominaisuudella (ei kosketa clientin left/top-arvoja).
// Näkyvyys (hover) ja klikkaus pysyvät clientin omina.
(() => {
  'use strict';
  const VERSIO = '1.1.0';
  const LEVEYS = 16;
  if (window.__kuplaReplyTabi && typeof window.__kuplaReplyTabi.pois === 'function') { try { window.__kuplaReplyTabi.pois(); } catch (e) {} }

  const tyyli = document.createElement('style');
  tyyli.id = 'kp-reply-tabi';
  tyyli.textContent = `
    .nitro-chat-widget .bubble-container.kp-rt-auki { padding-right: ${LEVEYS}px; }
    .nitro-chat-widget .bubble-container .chat-reply-button {
      top: 2px !important; bottom: 2px !important; height: auto !important; transform: none !important;
      right: 0 !important; width: ${LEVEYS + 1}px !important; min-width: 0 !important; max-width: none !important; padding: 0 !important; box-sizing: border-box !important;
      border-radius: 0 8px 8px 0 !important; font-size: 11px !important;
    }
    .nitro-chat-widget .bubble-container .chat-reply-button::before { top: -2px !important; bottom: -2px !important; left: -4px !important; right: -4px !important; }
    .nitro-chat-widget .bubble-container.kp-rt-siirretty { transition: translate .08s ease-out; }
  `;
  document.head.appendChild(tyyli);

  let auki = null;
  let siirretyt = [];

  const palauta = () => {
    for (const e of siirretyt) { e.style.translate = ''; e.classList.remove('kp-rt-siirretty'); }
    siirretyt = [];
    if (auki) auki.classList.remove('kp-rt-auki');
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
        e.classList.add('kp-rt-siirretty');
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
    kupla.classList.add('kp-rt-auki');
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
