// HUONESKRIPTI huoneelle 424 (kp 6.11. 23:02 "jaa se huonescriptinä et shorp voi kokeil"): sama koodi kuin kayttajat/ui-zoom/ui-zoom.user.js 0.1.0,
//   moottori ajaa new Function(kupla, koodi) ja kutsuu paluuarvoa huoneesta lähtiessä (pois: UI takaisin 1:een, taso jää localStorageen).
//   Jos kp:n oma userscript on jo ajossa (VW.kuplaUiZoom), tämä ei tee mitään.

  'use strict';
  const VW = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  if (VW.kuplaUiZoom) return () => {};   // jo ajossa (loader tai kp:n oma)
  const VERSIO = '0.1.0';
  const AVAIN = 'kupla.uiZoom', TYYLI_ID = 'kupla-ui-zoom-tyyli', MUUTTUJA = '--kupla-ui-zoom';
  const MIN = 0.5, MAX = 2.5, ASKEL = 0.1;
  const RAJAUS = x => Math.min(MAX, Math.max(MIN, Math.round(x * 100) / 100));
  const PUU = 'main.nitro-client > div > div > ';
  const HUD = '--hud-toolbar-height';
  const SAANTO = [PUU + '.nitro-toolbar', PUU + '.side-toolbar', PUU + '.side-toolbar-upside', PUU + '.nitro-left-side', PUU + '.nitro-right-side',
    PUU + '.mobile-friend-bar-container', PUU + '.wired-menu-root', '#draggable-windows-container > .draggable-window > *'].join(',\n') + ' { zoom: var(' + MUUTTUJA + '); }\n' +
    // ToolbarView.tsx:50 mittaa toolbarin getBoundingClientRect().height (zoomattu) -> --hud-toolbar-height (main) ja ToolbarView.scss:32 antaa sen takaisin toolbarin
    //   height:ksi, jonka zoom kertoo uudestaan -> ResizeObserver mittaa uudestaan: eksponentiaalinen kasvu (mitattu 1.5: 1452 px, 2.5: 129 700 px, jäi jumiin zoomin poistonkin jälkeen).
    //   Jaetaan zoomilla: mitattu = var -> kiintopiste. Pohjakorkeus = tyylitiedoston --hud-toolbar-height (.nitro-client, 85 px); tason vaihtuessa var asetetaan arvoon pohja * taso (ks. hudAseta).
    PUU + '.nitro-toolbar { height: calc(var(' + HUD + ', 85px) / var(' + MUUTTUJA + ')); }';

  let taso = 1; try { const v = parseFloat(VW.localStorage.getItem(AVAIN)); if (isFinite(v)) taso = RAJAUS(v); } catch (e) {}
  let kerty = 0, toast = null, toastT = 0, eloss = true;

  // --hud-toolbar-height on "viimeksi mitattu" -kiintopiste (ei koskaan pienene itsestään; tyylitiedosto antaa pohjaksi 85 px, .nitro-client): tason vaihtuessa inline-arvo
  //   korvataan arvolla pohja * kerroin, jolloin toolbar on heti oikean korkuinen eikä jää edellisen tason korkeuteen. Kerroin 1 = sama arvo jonka ToolbarView asettaisi itse.
  const hudAseta = kerroin => { try { const m = document.querySelector('main.nitro-client'); if (!m) return; m.style.removeProperty(HUD);
    m.style.setProperty(HUD, (parseFloat(getComputedStyle(m).getPropertyValue(HUD)) || 85) * kerroin + 'px'); } catch (e) {} };
  function tyyli() {
    const juuri = document.documentElement; let el = document.getElementById(TYYLI_ID);
    if (taso === 1) { if (el) { el.remove(); hudAseta(1); } juuri.style.removeProperty(MUUTTUJA); return; }   // ei tyylielementtiä = ei mitään palautettavaa
    if (!el) { el = document.createElement('style'); el.id = TYYLI_ID; el.textContent = SAANTO; (document.head || juuri).appendChild(el); }
    juuri.style.setProperty(MUUTTUJA, String(taso)); hudAseta(taso);
  }
  function ilmoita() {
    if (!eloss || !document.body) return;
    if (!toast || !toast.isConnected) { toast = document.createElement('div'); toast.id = 'kupla-ui-zoom-toast';
      toast.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99999;background:rgba(20,25,30,.95);color:#fff;padding:6px 12px;border-radius:6px;font:13px sans-serif;pointer-events:none';
      document.body.appendChild(toast); }
    toast.textContent = 'UI-zoom ' + Math.round(taso * 100) + ' %';
    clearTimeout(toastT); toastT = setTimeout(() => { if (toast) toast.remove(); toast = null; }, 1200);
  }
  function aseta(n) {
    let v = typeof n === 'string' ? parseFloat(n) / (/%\s*$/.test(n) ? 100 : 1) : Number(n);
    if (!isFinite(v)) return taso;
    taso = RAJAUS(v); try { VW.localStorage.setItem(AVAIN, String(taso)); } catch (e) {}
    tyyli(); ilmoita(); return taso;
  }
  const portaita = ylos => aseta(taso + (ylos ? ASKEL : -ASKEL));

  // Ctrl+rulla: pelicanvaksen päällä ei kosketa (ctrl-rulla-zoom.js hoitaa), muualla UI-zoom + preventDefault (estää selainzoomin).
  function rulla(e) {
    if (!eloss || !e.ctrlKey || !e.deltaY || e.target instanceof HTMLCanvasElement) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    kerty = (Math.sign(kerty) === Math.sign(d) ? kerty : 0) + d;
    if (Math.abs(kerty) < 50) return;
    kerty = 0; portaita(d < 0);
  }
  // Ctrl + '+' / '=' / '-' / '_' / '0' (myös numeronäppäimistö, jossa key on '+', '-', '0'). Alt/Meta mukana = ei meidän.
  function nappi(e) {
    if (!eloss || !e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key;
    if (k === '+' || k === '=') { e.preventDefault(); portaita(true); }
    else if (k === '-' || k === '_') { e.preventDefault(); portaita(false); }
    else if (k === '0') { e.preventDefault(); aseta(1); }
  }
  VW.addEventListener('wheel', rulla, { passive: false, capture: true });
  VW.addEventListener('keydown', nappi, true);
  tyyli();

  function pois() {
    eloss = false; clearTimeout(toastT); if (toast) toast.remove(); toast = null;
    VW.removeEventListener('wheel', rulla, { passive: false, capture: true });
    VW.removeEventListener('keydown', nappi, true);
    const el = document.getElementById(TYYLI_ID); if (el) { el.remove(); hudAseta(1); }
    document.documentElement.style.removeProperty(MUUTTUJA);   // localStorage-taso jää: seuraava lataus palauttaa sen
    if (VW.kuplaUiZoom && VW.kuplaUiZoom.versio === VERSIO) delete VW.kuplaUiZoom;
    if (VW.uiZoom && VW.uiZoom.__kupla) delete VW.uiZoom;
  }
  VW.uiZoom = { aseta, taso: () => taso, __kupla: true };
  VW.kuplaUiZoom = { versio: VERSIO, pois, aseta, taso: () => taso };
  return pois;
