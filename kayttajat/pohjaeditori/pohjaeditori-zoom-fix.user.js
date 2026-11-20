// ==UserScript==
// @name         Kupla Pohjaeditori-zoom-korjaus
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-start
// @grant        none
// @version      1.0.0
// @description  Väliaikainen korjaus (B331): huonepohjaeditori valitsee sen ruudun jonka päällä hiiri on myös kun UI-zoom (Ctrl+rulla / automaattinen 1,25) on päällä. Poista kun pelin oma korjaus on livenä.
// @kupla-oletus on
// @author       re-lab
// ==/UserScript==
//
// kp 2026-11-20 19:37 "huone-editorin tile selector valitsee ihan eri kohdan tilen mihin hiiri osuu. Bugi toistuu mulla ja sonalle".
// SYY (live caace756, DarkUI): FloorplanEditor.ts:62 ja :73 laskevat ruudun `event.offsetX/offsetY`:stä canvas-pikseleinä. UI-zoom
//   (UiZoom.scss, 6.11.) antaa ikkunan sisällölle CSS `zoom`:n, ja Chrome 153 palauttaa offsetX:n ZOOMATTUINA pikseleinä.
//   Mitattu 20.11. tyhjällä välilehdellä: zoom 1,25, klikki 275 px canvasin reunasta -> offsetX 275, oikea canvas-px 220 (ero 55 px,
//   ruutu on 32 px leveä). Zoom 1: ero 0. Virhe kasvaa etäisyyden mukana: offset * (1 - 1/zoom).
// KORJAUS: window-tason capture-kuuntelija ajetaan ennen editorin omaa kuuntelijaa ja korvaa saman tapahtumaolion offsetX/offsetY
//   arvolla (client - rect.left) * canvas.width / rect.width. Toimii millä tahansa zoomilla ja myös ilman zoomia (silloin arvo = vanha).
(() => {
  'use strict';
  const VW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (VW.__kuplaPohjaeditoriZoomFix) return; VW.__kuplaPohjaeditoriZoomFix = true;
  let korjattu = 0;
  const korjaa = e => {
    const c = e.target;
    if (!(c instanceof HTMLCanvasElement) || !c.closest || !c.closest('.nitro-floorplan-editor') || VW.__kuplaPohjaeditoriZoomPois) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
    try { Object.defineProperty(e, 'offsetX', { value: x, configurable: true }); Object.defineProperty(e, 'offsetY', { value: y, configurable: true }); korjattu++; } catch (err) {}
  };
  for (const t of ['pointerdown', 'pointermove']) VW.addEventListener(t, korjaa, true);
  VW.__kuplaPohjaeditoriZoomTila = () => ({ korjattu });
})();
