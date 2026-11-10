// ==UserScript==
// @name         Reply-tabi kuplan reunaan (kp)
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.32.5
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
  const VERSIO = '1.32.5';
  const LEVEYS = 16;
  const VARJO = LEVEYS + 5; // varjostettu kaista kuplan ulkoreunasta: lisätty tila + osa kuplan 6 px oikeaa reunakuvaa
  // 1.10.0: jakoviiva mitataan kuplan LAATIKON reunasta, ei outsetilla kasvatetun ::after-laatikon reunasta (kp 03:54 'nuolella eri
  // verran etäisyyttä divideriin riippuen kuplasta'): tyypeillä 9,10,18,21,22,25,26 oikea outset 1-10 px siirsi viivaa, nuoli pysyi.
  // 1.32.4 (B47 + B48, kp 10.11. 07:30 tulkinta a): vakioväli tekstiin kuplan sisällä. Jos kuplassa on vapaata tilaa,
  // nappi ja varjostus siirtyvät kuplan oikeasta reunasta sisäänpäin --kp-rt-extra px verran.
  const J = 'calc(100% - ' + VARJO + 'px - var(--kp-rt-extra, 0px) - var(--kp-rt-or, 0px))', J1 = 'calc(100% - ' + (VARJO - 1) + 'px - var(--kp-rt-extra, 0px) - var(--kp-rt-or, 0px))', J2 = 'calc(100% - var(--kp-rt-extra, 0px) - var(--kp-rt-or, 0px))';
  if (window.__kuplaReplyTabi && typeof window.__kuplaReplyTabi.pois === 'function') { try { window.__kuplaReplyTabi.pois(); } catch (e) {} }
  // 1.27.0 (kp 07:33 'miks livessä nyt kuplat taas liikahtaa ku hover'): PR 863 tuo reply-tabin clienttiin (useChatReplyTabi.ts,
  // samat data-kp-rt-*-merkit). Tämä skripti sen päällä = kaksi kuuntelijaa samoilla kuplilla. Natiivi tunnistetaan clientin omasta
  // tyylisäännöstä (mitattu 07:34: kp:n PR-buildi -> index-*.css, robon live -> ei osumaa).
  const natiivi = (() => { for (const s of document.styleSheets) { let r; try { r = s.cssRules; } catch (e) { continue; } for (const x of r) if (x.cssText && x.cssText.includes('data-kp-rt-live')) return true; } return false; })();
  if (natiivi) { console.log('[reply-tabi ' + VERSIO + '] client hoitaa reply-tabin itse, skripti ei asennu'); return; }

  const tyyli = document.createElement('style');
  tyyli.id = 'kp-reply-tabi';
  tyyli.textContent = `
    .bubble-container[data-kp-rt-auki] .chat-content { padding-right: var(--kp-rt-pr, ${6 + LEVEYS}px) !important; }
    /* kp 02:56 + 02:59: ei omaa muotoa ("boxy"). Varjostus piirretään kuplan päälle maskilla, joka on kuplan OMA
       border-image (sama kuva, slice, width, outset), joten se seuraa kuplan reunaa ja pyöristyksiä ylhäältä alas.
       Divider = gradientin 1 px kova raja. Nappi itse on läpinäkyvä klikkialue + nuoli. */
    .bubble-container[data-kp-rt-auki] .chat-bubble::after {
      content: ''; position: absolute; pointer-events: none; z-index: 1;
      /* kp 03:19 'muutaman pikselin gap' ylhäällä: kuplan kuva ulottuu border-image-outsetin verran laatikon yli
         (useimmissa 2px 0 0), ja gradientti piirtyy vain omaan laatikkoonsa -> laatikko itse kasvatetaan outsetilla */
      top: calc(-1 * var(--kp-rt-ot, 0px)); right: calc(-1 * var(--kp-rt-or, 0px));
      bottom: calc(-1 * var(--kp-rt-ob, 0px)); left: calc(-1 * var(--kp-rt-ol, 0px));
      background: linear-gradient(to right, transparent ${J}, rgba(0,0,0,.22) ${J},
        rgba(0,0,0,.22) ${J1}, rgba(0,0,0,.06) ${J1}, rgba(0,0,0,.06) ${J2}, transparent ${J2}); /* 1.18.0 kp 05:41 'subtlempaa shading etenkin kun ei hoveraa reply nappia' (oli .4/.13) */
      -webkit-mask-box-image-source: var(--kp-rt-src); -webkit-mask-box-image-slice: var(--kp-rt-slice);
      -webkit-mask-box-image-width: var(--kp-rt-w); -webkit-mask-box-image-outset: 0;
      -webkit-mask-box-image-repeat: stretch;
    }
    .bubble-container[data-kp-rt-auki] .chat-bubble:has(~ .chat-reply-button:hover)::after,
    .bubble-container[data-kp-rt-auki]:has(.chat-reply-button:hover) .chat-bubble::after {
      background: linear-gradient(to right, transparent ${J}, rgba(0,0,0,.45) ${J},
        rgba(0,0,0,.45) ${J1}, rgba(0,0,0,.25) ${J1}, rgba(0,0,0,.25) ${J2}, transparent ${J2});
    }
    .bubble-container .chat-reply-button {
      position: absolute !important; top: 0 !important; bottom: 0 !important; height: auto !important; transform: none !important;
      /* 1.11.0 (kp 04:01 'nuoli … vähän liikaa vasemmalla'): nappi ulottuu kuplakuvan näkyvään oikeaan reunaan asti
         (outset), ja nuoli keskitetään jakoviivan ja sen reunan väliin — ennen padding-right 3px + outset jätti sen vasemmalle */
      /* 1.32.4 (B48): jos kuplassa on tilaa, nappi siirtyy kuplan sisälle tekstin viereen (+ var(--kp-rt-extra)) */
      right: calc(var(--kp-rt-ir, 0px) - var(--kp-rt-or, 0px) + var(--kp-rt-extra, 0px)) !important; width: calc(${VARJO}px + var(--kp-rt-or, 0px) - var(--kp-rt-ir, 0px)) !important;
      min-width: 0 !important; max-width: none !important;
      padding: max(0px, calc(2 * var(--kp-rt-dy, 0px))) 3px max(0px, calc(-2 * var(--kp-rt-dy, 0px))) 1px !important; /* 1.16.0 (kp 04:41 bubble-1010 'teksti eri kohdas kuplaa' · 04:44 'reply nappi eksyy'): sky-kuplissa (1000-1049) tekstin ylä- ja alapehmuste eroaa (1010: 15/7, ChatPurchasableStyles.scss) ja kuvan oikeassa reunassa on läpinäkyvää, joten nuoli keskitetään tekstiin (--kp-rt-dy) ja kuvan näkyvään reunaan (--kp-rt-ir) laatikon sijaan. 1.13.0 kp 04:16 '1-2 pikselii vasemmalle': nuoli 1,5 px keskeltä vasemmalle (variantti D) */ box-sizing: border-box !important; border: 0 !important; border-radius: 0 !important;
      background: transparent !important; color: #111 !important; font-size: 12px !important; font-weight: bold !important;
    }
    /* 1.15.0 (Res 04:27 'heilauttaa tekstii' · kp 04:35 'koko kupla värähtää kun hoveraa'): client keskittää live-kuplan puhujaan
       kontin leveydestä (left = clamp(0, x - leveys/2, …)), joten levennys siirsi kuplaa puolet levennyksestä. Lisätty padding
       kumotaan negatiivisella margin-rightilla: kontin leveys ei muutu, client ei laske leftiä uudelleen, kupla vain jatkuu oikealle. */
    /* 1.27.0 (kp 06:39 'edelleen kuplan koko muuttuu' + kuva 'iha hyvä combo' kahdella rivillä): lukitun kontin leveys + lisa on tasan
       kuplan uusi leveys, ja alipikselipyöristys rivitti tekstin (robo 06:42: 46 px kupla -> 76 px hoverissa). 4 px löysää; kupla on
       shrink-to-fit, joten löysä ei näy */
    /* 1.28.0 (robo mittasi 08:10: hoverissa nuoli +3,19 px oikealle ja tabin oikea reuna 6,39 px kuplan reunan sisäpuolella): .chat-bubble on
       block ja täytti myös 4 px:n löysän, joten kupla leveni lisa + 4 eikä lisa. Leveys on nyt hoveria edeltävä leveys (--kp-rt-lev0, mitattu
       ennen lukkoa) + lisa: tekstin tila on täsmälleen sama kuin ennen, joten rivitys ei muutu, ja nuoli palaa tasan paikalleen.
       Layout pyöristää 1/64 LAITE-px:iin, eli kuplan px kertaa zoom (1,6) kertaa devicePixelRatio (robolla 1,125): lev0 ja lisa lasketaan
       siinä yksikössä (robo 09:0x: 1/64 kuplan omissa px:issä jätti nuoleen 1/72 px = yhden layout-yksikön eron kolmessa kuplassa 12:sta).
       Jos --kp-rt-lev0 puuttuu, calc on virheellinen ja leveys on oletus. */
    .bubble-container[data-kp-rt-auki][data-kp-rt-live] > .chat-bubble { margin-right: calc(-1 * var(--kp-rt-lisa, 0px) - 4px) !important; width: calc(var(--kp-rt-lev0) + var(--kp-rt-lisa, 0px)) !important; max-width: calc(var(--kp-rt-lev0) + var(--kp-rt-lisa, 0px)) !important; }
    /* 1.17.0 (kp 05:18 'pieni nuoli kuplan alaosassa siirtyy kun hoveraa eli ei pysy hahmon kohdalla'): .pointer on kuplan sisällä
       left 50 %, joten oikealle levennetty kupla vei sitä puolet levennyksestä; siirretään takaisin */
    .bubble-container[data-kp-rt-auki][data-kp-rt-live]:not(.chat-pulldown-bubble) > .chat-bubble > .pointer { margin-left: calc(-0.5 * var(--kp-rt-lisa, 0px)) !important; }
    .bubble-container[data-kp-rt-auki][data-kp-rt-live] > .chat-reply-button { right: calc(var(--kp-rt-ir, 0px) - var(--kp-rt-or, 0px) - var(--kp-rt-lisa, 0px) + var(--kp-rt-extra, 0px)) !important; }
    /* 1.22.0 (kp 06:12 'reply nappi vaatii lisätilaa mitä laatikko ei anna ja teksti pakottuu seuraavalle riville' · 06:18 1.21:n
       negatiivinen margin jätti napin kuplan ulkopuolelle): historiaikkunan kontti on fit-content ja max-width calc(100% - 3rem)
       (ChatHistoryView.scss), joten pitkässä viestissä lisätty padding rivitti tekstin. Hoverissa kontti saa napin verran lisää. */
    /* 1.23.0 (kp 06:24 'kuplat liikkuu silti … varmaan kun tulee toi sideways scroll bar' · 'voisko sen sijaa resize ikkunaa nii defaultisti
       et se antaa jo valmiiks tilaa replylle'): 1.22:n lisäleveys ylitti listan ja toi vaakavierityspalkin. Nyt tila varataan valmiiksi:
       teksti rivittyy aina napin verran kapeammaksi, ja hoverissa kontti saa sen takaisin, joten mikään ei liiku eikä ylitä listaa. */
    .chat-history-entry .bubble-container { max-width: calc(100% - 3rem - ${VARJO + 10}px) !important; }
    /* 1.24.0 (kp 06:27 'edellee jotkut rivit yhdel rivil tai kahdel riippuen hoveraako vai ei'): hoverissa kontti saa takaisin vain
       sen mitä padding kasvoi (--kp-rt-lisa), ei koko varausta, joten tekstin leveys pysyy täsmälleen samana */
    .chat-history-entry .bubble-container[data-kp-rt-auki] { max-width: calc(100% - 3rem - ${VARJO + 10}px + var(--kp-rt-lisa, 0px)) !important; }
    .bubble-container .chat-reply-button:hover { background: transparent !important; }
    .bubble-container .chat-reply-button::before { inset: 0 !important; }
    .bubble-container[data-kp-rt-tumma] .chat-reply-button { color: #f4f4f4 !important; }
    .bubble-container[data-kp-rt-auki][data-kp-rt-tumma] .chat-bubble::after {
      background: linear-gradient(to right, transparent ${J}, rgba(255,255,255,.3) ${J},
        rgba(255,255,255,.3) ${J1}, rgba(255,255,255,.08) ${J1}, rgba(255,255,255,.08) ${J2}, transparent ${J2}); /* 1.18.0 (oli .5/.16) */
    }
    .bubble-container[data-kp-rt-auki][data-kp-rt-tumma]:has(.chat-reply-button:hover) .chat-bubble::after {
      background: linear-gradient(to right, transparent ${J}, rgba(255,255,255,.55) ${J},
        rgba(255,255,255,.55) ${J1}, rgba(255,255,255,.28) ${J1}, rgba(255,255,255,.28) ${J2}, transparent ${J2});
    }
    .bubble-container[data-kp-rt-siirretty] { transition: top .2s, translate .08s ease-out; }
    .bubble-container[data-kp-rt-siirretty] > .chat-bubble > .pointer { transition: translate .08s ease-out; }
  `;
  document.head.appendChild(tyyli);

  // src -> true (tumma) / false (vaalea) / Promise (luetaan). Kuvia on muutama kymmenen kuplatyyppiä, joten välimuisti riittää.
  const tummuus = new Map();
  const lueTummuus = (src, slice) => {
    if (tummuus.has(src)) return tummuus.get(src);
    const m = /url\("?(data:[^")]+)"?\)/.exec(src || '');
    if (!m) { const o = { tumma: false, ir: 0 }; tummuus.set(src, o); return o; }
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
          // oikean reunan läpinäkyvä kaista keskiriviltä, kuvan px (vain oikean slicen sisällä)
          const rivi = g.getImageData(0, y, img.width, 1).data; let ir = 0;
          while (ir < r && rivi[(img.width - 1 - ir) * 4 + 3] <= 128) ir++;
          const o = { tumma, ir: ir < r ? ir : 0 };
          tummuus.set(src, o); ok(o);
        } catch (e) { console.warn('[reply-tabi] kuplan väriä ei voitu lukea', e); tummuus.set(src, { tumma: false, ir: 0 }); ok({ tumma: false, ir: 0 }); }
      };
      img.onerror = () => { tummuus.set(src, { tumma: false, ir: 0 }); ok({ tumma: false, ir: 0 }); };
      img.src = m[1];
    });
    tummuus.set(src, p); return p;
  };
  // ir kuvan px -> css px: oikean reunakuvan leveys / oikea slice
  const merkitseTumma = (kupla, src, slice, bw) => {
    const v = lueTummuus(src, slice);
    const sl = (String(slice).match(/[\d.]+/g) || ['0']).map(Number), w = (String(bw).match(/[\d.]+/g) || ['0']).map(Number);
    const sr = sl[1] ?? sl[0], wr = w[1] ?? w[0];
    // 1.28.0: kuva luetaan asynkronisesti; jos hiiri ehti jo pois, merkkiä ei enää aseteta (muuten se jäisi kuplaan hoverin jälkeen)
    const aseta = o => { if (kupla !== auki) return; if (o.tumma) kupla.setAttribute('data-kp-rt-tumma', ''); else kupla.removeAttribute('data-kp-rt-tumma');
      kupla.style.setProperty('--kp-rt-ir', (sr > 0 ? o.ir * wr / sr : 0) + 'px'); };
    if (v instanceof Promise) v.then(aseta); else aseta(v);
  };

  let auki = null;
  let leveys = null; // [chat-bubble, alkuperäinen inline max-width]
  let siirretyt = [];
  // 1.20.0 (kp 06:07 'jos vetää hiirel nopee viestien yli niin kuplan korkeus lasketaan edeltävästä kuplasta … eikä päivity'):
  // lukko ei tallenna "alkuperäisiä" inline-arvoja (toinen instanssi tai väliin jäänyt palautus tallentaisi edellisen lukon koon
  // alkuperäiseksi ja jättäisi sen pysyväksi); client ei aseta kontille inline-kokoa, joten lukko vain poistetaan, ja jokainen
  // data-kp-rt-lukko-kontti vapautetaan ennen uutta.
  const vapautaLukot = () => { for (const k of document.querySelectorAll('.bubble-container[data-kp-rt-lukko]')) {
    k.style.removeProperty('width'); k.style.removeProperty('height'); k.style.removeProperty('box-sizing'); k.removeAttribute('data-kp-rt-lukko'); } };

  // 1.28.0 (kp 07:48: hoverin jälkeen jokaisen mitatun arvon pitää olla sama kuin ennen hoveria): hover jätti kuplaan data-kp-rt-live/-tumma-merkit ja
  // --kp-rt-*-muuttujat (kontti + .chat-bubble). Ne poistetaan, joten poistuttaessa kupla on täsmälleen hoveria edeltävässä tilassa.
  const siivoa = k => {
    for (const a of ['data-kp-rt-auki', 'data-kp-rt-live', 'data-kp-rt-tumma']) k.removeAttribute(a);
    for (const el of [k, k.querySelector(':scope > .chat-bubble')]) { if (!el) continue;
      for (const n of [...el.style].filter(n => n.startsWith('--kp-rt-'))) el.style.removeProperty(n); }
  };

  const vapautaSiirretyt = () => {
    for (const e of [...siirretyt, ...document.querySelectorAll('.bubble-container[data-kp-rt-siirretty]')]) {
      e.style.translate = ''; e.removeAttribute('data-kp-rt-siirretty');
      const p = e.querySelector('.pointer');
      if (p) p.style.translate = '';
    }
    siirretyt = [];
    if (topVahti) { try { topVahti.takeRecords(); } catch (e) {} }
  };

  const palauta = () => {
    vapautaSiirretyt();
    if (leveys) { leveys[0].style.maxWidth = leveys[1]; leveys = null; }
    if (auki) siivoa(auki);
    vapautaLukot();
    auki = null;
  };

  // 1.12.0 (kp 04:12 'dividerin ja viestin lopun väliin pitäs jäädä yht iso väli ku nimen … ":" ja viestin sisällön väliin'):
  // mitataan renderöity väli ':' -> viestin alku ja tekstin oikea reuna -> jakoviiva, ja korjataan .chat-content padding-right
  // erotuksella (kuplan reunakuvat ovat eri levyisiä, joten kiinteä padding ei anna samaa väliä).
  // 1.28.0 (robo 09:2x: jakoviiva osui tasan tekstin loppuun, väli 0 eikä ':'-väli 5,4 px): mitattiin hoverin tilassa, jossa padding on jo
  // 6 + LEVEYS mutta leveys vielä hoveria edeltävä, joten teksti rivittyi mittauksen ajaksi ja tulos leikkautui VARJO-minimiin. Nyt mitataan
  // ENNEN mitään muutosta: tekstin tila pysyy hoverissa samana, joten teksti on lopussakin tasan samassa kohdassa.
  const mittaaVali = (kupla, kpl) => {
    const sis = kupla.querySelector('.chat-content'), nimi = sis && sis.querySelector(':scope > .username'), viesti = sis && sis.querySelector(':scope > .message');
    if (!kpl || !nimi || !viesti) return null;
    const t = nimi.lastChild, i = t && t.nodeType === 3 ? t.data.lastIndexOf(':') : -1;
    if (i < 0) return null;
    const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1);
    const rRect = r.getBoundingClientRect(), zb = kpl.currentCSSZoom || parseFloat(getComputedStyle(kpl).zoom) || 1;
    const vRects = viesti.getClientRects();
    let oikea = 0;
    // 1.32.3 (B46) + 1.32.5 (D1 + D2 live-mittauksesta):
    // Viestin ja nimen inline-tekstirivit mitataan suoraan getClientRects():llä.
    // Vastauskuplien lainausriveiltä (.chat-reply-quote live/ylävedossa, .chat-history-reply-quote sivuhistoriassa)
    // mitataan vain TEKSTIN oikea reuna (Range tekstisolmuista), ei koko sisällön levyistä flex-laatikkoa.
    for (const e of sis.querySelectorAll(':scope > .username, :scope > .message, :scope > .duplicate-count')) for (const q of e.getClientRects()) oikea = Math.max(oikea, q.right);
    const qRng = document.createRange();
    const mittaaTeksti = el => {
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          if (c.data && /\S/.test(c.data)) {
            qRng.selectNodeContents(c);
            for (const q of qRng.getClientRects()) oikea = Math.max(oikea, q.right);
          }
        } else if (c.nodeType === 1) {
          if (c.matches && c.matches('img, svg')) for (const q of c.getClientRects()) oikea = Math.max(oikea, q.right);
          mittaaTeksti(c);
        }
      }
    };
    for (const qe of sis.querySelectorAll('.chat-reply-quote, .chat-history-reply-quote')) mittaaTeksti(qe);
    const reuna = kpl.getBoundingClientRect().right;
    // 1.29.0 (B40) + 1.30.0 (B42): jos viestin 1. sana rivittyy toiselle riville nimen alle (vRects[0].left <= rRect.right + 0.5 tai
    // vRects[0].top >= rRect.bottom - 1) tai viesti on tyhjä / pelkkiä välilyöntejä (vRects.length === 0 tai vRects[0].width === 0),
    // CSS white-space:normal kutistaa nimen perässä olevan välilyönnin rivin lopussa 0-levyiseksi. Mitataan silloin nimen perässä
    // olevan välilyönnin leveys white-space:pre -tilassa (antaa täsmälleen saman ~5,375 px välin kuin yksirivisessä viestissä).
    const samaRivi = vRects.length > 0 && vRects[0].width > 0 && vRects[0].left > rRect.right + 0.5 && vRects[0].top < rRect.bottom - 1;
    let tavoite = samaRivi ? (vRects[0].left - rRect.right) : 0;
    if (!(tavoite > 0)) {
      const ws0 = nimi.style.whiteSpace;
      nimi.style.whiteSpace = 'pre';
      const mr = (parseFloat(getComputedStyle(nimi).marginRight) || 0) * zb;
      tavoite = Math.max(mr, nimi.getBoundingClientRect().right - r.getBoundingClientRect().right + mr);
      if (ws0) nimi.style.whiteSpace = ws0; else nimi.style.removeProperty('white-space');
    }
    return { tavoite, oikea, reuna, zb };
  };
  const tasaaVali = (kupla, kpl, pr0, v0) => {
    // 1.32.4 (B47 + B48, kp 10.11. 07:30 tulkinta a: vakioväli tekstiin):
    // Jos kuplassa ei ole tilaa (tarve > 0), kupla levenee lisa px.
    // Jos kuplassa on jo vapaata tilaa napille (tarve <= 0), kupla EI levene (lisa = 0), ja nappi + varjostus
    // siirtyvät kuplan sisälle tekstin viereen vakiovälille (extra = -tarve px kuplan oikeasta reunasta sisäänpäin).
    const tarve = v0 ? (v0.tavoite + v0.oikea - v0.reuna) / v0.zb + VARJO : 6 + LEVEYS - pr0;
    // 1.28.0: lisa on laite-px:inä (kuplan px * zoom * devicePixelRatio, layoutin oma yksikkö 1/64) 1/32:n monikerta -> puolikas (nuolen
    // margin-left) on tasan yksi 1/64 eikä pyöristy eri suuntaan kuin kuplan 50 %. + 1/1024 laite-px: float-virhe ei pudota arvoa
    // pyöristettäessä alemmalle 1/64:lle (katkaisu ja pyöristys antavat saman). pr = pr0 + lisa, joten padding ja leveys kasvavat täsmälleen
    // saman verran. max-width kasvaa lisa eikä pr - 6: sky-kuplan (1010) oma padding-right on 12 px, ja -6 antoi tekstille 6 px lisää,
    // jolloin pitkä kupla rivittyi hoverissa uudelleen
    const Z = (kpl.currentCSSZoom || parseFloat(getComputedStyle(kpl).zoom) || 1) * (window.devicePixelRatio || 1);
    const m = Math.max(0, Math.round(tarve * Z * 32)), lisa = m > 0 ? (m / 32 + 1 / 1024) / Z : 0, prq = pr0 + lisa;
    const mEx = Math.max(0, Math.round(-tarve * Z * 32)), extra = mEx > 0 ? (mEx / 32 + 1 / 1024) / Z : 0;
    kupla.style.setProperty('--kp-rt-pr', prq + 'px');
    kupla.style.setProperty('--kp-rt-lisa', lisa + 'px');
    kupla.style.setProperty('--kp-rt-extra', extra + 'px');
    const lev0 = parseFloat(kpl.style.getPropertyValue('--kp-rt-lev0')) || 0;
    if (leveys) kpl.style.maxWidth = (Math.max(parseFloat(leveys[1]), lev0) + prq - pr0 + 1 / (Z * 64)) + 'px';
  };

  // 1.30.0 (B43, kp 19:30 'kun tulee uusia kuplia eli kupla liikkuu, hoverin aikana kupla siirtyy oikealle'):
  // Siirrä oikealla puolella pystysuunnassa päällekkäin osuvat kuplat. Ketjuttaa: siirretty kupla voi työntää seuraavaa.
  // Huomioi live-kuplien transition: top 0.2s: getBoundingClientRect() antaa animaation aikana
  // väliaikaisen sijainnin, joka leikkaisi ylempää/alempaa kuplaa vaikka lopulliset rivit eivät
  // leikkaa (aiheutti B43:ssa kuplan siirtymisen oikealle uusien kuplien saapuessa).
  // Käytetään pystykoordinaateissa tavoiteasemaa (style.top), jolloin siirto arvioidaan aina
  // vakaan asettelun mukaan. Lisäksi ohitetaan vielä asemoimattomat (.invisible) kuplat.
  const tyonna = kupla => {
    vapautaSiirretyt();
    if (!kupla || !kupla.parentElement || kupla.classList.contains('invisible')) return;
    const pTop = kupla.parentElement.getBoundingClientRect().top;
    const laatikko = el => {
      const b = el.querySelector(':scope > .chat-bubble') || el, r = b.getBoundingClientRect();
      const st = parseFloat(el.style.top);
      if (!Number.isFinite(st)) return r;
      const dy = (pTop + st) - el.getBoundingClientRect().top;
      return { left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy };
    };
    const kaikki = [...kupla.parentElement.querySelectorAll(':scope > .bubble-container')].filter(
      e => e !== kupla && !e.classList.contains('invisible') && !e.classList.contains('chat-pulldown-measure') && (Number.isFinite(parseFloat(e.style.top)) || Number.isFinite(parseFloat(e.style.bottom)))
    );
    const esteet = [laatikko(kupla)];
    const ehdokkaat = kaikki.map(e => ({ e, r: laatikko(e) })).sort((a, b) => a.r.left - b.r.left);
    for (const { e, r } of ehdokkaat) {
      let dx = 0;
      for (const s of esteet) {
        const pysty = r.top < s.bottom - 1 && r.bottom > s.top + 1;
        const vaaka = r.left + dx < s.right && r.right + dx > s.left;
        if (pysty && vaaka && r.left >= s.left) dx = Math.max(dx, s.right - r.left + 1);
      }
      if (dx > 0) {
        const dxCeil = Math.ceil(dx);
        // 1.32.1 (B44, kp 9.11. 01:37: "jos se menis muuten alle, ei tehdä mitään. Muissa tapauksissa väkänen pysyy..."):
        // Jos täydellä kompensaatiolla nuolen vasen reuna menisi työnnetyn kuplan avatar-kuvan oikean reunan alle
        // (p0Left < uiR + dxCeil), ei tehdä mitään: nuoli siirtyy kuplan mukana ilman translatea.
        // Muissa tapauksissa täysi kompensaatio (nuoli pysyy ruutu-x:ssä p0Left, dev 0).
        const ptr = e.querySelector(':scope > .chat-bubble > .pointer') || e.querySelector('.pointer');
        if (ptr) {
          const kpl = e.querySelector(':scope > .chat-bubble') || e;
          const zb = kpl.currentCSSZoom || parseFloat(getComputedStyle(kpl).zoom) || 1;
          const p0Left = ptr.getBoundingClientRect().left;
          const ui = e.querySelector('.user-image') || (e.querySelector('.user-container') && e.querySelector('.user-container').offsetHeight > 0 ? e.querySelector('.user-container') : null);
          const uiR = (ui && ui.getBoundingClientRect().width > 0) ? ui.getBoundingClientRect().right : null;
          const minLeft = uiR !== null ? (uiR + dxCeil) : (kpl.getBoundingClientRect().left + dxCeil + 3 * zb);
          if (p0Left < minLeft) {
            ptr.style.translate = '';
          } else {
            ptr.style.translate = `${-dxCeil / zb}px 0`;
          }
        }
        e.setAttribute('data-kp-rt-siirretty', '');
        e.style.translate = `${dxCeil}px 0`;
        siirretyt.push(e);
        esteet.push({ left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom });
      }
    }
    if (topVahti) { try { topVahti.takeRecords(); } catch (e) {} }
  };

  const yli = ev => {
    // 1.9.0 (kp 03:28 'molempiin historioihin'): live chat, yläveto (.chat-pulldown-bubble) ja historiaikkuna käyttävät
    // samaa rakennetta .bubble-container > .chat-bubble + .chat-reply-button (ChatHistoryPulldownView.tsx:161, ChatHistoryView.tsx:184)
    const kupla = ev.target.closest && ev.target.closest('.bubble-container');
    if (kupla === auki) return;
    palauta();
    if (!kupla || kupla.classList.contains('invisible') || kupla.classList.contains('chat-pulldown-measure') || !kupla.querySelector(':scope > .chat-reply-button')) return;
    auki = kupla;
    // 1.28.0: kuplan leveys ennen mitään muutosta (ennen lukkoa): laite-px:inä 1/64:n tarkkuudella (layoutin oma arvo), + 1/1024 laite-px
    // ettei float-virhe pyöristä alemmalle 1/64:lle, ja takaisin kuplan omiin px:eihin (zoom * devicePixelRatio, ks. tasaaVali)
    { const b0 = kupla.querySelector(':scope > .chat-bubble'); if (b0) { const dpr = window.devicePixelRatio || 1, Z0 = (b0.currentCSSZoom || parseFloat(getComputedStyle(b0).zoom) || 1) * dpr;
      b0.style.setProperty('--kp-rt-lev0', ((Math.round(b0.getBoundingClientRect().width * dpr * 64) / 64 + 1 / 1024) / Z0) + 'px'); } }
    const vali0 = mittaaVali(kupla, kupla.querySelector(':scope > .chat-bubble')); // ks. mittaaVali: ennen mitään muutosta
    // 1.19.0 (kp 05:45 'kuplat nyt pari kertaa pompannu oudosti hoveratessa · liittyy replyyn'): live-kuplan kontilla on clientin
    // ResizeObserver (ChatWidgetMessageView.tsx:98-120), joka keskittää kuplan uudelleen ja nostaa sitä aina kun kontin offsetWidth
    // tai offsetHeight kasvaa, eikä palauta. Hoverin levennys/korostus ei siis saa muuttaa kontin mitattua kokoa: lukitaan se
    // hoverin ajaksi (näkyvä kupla saa yhä levitä kontin yli).
    // 1.25.0 (kp 06:30 'ylävetohistoria ei' + kuva: hoveroitu ylävetokupla rivittyi ja siirtyi): ylävedon kontti on absolute + left ja sen
    // leveys mitataan layoutissa (ChatHistoryPulldownView.tsx:430), joten sekin lukitaan ja levenee negatiivisella marginilla kuten live
    if (kupla.parentElement && (kupla.parentElement.matches('.nitro-chat-widget') || kupla.matches('.chat-pulldown-bubble'))) {
      // tarkka (murto-osainen) laskettu koko, ei pyöristettyä offsetWidthia: pyöristys alaspäin kavensi kuplaa ja rivitti tekstin
      // 1.28.0 (robo 09:5x: lukittu kontti oli 1/72 px matalampi kuin vapaana): laskettu arvo on merkkijono muutaman desimaalin tarkkuudella,
      // ja layout katkaisi sen alemmalle 1/64 laite-px:lle. Pyöristetään laite-px:inä (zoom * devicePixelRatio) lähimpään 1/64:aan + 1/1024.
      const cs = getComputedStyle(kupla), b = cs.boxSizing, Zk = (kupla.currentCSSZoom || 1) * (window.devicePixelRatio || 1);
      const tarkka = v => ((Math.round(parseFloat(v) * Zk * 64) / 64 + 1 / 1024) / Zk) + 'px', w = tarkka(cs.width), h = tarkka(cs.height);
      kupla.style.boxSizing = b; kupla.style.width = w; kupla.style.height = h; kupla.setAttribute('data-kp-rt-lukko', '');
    }
    // kp 02:52 'et saa viedä tilaa tekstiltä': max-width kasvaa saman verran kuin padding, joten teksti rivittyy kuten ennen
    const kpl = kupla.querySelector(':scope > .chat-bubble');
    if (kpl) {
      const c = getComputedStyle(kpl);
      kpl.style.setProperty('--kp-rt-src', c.borderImageSource); kpl.style.setProperty('--kp-rt-slice', c.borderImageSlice);
      kpl.style.setProperty('--kp-rt-w', c.borderImageWidth); { // outset: 1-4 arvoa; px sellaisenaan, yksikötön = border-image-widthin kerroin
        const o = (c.borderImageOutset.match(/[\d.]+(px)?/g) || ['0']), bw = c.borderImageWidth.match(/[\d.]+/g) || ['0'];
        const px = (v, i) => v.endsWith('px') ? parseFloat(v) : parseFloat(v) * parseFloat(bw[i] ?? bw[i % 2] ?? bw[0]);
        const t = o[0], r = o[1] ?? t, b = o[2] ?? t, l = o[3] ?? r;
        [['ot', t], ['or', r], ['ob', b], ['ol', l]].forEach(([k, v], i) => kupla.style.setProperty('--kp-rt-' + k, px(v, i) + 'px')); // kontille: nappi (sisar) perii myös
        ['ot', 'or', 'ob', 'ol'].forEach(k => kpl.style.removeProperty('--kp-rt-' + k)); // 1.10:n jäänteet kuplasta
      }
      merkitseTumma(kupla, c.borderImageSource, c.borderImageSlice, c.borderImageWidth);
    }
    // historiaikkunan maxWidth on '100%': sitä ei kasvateta (vain px-arvot)
    const sis0 = kupla.querySelector('.chat-content'), pr0 = sis0 ? parseFloat(getComputedStyle(sis0).paddingRight) || 0 : 0;
    const live = !!(kupla.parentElement && kupla.parentElement.matches('.nitro-chat-widget') && !kupla.matches('.chat-pulldown-bubble'));
    if (live || kupla.matches('.chat-pulldown-bubble')) kupla.setAttribute('data-kp-rt-live', ''); else kupla.removeAttribute('data-kp-rt-live');
    // 1.28.0: oletuspadding on 6 + LEVEYS, joten max-width kasvaa sen verran kuin padding oikeasti kasvaa (pr0 ei ole aina 6)
    if (kpl && /px$/.test(kpl.style.maxWidth)) { leveys = [kpl, kpl.style.maxWidth]; kpl.style.maxWidth = (parseFloat(kpl.style.maxWidth) + 6 + LEVEYS - pr0) + 'px'; }
    kupla.setAttribute('data-kp-rt-auki', '');
    if (kpl) tasaaVali(kupla, kpl, pr0, vali0);
    // tekstialueen keskikohta - kuplalaatikon keskikohta (css px): nuoli tekstirivin korkeudelle
    if (kpl && sis0) { const cs = getComputedStyle(sis0), a = sis0.getBoundingClientRect(), b = kpl.getBoundingClientRect(), z = b.height / (kpl.offsetHeight || 1);
      const tk = (a.top + a.bottom) / 2 + (parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * z / 2;
      kupla.style.setProperty('--kp-rt-dy', ((tk - (b.top + b.bottom) / 2) / z) + 'px'); }
    // 1.32.2 (B45, kp 9.11. 02:49 'ylävetohistoriassa ei tee samaa · siis ei osaa väistää'):
    // naapurien siirto live-chatissa ja ylävetohistoriassa (.chat-pulldown-bubble), jossa kuplat voivat olla vierekkäin samalla rivillä
    if (live || kupla.matches('.chat-pulldown-bubble')) tyonna(kupla);
  };
  const ulos = ev => { if (auki && !(ev.relatedTarget && auki.contains(ev.relatedTarget))) palauta(); };

  document.addEventListener('mouseover', yli, true);
  document.addEventListener('mouseout', ulos, true);

  // 1.29.0 (B41, kp 15:58 'positio pomppii ku zoomaa ja sit drag huonet tos ylävetopaneelis'): live-clientistä puuttuu PR 863:n
  // (2b791ac2) ylävedon ruutu-px- ja ROOM_ZOOMED-korjaus: GetRoomCanvasPanX lukee getRoomInstanceRenderingCanvasOffsetin (jota
  // RoomZoomController ei skaalaa shrink-kertoimella G), x0e ei skaalaa puhujan huone-x:ää (bubbleRoomX) zoomin mukaan, eikä
  // ChatHistoryPulldownView kuuntele RME_ROOM_ZOOMED-tapahtumaa (layoutPanXRef jää vanhaan paniin ja pomppaa vedon alussa).
  const muokatutRivit = new Set();
  let paikkaEngine = null, alkuOffset = null, omaOffset = false, zoomKuuntelija = null, zoomAjastin = 0, asennusAjastin = 0;
  const haeNakyma = (e, r) => {
    const c = e && typeof e.getRoomInstanceRenderingCanvas === 'function' ? e.getRoomInstanceRenderingCanvas(r, 1) : null;
    if (!c || !(c.scale > 0) || !Number.isFinite(c.width) || !Number.isFinite(c.screenOffsetX)) return null;
    const gs = typeof e.getRoomInstanceRenderingCanvasScale === 'function' ? e.getRoomInstanceRenderingCanvasScale(r, 1) : c.scale;
    const n = gs / c.scale, G = Number.isFinite(n) && n > 0 && n <= 1.000001 ? n : 1;
    return { c, G, scale: c.scale * G, width: c.width * G, offsetX: c.screenOffsetX * G };
  };
  const synkkaaYlaveto = r => {
    try {
      const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
      if (!e || !(r > 0)) return;
      const v = haeNakyma(e, r);
      if (!v) return;
      const w = document.querySelector('.nitro-chat-widget');
      if (!w) return;
      const fk = Object.keys(w).find(k => k.startsWith('__reactFiber'));
      const wf = fk ? w[fk] : null;
      if (!wf) return;
      // Kopioi live-kuplien (bHe A.current) tarkka roomX niiden historyEntryyn
      for (let p = wf.return; p; p = p.return) {
        for (let s = p.memoizedState; s; s = s.next) {
          const cur = s.memoizedState && s.memoizedState.current;
          if (Array.isArray(cur) && cur.length && cur[0] && 'historyEntry' in cur[0]) {
            for (const m of cur) if (m && m.historyEntry && Number.isFinite(m.roomX) && !Number.isFinite(m.historyEntry.bubbleRoomX)) {
              m.historyEntry.bubbleRoomX = m.roomX;
            }
          }
        }
        if (p.sibling) break;
      }
      const fhe = wf.sibling;
      if (!fhe) return;
      const sess = e._roomSessionManager && e._roomSessionManager.getSession ? e._roomSessionManager.getSession(r) : null;
      const udm = sess && sess.userDataManager;
      for (let s = fhe.memoizedState; s; s = s.next) {
        const cur = s.memoizedState && s.memoizedState.current;
        if (!Array.isArray(cur) || !cur.length || !(cur[0] && typeof cur[0] === 'object' && 'roomId' in cur[0] && 'message' in cur[0])) continue;
        for (const we of cur) {
          if (!we || we.roomId !== r) continue;
          if (!('_kpOrigBubbleX' in we)) { we._kpOrigBubbleX = we.bubbleX; we._kpOrigCanvasWidth = we.bubbleCanvasWidth; muokatutRivit.add(we); }
          if (!Number.isFinite(we.bubbleRoomX)) {
            const u = udm && typeof we.entityId === 'number' && we.entityId >= 0 ? udm.getUserDataByIndex(we.entityId) : null;
            const loc = u && u.name === we.name && typeof e.getRoomObjectScreenLocation === 'function' ? e.getRoomObjectScreenLocation(r, we.entityId, 100) : null;
            if (loc && Number.isFinite(loc.x)) we.bubbleRoomX = (loc.x - v.width / 2 - v.offsetX) / v.scale;
            else if (Number.isFinite(we._kpOrigBubbleX)) {
              const cw = Number.isFinite(we._kpOrigCanvasWidth) && we._kpOrigCanvasWidth > 0 ? we._kpOrigCanvasWidth : v.width;
              we.bubbleRoomX = we._kpOrigBubbleX - cw / 2;
            }
          }
          if (Number.isFinite(we.bubbleRoomX)) {
            we.bubbleCanvasWidth = v.c.width;
            we.bubbleX = we.bubbleRoomX * v.scale + v.width / 2;
          }
        }
        break;
      }
    } catch (err) {}
  };
  const laukaiseYlavetoLayout = () => {
    const r = window.NitroDevTools && window.NitroDevTools.roomEngine && window.NitroDevTools.roomEngine.activeRoomId;
    if (r > 0) synkkaaYlaveto(r);
    // ÄLÄ laukaise window 'resize'-tapahtumaa: RoomZoomControllerin reapplyShrink kuuntelee sitä ja shrink-tilassa (G < 1)
    // kasvattaa c._widthin moninkertaiseksi. Kutsutaan fHe:n omaa setDragTick(v => v + 1) (sama kuin PR 863:n ROOM_ZOOMED).
    const w = document.querySelector('.nitro-chat-widget');
    if (w) {
      const fk = Object.keys(w).find(k => k.startsWith('__reactFiber'));
      const fhe = fk && w[fk] ? w[fk].sibling : null;
      if (fhe) {
        for (let s = fhe.memoizedState; s; s = s.next) {
          if (typeof s.memoizedState === 'boolean' && s.next && s.next.memoizedState === r && s.next.next && s.next.next.queue && typeof s.next.next.queue.dispatch === 'function') {
            try { s.next.next.queue.dispatch(v => v + 1); } catch (e) {}
            break;
          }
        }
      }
    }
    const cv = document.querySelector('.chat-pulldown-canvas');
    if (cv) {
      const img = document.createElement('img');
      cv.appendChild(img);
      img.dispatchEvent(new Event('load'));
      img.remove();
    }
  };
  const asennaYlavetoB41 = () => {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
    if (!e || typeof e.getRoomInstanceRenderingCanvasOffset !== 'function') return false;
    if (paikkaEngine === e) return true;
    paikkaEngine = e;
    omaOffset = Object.prototype.hasOwnProperty.call(e, 'getRoomInstanceRenderingCanvasOffset');
    alkuOffset = e.getRoomInstanceRenderingCanvasOffset;
    e.getRoomInstanceRenderingCanvasOffset = function (roomId, canvasId = -1) {
      const cid = canvasId === -1 ? this._activeRoomActiveCanvas : canvasId;
      const oma = cid === 1 && (roomId === undefined || roomId === this.activeRoomId);
      if (oma) synkkaaYlaveto(roomId ?? this.activeRoomId);
      const pt = alkuOffset.call(this, roomId, canvasId);
      if (pt && oma) {
        const v = haeNakyma(this, roomId ?? this.activeRoomId);
        if (v && v.G !== 1) { pt.x *= v.G; pt.y *= v.G; }
      }
      return pt;
    };
    if (e.events && typeof e.events.addEventListener === 'function') {
      zoomKuuntelija = ev => {
        if (!ev || (ev.roomId !== e.activeRoomId)) return;
        synkkaaYlaveto(ev.roomId);
        if (!document.querySelector('.nitro-chat-widget.chat-pulldown-open')) return;
        laukaiseYlavetoLayout();
        clearTimeout(zoomAjastin);
        zoomAjastin = setTimeout(laukaiseYlavetoLayout, 180);
      };
      e.events.addEventListener('REE_ROOM_ZOOMED', zoomKuuntelija);
    }
    if (e.activeRoomId > 0) synkkaaYlaveto(e.activeRoomId);
    return true;
  };
  // 1.31.0 (R1, orkesteri 8.11. ~21:30): Seuraa live-kuplien siirtymistä uusien kuplien saapuessa.
  // Jos hoveroitu kupla on auki ja jonkin live-kuplan style.top päivittyy, ajetaan tyonna(auki)
  // uudelleen, jotta siirretyt naapurit vapautuvat tai pysyvät siirrettyinä.
  // R1-KORJAUS: Seurataan vain style.top -muutoksia (attributeOldValue: true). tyonna(auki) asettaa
  // naapurille style.translate ja data-kp-rt-siirretty: jos observer reagoi kaikkiin style-muutoksiin,
  // tyonna(auki) kutsuu itseään loputtomassa mikrotehtäväsilmukassa (freeze).
  const extractTop = str => {
    if (!str) return null;
    const m = /(?:^|;\s*)top:\s*([^;]+)/.exec(str);
    return m ? m[1].trim() : null;
  };
  let topVahti = null;
  const asennaTopVahti = () => {
    const w = document.querySelector('.nitro-chat-widget');
    if (!w || topVahti) return;
    topVahti = new MutationObserver(muts => {
      if (!auki || !auki.parentElement || !auki.parentElement.matches('.nitro-chat-widget') || auki.matches('.chat-pulldown-bubble')) return;
      let muuttui = false;
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'style' && m.target && m.target.matches && m.target.matches('.bubble-container')) {
          const vTop = parseFloat(extractTop(m.oldValue));
          const uTop = parseFloat(m.target.style.top);
          if (Number.isFinite(uTop) && (!Number.isFinite(vTop) || Math.abs(uTop - vTop) > 0.05)) {
            muuttui = true;
            break;
          }
        }
      }
      if (muuttui) tyonna(auki);
    });
    topVahti.observe(w, { attributes: true, subtree: true, attributeFilter: ['style'], attributeOldValue: true });
  };
  asennaTopVahti();

  if (!asennaYlavetoB41()) asennusAjastin = setInterval(() => { if (asennaYlavetoB41()) { clearInterval(asennusAjastin); asennusAjastin = 0; } }, 250);

  window.__kuplaReplyTabi = { versio: VERSIO, pois() {
    document.removeEventListener('mouseover', yli, true);
    document.removeEventListener('mouseout', ulos, true);
    if (topVahti) { topVahti.disconnect(); topVahti = null; }
    if (asennusAjastin) { clearInterval(asennusAjastin); asennusAjastin = 0; }
    clearTimeout(zoomAjastin);
    if (paikkaEngine) {
      if (zoomKuuntelija && paikkaEngine.events && typeof paikkaEngine.events.removeEventListener === 'function') {
        try { paikkaEngine.events.removeEventListener('REE_ROOM_ZOOMED', zoomKuuntelija); } catch (e) {}
      }
      if (alkuOffset) {
        if (omaOffset) paikkaEngine.getRoomInstanceRenderingCanvasOffset = alkuOffset;
        else delete paikkaEngine.getRoomInstanceRenderingCanvasOffset;
      }
      paikkaEngine = null; alkuOffset = null; zoomKuuntelija = null;
    }
    for (const we of muokatutRivit) {
      if ('_kpOrigBubbleX' in we) { we.bubbleX = we._kpOrigBubbleX; delete we._kpOrigBubbleX; }
      if ('_kpOrigCanvasWidth' in we) { we.bubbleCanvasWidth = we._kpOrigCanvasWidth; delete we._kpOrigCanvasWidth; }
    }
    muokatutRivit.clear();
    palauta(); tyyli.remove(); delete window.__kuplaReplyTabi;
  } };
})();
