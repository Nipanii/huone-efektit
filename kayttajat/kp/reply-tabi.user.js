// ==UserScript==
// @name         Reply-tabi kuplan reunaan (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.8.0
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
  // 1.7.0: tumma kupla -> vaalea nuoli ja vaalea varjostus (kp 03:08 'jos on tumma kupla niin toi reply icon hukkuu').
  // Kuplan väri luetaan sen omasta border-image-kuvasta (data:-PNG, sama origin) keskipikselistä canvasilla.
  const VERSIO = '1.8.0';
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
      content: ''; position: absolute; pointer-events: none; z-index: 1;
      /* kp 03:19 'muutaman pikselin gap' ylhäällä: kuplan kuva ulottuu border-image-outsetin verran laatikon yli
         (useimmissa 2px 0 0), ja gradientti piirtyy vain omaan laatikkoonsa -> laatikko itse kasvatetaan outsetilla */
      top: calc(-1 * var(--kp-rt-ot, 0px)); right: calc(-1 * var(--kp-rt-or, 0px));
      bottom: calc(-1 * var(--kp-rt-ob, 0px)); left: calc(-1 * var(--kp-rt-ol, 0px));
      background: linear-gradient(to right, transparent calc(100% - ${VARJO}px), rgba(0,0,0,.4) calc(100% - ${VARJO}px),
        rgba(0,0,0,.4) calc(100% - ${VARJO - 1}px), rgba(0,0,0,.13) calc(100% - ${VARJO - 1}px));
      -webkit-mask-box-image-source: var(--kp-rt-src); -webkit-mask-box-image-slice: var(--kp-rt-slice);
      -webkit-mask-box-image-width: var(--kp-rt-w); -webkit-mask-box-image-outset: 0;
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
    .nitro-chat-widget .bubble-container[data-kp-rt-tumma] .chat-reply-button { color: #f4f4f4 !important; }
    .nitro-chat-widget .bubble-container[data-kp-rt-auki][data-kp-rt-tumma] .chat-bubble::after {
      background: linear-gradient(to right, transparent calc(100% - ${VARJO}px), rgba(255,255,255,.5) calc(100% - ${VARJO}px),
        rgba(255,255,255,.5) calc(100% - ${VARJO - 1}px), rgba(255,255,255,.16) calc(100% - ${VARJO - 1}px));
    }
    .nitro-chat-widget .bubble-container[data-kp-rt-auki][data-kp-rt-tumma]:has(.chat-reply-button:hover) .chat-bubble::after {
      background: linear-gradient(to right, transparent calc(100% - ${VARJO}px), rgba(255,255,255,.55) calc(100% - ${VARJO}px),
        rgba(255,255,255,.55) calc(100% - ${VARJO - 1}px), rgba(255,255,255,.28) calc(100% - ${VARJO - 1}px));
    }
    .nitro-chat-widget .bubble-container[data-kp-rt-siirretty] { transition: translate .08s ease-out; }
  `;
  document.head.appendChild(tyyli);

  // src -> true (tumma) / false (vaalea) / Promise (luetaan). Kuvia on muutama kymmenen kuplatyyppiä, joten välimuisti riittää.
  const tummuus = new Map();
  const lueTummuus = (src, slice) => {
    if (tummuus.has(src)) return tummuus.get(src);
    const m = /url\("?(data:[^")]+)"?\)/.exec(src || '');
    if (!m) { tummuus.set(src, false); return false; }
    const p = new Promise(ok => {
      const img = new Image();
      img.onload = () => {
        try {
          // CSS-lyhenne: 1-4 arvoa (ylä, oikea, ala, vasen)
          const v = (String(slice).match(/[\d.]+/g) || ['0']).map(Number);
          const t = v[0], r = v[1] ?? t, b = v[2] ?? t, l = v[3] ?? r;
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
          // fill-alue = slicejen sisäpuoli; luetaan sen keskeltä 3x3 ja ohitetaan läpinäkyvät
          const x = Math.round((l + img.width - r) / 2), y = Math.round((t + img.height - b) / 2);
          const d = g.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data;
          let sum = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
          const tumma = n > 0 && sum / n < 110;
          tummuus.set(src, tumma); ok(tumma);
        } catch (e) { console.warn('[reply-tabi] kuplan väriä ei voitu lukea', e); tummuus.set(src, false); ok(false); }
      };
      img.onerror = () => { tummuus.set(src, false); ok(false); };
      img.src = m[1];
    });
    tummuus.set(src, p); return p;
  };
  const merkitseTumma = (kupla, src, slice) => {
    const v = lueTummuus(src, slice);
    const aseta = t => { if (t) kupla.setAttribute('data-kp-rt-tumma', ''); else kupla.removeAttribute('data-kp-rt-tumma'); };
    if (v instanceof Promise) v.then(aseta); else aseta(v);
  };

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
      kpl.style.setProperty('--kp-rt-w', c.borderImageWidth); { // outset: 1-4 arvoa; px sellaisenaan, yksikötön = border-image-widthin kerroin
        const o = (c.borderImageOutset.match(/[\d.]+(px)?/g) || ['0']), bw = c.borderImageWidth.match(/[\d.]+/g) || ['0'];
        const px = (v, i) => v.endsWith('px') ? parseFloat(v) : parseFloat(v) * parseFloat(bw[i] ?? bw[i % 2] ?? bw[0]);
        const t = o[0], r = o[1] ?? t, b = o[2] ?? t, l = o[3] ?? r;
        [['ot', t], ['or', r], ['ob', b], ['ol', l]].forEach(([k, v], i) => kpl.style.setProperty('--kp-rt-' + k, px(v, i) + 'px'));
      }
      merkitseTumma(kupla, c.borderImageSource, c.borderImageSlice);
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
