// ==UserScript==
// @name         Kupla AA-kytkin
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @version      0.8.0
// @kupla-oletus on
// @description  Komento :aa vaihtaa pehmennyksen päälle/pois (linear, kuten Boon; ei terävöintiä). Vaihto näkyy heti, ei uudelleenlatausta. Valinta muistetaan.
// @author       re-lab
// ==/UserScript==
//
// kp 2026-11-03 05:49: "mites se AA juttu Onks vaikee toteuttaa? Vois tehdä komennon sen testaamiseen. Sama komento laittaa on/off".
// TAUSTA (luettu main-live): Nitro_Render_V3/packages/utils/src/DprRenderingMode.ts:8 GetDesiredScaleMode = () => 'nearest' (kovakoodattu),
//   ja GetRenderer.ts:40-48 patchattu bindSource pakottaa sen JOKAISELLE tekstuurille joka sidonnassa, PAITSI jos source.nitroFixedScaleMode.
//   Boon: index-762329f4.js SCALE_MODE = devicePixelRatio%1 ? LINEAR : NEAREST -> murto-DPR:llä (125/150 %) koko kuva pehmeä.
// MITEN: TextureSource.prototype saa getterin nitroFixedScaleMode. AA päällä: getter palauttaa true (Nitro ei pakota nearestia) ja
//   asettaa samalla tekstuurille linear. AA pois: false -> Nitro palauttaa nearestin itse seuraavassa sidonnassa. Prototyyppi
//   haetaan mistä tahansa huoneen spritestä (NitroDevTools.roomEngine), koska pixiä ei voi importata userscriptistä.
// RAJA: vaatii huoneen (spriten) ennen kuin proto löytyy; yritetään 2 s välein. Tekstuurit joilla oma nitroFixedScaleMode-arvo
//   (instanssikenttä) ohittavat getterin ja pysyvät ennallaan. Koskee vain tätä selainta.
//
// 0.7.0 (kp 21:22 "laita se :aa komentoo ja poista kaikki variantit siit komennost" · "se togglee vaa on/off meidän vahvinta versioo"):
//   :aa on pelkkä on/off. Päällä = linear (0.7.0:n terävöinti poistettu 0.7.1:ssä, kp 21:39-21:40) + roundPixels.
//   Poistettu: :aa1-:aa7, auto-tila, tason tallennus. Pois palauttaa kaiken (scaleMode, suodatin, roundPixels).
//   roundPixels kuten Boon (index-762329f4.js: ROUND_PIXELS=!0). Pixi 8: AbstractRenderer.mjs:67 this._roundPixels (vain getter
//   `roundPixels`, ei setteriä) ja SpritePipe.mjs:39 lukee sen VAIN kun spritelle luodaan GPU-data (_initGPUSprite) -> jo olemassa
//   olevien spritejen _gpuData[uid].roundPixels päivitetään käsin. HUOM: kupla-client asettaa jo roundPixels:true (Nitro-V3/src/App.tsx:376),
//   joten päällä-tilassa tämä on yleensä no-op; pois-tilassa palautetaan se arvo joka renderöijällä oli ennen :aa:ta.
//
// 0.8.0 (kp 21:06-21:39 "pysty ja vaakasuoria viivoja ... esim tos tv ... korkeussuunnas yks viiva", viiva liikkuu esineen mukana):
//   SYY (mitattu robolla 22:xx, loki tmp/aa-boon/loki-viiva.md): furni koostuu useasta spritestä samasta atlaksesta ilman reunusta.
//   Linear-näytteistys lukee kehyksen reunapikselillä kehyksen ULKOPUOLISEN atlas-texelin (läpinäkyvä, premultiplied) -> reunasarakkeen
//   alpha putoaa (DPR 1.5: 0.80, DPR 1.25: ~0.90) ja alta näkyy lattia 1 px viivana spritejen saumassa. Nearest ei lue naapuria.
//   KORJAUS: :aa päällä jokaisen tekstuurin UV:t kutistetaan UVINSET (0.3) texeliä jokaiselta SISÄPUOLISELTA reunalta (reuna joka on
//   atlaksen reunaa vasten jätetään: clamp-to-edge hoitaa sen). Uudet tekstuurit: Texture.prototype.updateUvs kääritään kerran
//   (kääre kutsuu VW.__kuplaAAinset, joten kuumapäivitys vaihtaa logiikan), jo olemassa olevat 2 s ajastin + aseta(). Pois: alkuperäinen
//   updateUvs ajetaan uudelleen -> UV:t täsmälleen alkuperäiset (ei kopioita). 0.17 ei riittänyt joka furnille (lohikäärme), 0.3 riitti.
(function () {
  'use strict';
  const VW = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  // Moottoriversio (kayttajat.json ryhmä aa-kytkin): jos sama lisäosa on jo ajossa (kp:n loader), ei toista kertaa.
  if (VW.kuplaAA) return;
  const AVAIN = 'kupla.aa';
  // 0.7.0: vain on | off. Vanha 'auto' (0.2.0-0.4.x) luetaan pois-tilaksi.
  let tila = 'off'; try { tila = VW.localStorage.getItem(AVAIN) === 'on' ? 'on' : 'off'; } catch (e) {}
  const laske = () => tila === 'on';
  let paalla = laske();
  let asennettu = false;

  // Kaikki huoneen näkymän tekstuurit. Mitattu robolla 05:58 (DPR 1.5, 683 tekstuuria): pelkkä getter vaihtoi vain 1/683, koska
  //   staattinen huone ei sido tekstuureja uudelleen -> vaihdossa käydään kaikki läpi ja päivitetään suoraan.
  function huoneJuuri() {
    const RE = VW.NitroDevTools && VW.NitroDevTools.roomEngine; if (!RE || !RE.getRoomInstanceRenderingCanvas) return null;
    let c = null; try { c = RE.getRoomInstanceRenderingCanvas(RE.activeRoomId, 1); } catch (e) {}
    return (c && (c.master || c._master)) || null;
  }
  function lahteet() {
    const juuri = huoneJuuri(); if (!juuri) return [];
    const seen = new Set(), S = new Set();
    const walk = (o, d) => { if (!o || d > 15 || seen.has(o)) return; seen.add(o);
      if (o.texture && o.texture.source && o.texture.source.style) S.add(o.texture.source);
      (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0);
    return [...S];
  }
  // Perusluokka TextureSource (omistaa staattisen defaultOptions), EI ensimmäisen spriten aliluokka: mitattu 05:59, getter
  //   ImageSourcen protossa -> muut lähdetyypit palasivat nearestiin 1,5 s:ssa.
  function etsiProto() {
    const a = lahteet(); if (!a.length) return null;
    let P = Object.getPrototypeOf(a[0]);
    while (P && !Object.prototype.hasOwnProperty.call(P.constructor, 'defaultOptions')) P = Object.getPrototypeOf(P);
    return P || Object.getPrototypeOf(a[0]);
  }
  // 0.8.0: UV-kutistus (ks. otsikko). Pixi 8 Texture.updateUvs laskee uvs:n framesta (source.width/height = looginen koko), rotate=0:
  //   x0,y0 / x1,y0 / x1,y1 / x0,y1. Kierretyt tekstuurit ohitetaan.
  const UVINSET = 0.3;
  function uvProto() {
    const juuri = huoneJuuri(); if (!juuri) return null;
    let t = null; const seen = new Set();
    const walk = (o, d) => { if (t || !o || d > 15 || seen.has(o)) return; seen.add(o); if (o.texture && o.texture.uvs && o.texture.frame) { t = o.texture; return; } (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0); if (!t) return null;
    let P = Object.getPrototypeOf(t);
    while (P && !Object.prototype.hasOwnProperty.call(P, 'updateUvs')) P = Object.getPrototypeOf(P);
    return P || null;
  }
  // Palauttaa true jos UV:t muuttuivat. Idempotentti: sama syöte -> samat arvot -> false.
  function uvKutista(t) {
    const s = t && t.source, f = t && t.frame, u = t && t.uvs; if (!s || !f || !u || t.rotate) return false;
    const W = s.width, H = s.height; if (!(W > 1 && H > 1) || !(f.width > 0) || !(f.height > 0)) return false;
    const l = f.x > 0 ? UVINSET : 0, r = f.x + f.width < W ? UVINSET : 0, a = f.y > 0 ? UVINSET : 0, b = f.y + f.height < H ? UVINSET : 0;
    const U0 = (f.x + l) / W, U1 = (f.x + f.width - r) / W, V0 = (f.y + a) / H, V1 = (f.y + f.height - b) / H;
    if (u.x0 === U0 && u.y0 === V0 && u.x1 === U1 && u.y1 === V0 && u.x2 === U1 && u.y2 === V1 && u.x3 === U0 && u.y3 === V1) return false;
    u.x0 = U0; u.y0 = V0; u.x1 = U1; u.y1 = V0; u.x2 = U1; u.y2 = V1; u.x3 = U0; u.y3 = V1;
    if (u.uvsFloat32 && u.uvsFloat32.length >= 8) { const q = [U0, V0, U1, V0, U1, V1, U0, V1]; for (let i = 0; i < 8; i++) u.uvsFloat32[i] = q[i]; }
    // Rekisteri kaikista kutistetuista (myös ne jotka eivät ole juuri nyt puussa, esim. animaation vuorossa olemattomat kehykset): pois palauttaa ne kaikki.
    if (!t.__kuplaAAreg) { t.__kuplaAAreg = true; (VW.__kuplaAAreg = VW.__kuplaAAreg || new Set()).add(new WeakRef(t)); }
    return true;
  }
  // Pois: alkuperäinen updateUvs uudelleen. Palauttaa true jos arvot muuttuivat.
  function uvPalauta(t, P) {
    const u = t && t.uvs; if (!u || !P || !P.__kuplaAAorig) return false;
    const e = [u.x0, u.y0, u.x1, u.y1, u.x2, u.y2, u.x3, u.y3];
    P.__kuplaAAorig.call(t);
    return e[0] !== u.x0 || e[1] !== u.y0 || e[2] !== u.x1 || e[3] !== u.y1 || e[4] !== u.x2 || e[5] !== u.y2 || e[6] !== u.x3 || e[7] !== u.y3;
  }
  VW.__kuplaAAinset = uvKutista;   // kääre kutsuu tätä -> uusin versio ratkaisee
  // Animoidut furnit vaihtavat spriten tekstuuria (sprite.texture = ...) kehyksestä toiseen, ja vuorossa olemattomia kehyksiä ei
  //   löydä puusta -> kutistus tehdään myös silloin kun tekstuuri ASETETAAN spritelle (Sprite.prototype.texture setter, kääritään kerran).
  function spriteProto() {
    const juuri = huoneJuuri(); if (!juuri) return null;
    let sp = null; const seen = new Set();
    const walk = (o, d) => { if (sp || !o || d > 15 || seen.has(o)) return; seen.add(o); if (o.texture && o.texture.uvs && o.texture.frame) { sp = o; return; } (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0); if (!sp) return null;
    let S = Object.getPrototypeOf(sp);
    while (S) { const d = Object.getOwnPropertyDescriptor(S, 'texture'); if (d && d.set) return S; S = Object.getPrototypeOf(S); }
    return null;
  }
  function uvAsenna() {
    const P = uvProto(); if (!P) return null;
    const S = spriteProto();
    if (S && !S.__kuplaAAtexset) {
      const d = Object.getOwnPropertyDescriptor(S, 'texture'); S.__kuplaAAtexset = d;
      Object.defineProperty(S, 'texture', { configurable: true, enumerable: d.enumerable, get: d.get,
        set(v) { if (VW.__kuplaAApaalla && VW.__kuplaAAinset && v && v.uvs && v.frame) VW.__kuplaAAinset(v); return d.set.call(this, v); } });
    }
    if (!P.__kuplaAAorig) {
      P.__kuplaAAorig = P.updateUvs;
      P.updateUvs = function () { const r = P.__kuplaAAorig.apply(this, arguments); if (VW.__kuplaAApaalla && VW.__kuplaAAinset) VW.__kuplaAAinset(this); return r; };
    }
    return P;
  }
  // Käy huoneen spritet läpi: päällä kutistaa, pois palauttaa. Päivittää spritet vain jos tekstuurin UV:t muuttuivat.
  function uvKierros() {
    const P = uvAsenna(); if (!P) return 0;
    const seen = new Set(), tex = new Map(), pal = new Set(); let n = 0;
    if (!paalla && VW.__kuplaAAreg) {
      for (const w of VW.__kuplaAAreg) { const t = w.deref(); if (t) { if (uvPalauta(t, P)) { pal.add(t); n++; } delete t.__kuplaAAreg; } }
      VW.__kuplaAAreg.clear();
    }
    const juuri = huoneJuuri(); if (!juuri) return n;
    const walk = (o, d) => { if (!o || d > 15 || seen.has(o)) return; seen.add(o);
      const t = o.texture;
      if (t && t.uvs && t.frame) {
        if (!tex.has(t)) { const m = paalla ? uvKutista(t) : pal.has(t); tex.set(t, m); if (paalla && m) n++; }
        if (tex.get(t)) o.onViewUpdate && o.onViewUpdate();
      }
      (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0);
    return n;
  }
  function pyyhi() {
    VW.__kuplaAApaalla = paalla;
    const m = paalla ? 'linear' : 'nearest'; let n = 0;
    for (const s of lahteet()) if (s.style && s.style.scaleMode !== m) { s.style.scaleMode = m; s.style.update && s.style.update(); n++; }
    return n;
  }

  // roundPixels (0.7.0). Renderöijä ei ole julkinen: huonekanvaksen juuren parentRenderGroup -> instructionSet.renderPipes -> sprite._renderer
  //   (mitattu robolla 21:2x, Pixi 8.19). Alkuperäinen arvo muistetaan VW:hen, jotta kuumapäivitys ei kadota sitä.
  function renderoija() {
    const juuri = huoneJuuri(), rg = juuri && juuri.parentRenderGroup; if (!rg) return null;
    const hae = g => { const rp = g && g.instructionSet && g.instructionSet.renderPipes;
      return (rp && ((rp.sprite && rp.sprite._renderer) || (rp.graphics && rp.graphics.renderer))) || null; };
    let r = hae(rg);
    if (!r) for (const ch of rg.renderGroupChildren || []) { r = hae(ch); if (r) break; }
    return r && '_roundPixels' in r ? r : null;
  }
  // Pixi lukee renderöijän lipun vain kun spritelle luodaan GPU-data, joten olemassa olevat spritet päivitetään itse.
  function kierrosRP(arvo) {
    const r = renderoija(); if (!r) return false;
    if (r._roundPixels === arvo) return true;
    r._roundPixels = arvo;
    const juuri = huoneJuuri(), seen = new Set();
    const walk = (o, d) => { if (!o || d > 15 || seen.has(o)) return; seen.add(o);
      const g = o._gpuData && o._gpuData[r.uid];
      if (g && 'roundPixels' in g) { g.roundPixels = arvo | (o._roundPixels ? 1 : 0); o.onViewUpdate && o.onViewUpdate(); }
      (o.children || []).forEach(ch => walk(ch, d + 1)); };
    walk(juuri, 0);
    return true;
  }
  function roundPixels() {
    const r = renderoija(); if (!r) return;
    if (paalla) { if (VW.__kuplaAAedRP === undefined) VW.__kuplaAAedRP = r._roundPixels; kierrosRP(1); }
    else if (VW.__kuplaAAedRP !== undefined) { if (kierrosRP(VW.__kuplaAAedRP)) VW.__kuplaAAedRP = undefined; }
  }

  function asenna() {
    if (asennettu) return true;
    const P = etsiProto(); if (!P) return false;
    // 0.6.3 (kp 07:04 "ei mee aa pois päältä"): getter jäi ENSIMMÄISEN version sulkeumaan (sen paalla), joten kuumapäivityksen jälkeen
    //   pois ei vaikuttanut sidontaan. Nyt getter määritellään joka versiossa uudelleen ja lukee jaetun lipun.
    Object.defineProperty(P, 'nitroFixedScaleMode', { configurable: true,
      get() {
        if (!VW.__kuplaAApaalla || !this.style) return false;
        if (this.style.scaleMode !== 'linear') { this.style.scaleMode = 'linear'; this.style.update && this.style.update(); }
        return true;
      },
      set(v) { Object.defineProperty(this, 'nitroFixedScaleMode', { value: v, writable: true, configurable: true }); } });
    asennettu = true; return true;
  }
  const ajastin = setInterval(() => { if (asenna()) { clearInterval(ajastin); if (paalla) { pyyhi(); roundPixels(); uvKierros(); } } }, 2000);

  // Terävöinti pehmennyksen päälle (0.3.0): SVG feConvolveMatrix huonecanvasille (CSS filter), kerroin = reunojen paino.
  // 0.7.0: yksi kiinteä taso = entisen :aa7:n (sisäinen taso 5) kerroin. Gamma poistettu (se oli vain entisessä :aa2:ssa).
  const VAHVUUS = 0.75;
  function huoneCanvas() {
    let paras = null, a = 0;
    for (const c of document.querySelectorAll('canvas')) { const x = c.clientWidth * c.clientHeight; if (x > a) { a = x; paras = c; } }
    return paras;
  }
  function teravoita() {
    const vari = false, k = 0;   // 0.7.1: EI terävöintiä (kp 21:39 "kuka sano et piti olla terävöintiä lainkaan aa:ssa", 21:40 "viiva paheni"); filtteri vain poistetaan
    let d = document.getElementById('kupla-aa-svg');
    if (vari && !d) {
      d = document.createElement('div'); d.id = 'kupla-aa-svg'; d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="kupla-teravoita" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="gamma" amplitude="1" offset="0" exponent="1"/><feFuncG type="gamma" amplitude="1" offset="0" exponent="1"/><feFuncB type="gamma" amplitude="1" offset="0" exponent="1"/></feComponentTransfer><feConvolveMatrix order="3" preserveAlpha="true"/></filter></svg>';
      document.body.appendChild(d);
    }
    // 0.4.4: SVG jää sivulle versiosta toiseen (vanhassa voi olla gamma) -> exponent asetetaan joka kierroksella, ei vain luodessa
    if (d) d.querySelectorAll('feFuncR,feFuncG,feFuncB').forEach(e => e.setAttribute('exponent', '1'));
    if (d) d.querySelector('feConvolveMatrix').setAttribute('kernelMatrix', `0 ${ -k } 0 ${ -k } ${ 1 + 4 * k } ${ -k } 0 ${ -k } 0`);
    // 0.4.1 (kp 06:46 "vilkkuu edellee"): suodatin WebGL-canvasille itselleen vilkkui -> vanhemman divin kerrokselle.
    const c0 = huoneCanvas(); if (!c0) return;
    if (c0.style.filter) c0.style.filter = '';
    const c = c0.parentElement || c0;
    const f = vari ? 'url(#kupla-teravoita)' : '';
    if (c.style.filter !== f) c.style.filter = f;
  }
  // 0.4.2 (kp 06:47 "sekunnin välein välähtää"): moottorin kuumapäivitys jätti vanhan version ajastimet henkiin, ja kaksi versiota
  //   kirjoitti suodatinta vuorotellen. Sukupolvi: uusi ajo kasvattaa laskuria, vanhan ajastin pysähtyy itse.
  const SUKU = VW.__kuplaAAsuku = (VW.__kuplaAAsuku || 0) + 1;
  const ajastinT = setInterval(() => { if (VW.__kuplaAAsuku !== SUKU) return clearInterval(ajastinT); teravoita(); if (paalla) { roundPixels(); uvKierros(); } }, 2000);

  // 0.6.4 (kp 07:04 "komennon pitäs sanoo mitkä settings menee pääl samanlail ku wired messaget näkyy vaa itel"): yksi chattirivi vain itselle.
  //   Pelin oma RSCE_CHAT_EVENT (RoomSessionChatEvent, kuten DiscordRuntime.ts:119) globaaliin tapahtumajakajaan; ei lähde palvelimelle.
  //   Luokkaa ei voi importata userscriptistä -> tavallinen olio samoilla kentillä (kuuntelija lukee vain kentät). Kuiskaustyyli (chatType 1).
  function omaRivi(teksti) {
    try {
      const RE = VW.NitroDevTools && VW.NitroDevTools.roomEngine, ses = RE && RE._roomSessionManager && RE._roomSessionManager.getSession(RE.activeRoomId);
      if (!RE || !RE.events || !ses) return false;
      RE.events.dispatchEvent({ type: 'RSCE_CHAT_EVENT', session: ses, objectId: ses.ownRoomIndex, message: teksti, chatType: 1, style: 0, chatColours: '', links: null,
        extraParam: -1, prefixText: '', prefixColor: '', prefixIcon: '', prefixEffect: '', prefixFont: '', nickIcon: '', displayOrder: 'icon-prefix-name' });
      return true;
    } catch (e) { return false; }
  }
  function aseta(uusi) {
    tila = uusi; paalla = laske(); try { VW.localStorage.setItem(AVAIN, tila); } catch (e) {}
    asenna(); const n = pyyhi(); roundPixels(); uvKierros(); teravoita();
    omaRivi(paalla ? 'aa: päällä (linear)' : 'aa: pois');
    return 'AA ' + (paalla ? 'PÄÄLLÄ (linear)' : 'POIS (terävä, nearest)') + (asennettu ? ' · ' + n + ' tekstuuria' : ' — odottaa huonetta');
  }
  // 0.7.0: sivun zoom muuttaa DPR:ää ja kuvan skaalaa, mutta tila ei riipu siitä -> resize-kuuntelijaa ei enää tarvita (auto poistui).

  // :aa = päälle/pois, :aa off / :aa pois = sammuttaa aina.
  (VW.kuplaKomennotJono = VW.kuplaKomennotJono || []).push([['aa'],
    (teksti, sanat) => /^(off|pois)$/i.test(sanat[0] || '') ? aseta('off') : aseta(paalla ? 'off' : 'on'),
    'pehmennys: :aa päälle/pois (linear) · :aa off sammuttaa', 'AA-kytkin']);
  // Ilman kuplaKomennot-lisäosaa (Res): oma Enter-käsittelijä kuten wired-piilo.user.js.
  const komennotHoitaa = n => { try { return !!(VW.kuplaKomennot && VW.kuplaKomennot.lista().some(k => k.nimet.includes(n))); } catch (e) { return false; } };
  function ilmoita(teksti) {
    const d = document.createElement('div'); d.textContent = teksti;
    d.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99999;background:rgba(20,25,30,.95);color:#fff;padding:6px 12px;border-radius:6px;font:13px sans-serif;pointer-events:none';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.isComposing || VW.__kuplaAAsuku !== SUKU) return;
    const t = ev.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    const m = /^\s*:aa(?:\s+(\S+))?\s*$/i.exec(t.value || ''); if (!m || komennotHoitaa('aa')) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set;
      setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
    ilmoita(/^(off|pois)$/i.test(m[1] || '') ? aseta('off') : aseta(paalla ? 'off' : 'on'));
  }, true);
  VW.kuplaAA = { versio: '0.8.0', pois: () => { VW.__kuplaAAsuku++; }, aseta, tila: () => ({ tila, paalla, asennettu, dpr: VW.devicePixelRatio }) };
})();
