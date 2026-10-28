// ==UserScript==
// @name         Huoneskriptit (moottori)
// @version      0.6.6
// @match        https://kupla.cc/*
// @grant        none
// ==/UserScript==
// Moottori on pelkkä huoneskriptien LATAAJA. Siinä ei ole yhdenkään huoneen logiikkaa (kp 27.10. 17:04 "ne ei kuulu moottoriin",
// 17:05 "moottori piti olla se koodi joka loadaa scriptit"). Client (roomScripts.ts) hakee tämän tiedoston ja ajaa sen, jos
// // @version on uudempi kuin edellinen ajettu.
//
// Huoneeseen tullessa: hakee huoneet.json:n, ja jos huoneella on skriptejä, hakee ne ja ajaa: new Function('kupla', koodi)(api).
//   Sama sopimus kuin Resin Messenger-moottorissa (client/DarkUI/messenger-scripts/moottori.js), joten skriptit voi myöhemmin
//   siirtää sinne sellaisenaan. Skripti palauttaa funktion (tai olion jolla dispose()), jota kutsutaan kun huoneesta lähdetään.
// 15 s välein missä tahansa huoneessa: muuttunut tai huoneet.json:iin lisätty skripti käynnistetään (versiota ei tarvitse nostaa).
// 15 s välein aina: uudempi moottori (// @version) ajetaan tämän tilalle.
// Kaikissa huoneissa ajettavat (0.6.2, kp 28.10. 15:07 "tarjoillaan automaattisesti moottorin kautta"): huoneet.json:n ylätason "kaikki": { "skriptit": [polut] }.
//   Ne käynnistetään kerran (avain "*:polku"), huoneen vaihto ei pysäytä niitä, uudelleenkäynnistys vain kun haettu koodi muuttuu,
//   pysäytys kun polku poistuu listasta tai moottori pysähtyy. Moottori ei tiedä niistä mitään muuta: käyttäjälogiikka on skriptissä.
// Verho (0.6.5, I173, kp 28.10. 16:57:06 "verho VAIN huoneissa joilla on huoneskripti" · 16:57:15 myös lobby 656 · 17:50:22 "se piilotettu
//   alue kerkee tosin vilahtaa. verho ei toimi?"): huoneeseen jolla on huoneskriptejä tullessa musta verho pelin kanvaksen päälle (sama
//   paikka kuin 684:n pimeys, UI jää näkyviin) createRoomInstancessa ennen ensimmäistä ruutua. Pois kun skriptit on käynnistetty ja
//   huoneen furnien määrä on pysynyt samana VERHO.vakaa ms (skriptien omat ajastimet ehtivät käsitellä ne), aikaisintaan VERHO.min,
//   viimeistään VERHO.max. Furnit tulevat omana pakettinaan kartan jälkeen, siksi määrän vakaus eikä pelkkä skriptin käynnistys.
//   hs.verho.viimeisin = { huone, ms, syy } (todennus). Huoneet ilman skriptejä: ei verhoa.
// Esikatseluhuoneet (0.6.6, kp 28.10. 19:03 "huonescriptit ei saa feilaa"): pelin RoomPreviewer (katalogi, inventaario) luo oman
//   createRoomInstancen id:llä >= 0x7FFF0000. Moottori luuli sitä huoneen vaihdoksi: 682 pysähtyi 18:56:04 (huone 2147418113) ja
//   esikatselun sulkeutuessa huone oli 0, vaikka kp oli koko ajan 682:ssa. Nyt esikatselu-id:t ohitetaan, ja 15 s tiki korjaa
//   itsensä roomEngine.activeRoomId:stä (pelin oma, -1 kun sessio päättyy) jos huone on silti mennyt ristiin.
// Konsolissa: huoneskriptit.ajossa (mitä ajetaan) · huoneskriptit.loki · huoneskriptit.paivita(true) (hae ja käynnistä uudelleen)
(() => {
  const hs = { versio: '0.6.6', huone: 0, ajossa: new Map(), loki: [], pysaytetty: false };   // versio: myös 0.4.x:n itsepäivitys lukee tämän
  const POHJA = 'https://nipanii.github.io/huone-efektit/';
  const uudempi = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

  // 0.4.x-moottori (miinat moottorin sisällä) pysäytetään: sen ajastimet pois ja window.miina pois, jolloin sen koukut tyhjenevät.
  const m = window.miina; let vanhaPois = false;
  if (m && (m._ajastin || m.ajastin)) { clearInterval(m.ajastin); clearInterval(m._ajastin); clearInterval(m._paivitys); if (window.miina === m) delete window.miina; vanhaPois = true; }

  // Sama tai uudempi moottori jo ajossa -> ei toista kopiota (client ja 0.4.x:n itsepäivitys voivat ajaa saman version kahdesti).
  const ed = window.huoneskriptit;
  if (ed && ed.versio && !ed.pysaytetty) {
    if (!uudempi(hs.versio, ed.versio)) { if (vanhaPois && ed.paivita) ed.paivita(true); return; }
    try { ed.pysayta(); } catch (err) { console.warn('[huoneskriptit] edellisen moottorin pysäytys epäonnistui', err); }
  }
  window.huoneskriptit = hs;

  const hae = async (polku) => { const v = await fetch(POHJA + polku + '?t=' + Date.now(), { cache: 'no-store' });
    if (!v.ok) throw new Error('HTTP ' + v.status + ' ' + polku); return v.text(); };
  const merkitse = (rivi) => { rivi.aika = new Date().toTimeString().slice(0, 8); hs.loki.push(rivi); if (hs.loki.length > 200) hs.loki.shift(); };

  const pysaytaSkripti = (avain) => { const s = hs.ajossa.get(avain); if (!s) return; hs.ajossa.delete(avain);
    try { if (s.stop) s.stop(); merkitse({ pysaytetty: avain }); } catch (err) { console.warn('[huoneskriptit] ' + avain + ' pysäytys epäonnistui', err); } };
  const KAIKKI = '*:';   // avainetuliite huoneista riippumattomille skripteille
  const pysaytaKaikki = (myosKaikki) => { for (const k of [...hs.ajossa.keys()]) if (myosKaikki || !k.startsWith(KAIKKI)) pysaytaSkripti(k); };
  const kaynnista = (avain, koodi, r) => {   // r === null: huoneesta riippumaton ("kaikki")
    pysaytaSkripti(avain);
    let stop = null;
    const api = { roomId: r === null ? () => hs.huone : () => r, moottori: hs.versio };
    try { const t = new Function('kupla', koodi)(api);
      stop = typeof t === 'function' ? t : (t && typeof t.dispose === 'function') ? () => t.dispose() : null; merkitse({ kaynnistetty: avain }); }
    catch (err) { console.warn('[huoneskriptit] ' + avain + ' kaatui', err); merkitse({ virhe: avain, viesti: String(err) }); }
    hs.ajossa.set(avain, { koodi, stop });
  };

  // Muisti: huoneet.json ja KAIKKIEN huoneiden skriptit haetaan valmiiksi (käynnistyksessä ja 15 s välein), jotta huoneeseen
  //   tullessa skripti käynnistyy heti muistista eikä odota kahta peräkkäistä hakua (kp 28.10. 11:08 "huoneen kerkee näkeä ennen
  //   kuin se aktivoituu"). Muuttunut koodi tulee seuraavalla haulla ja käynnistyy uudelleen kuten ennenkin.
  let lista = null; const muisti = new Map();
  const haeKaikki = async () => {
    const l = JSON.parse(await hae('huoneet.json')), polut = new Set();
    for (const h of Object.values(l.huoneet || {})) for (const p of (h.skriptit || [])) polut.add(p);
    for (const p of ((l.kaikki || {}).skriptit || [])) polut.add(p);
    const koodit = await Promise.all([...polut].map(p => hae(p).then(k => [p, k], err => { merkitse({ virhe: 'haku ' + p, viesti: String(err) }); return null; })));
    for (const x of koodit) if (x) muisti.set(x[0], x[1]);
    lista = l;
  };
  const aja = (r, pakota) => {
    const polut = (((lista && lista.huoneet) || {})[String(r)] || {}).skriptit || [];
    const avaimet = new Set(polut.map(p => r + ':' + p));
    for (const k of [...hs.ajossa.keys()]) if (!k.startsWith(KAIKKI) && !avaimet.has(k)) pysaytaSkripti(k);
    for (const p of polut) {
      const koodi = muisti.get(p); if (koodi == null) continue;
      const k = r + ':' + p, nyt = hs.ajossa.get(k);
      if (!pakota && nyt && nyt.koodi === koodi) continue;
      kaynnista(k, koodi, r);
    }
  };

  // "kaikki"-skriptit: käynnistetään kerran, uudelleen vain kun koodi muuttuu; poistuneet pysäytetään. Huoneesta riippumaton.
  const ajaKaikki = () => {
    const polut = (((lista && lista.kaikki) || {}).skriptit || []);
    const avaimet = new Set(polut.map(p => KAIKKI + p));
    for (const k of [...hs.ajossa.keys()]) if (k.startsWith(KAIKKI) && !avaimet.has(k)) pysaytaSkripti(k);
    for (const p of polut) {
      const koodi = muisti.get(p); if (koodi == null) continue;
      const k = KAIKKI + p, nyt = hs.ajossa.get(k);
      if (nyt && nyt.koodi === koodi) continue;
      kaynnista(k, koodi, null);
    }
  };

  // Vain uusin haku saa käynnistää: huone voi vaihtua kesken haun, ja 15 s tiki voi osua huoneen vaihdon päälle.
  let kierros = 0;
  const paivita = hs.paivita = async (pakota) => {
    const oma = ++kierros, r = hs.huone, voimassa = () => oma === kierros && r === hs.huone && !hs.pysaytetty;
    try { await haeKaikki(); if (!hs.pysaytetty) ajaKaikki(); if (!voimassa() || r <= 0) return; aja(r, pakota); }
    catch (err) { console.warn('[huoneskriptit] haku epäonnistui', err); merkitse({ virhe: 'haku', viesti: String(err) }); }
  };

  // Huoneen vaihto (0.6.1): pelin oma RoomEngine.createRoomInstance laukaisee, ei kysely (kp 28.10. 11:11 "250ms on just liian
  //   hidas" · "etkä hookkaa jotain pelin omaa actionia triggeriks"). createRoomInstance ajetaan kun huoneen kartta saapuu, ennen
  //   kuin huonetta piirretään, joten muistissa oleva skripti on käynnissä ennen ensimmäistä ruutua. removeRoomInstance pysäyttää.
  //   hs.mitta = ms createRoomInstance-kutsusta skriptien käynnistykseen (todennus).
  const VERHO = hs.verho = { min: 400, vakaa: 400, max: 3000, viimeisin: null, _el: null, _ajastin: 0 };
  const verhoPois = (syy) => { clearInterval(VERHO._ajastin); VERHO._ajastin = 0; const el = VERHO._el; VERHO._el = null; if (!el) return;
    if (syy) VERHO.viimeisin = { huone: el._huone, ms: Math.round(performance.now() - el._t0), syy };
    el.style.opacity = '0'; setTimeout(() => el.remove(), 180); };
  const verhoPaalle = (r) => {
    verhoPois(null);
    const polut = (((lista && lista.huoneet) || {})[String(r)] || {}).skriptit || []; if (!polut.length) return;
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!cv || !cv.parentNode) return;
    const el = document.createElement('div'); el._huone = r; el._t0 = performance.now();
    el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1;background:#000;opacity:1;transition:opacity .15s';
    cv.parentNode.insertBefore(el, cv.nextSibling); VERHO._el = el;
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; let ed = -1, vakaaAlkaen = 0;
    VERHO._ajastin = setInterval(() => {
      const nyt = performance.now(), kulunut = nyt - el._t0;
      if (hs.huone !== r || VERHO._el !== el) return verhoPois('huone vaihtui');
      if (kulunut >= VERHO.max) return verhoPois('aikaraja');
      let n = 0; try { n = ((e && e.getRoomObjects(r, 10)) || []).length + ((e && e.getRoomObjects(r, 20)) || []).length; } catch (x) {}
      if (n !== ed) { ed = n; vakaaAlkaen = nyt; return; }
      const kaynnissa = polut.every(p => hs.ajossa.has(r + ':' + p) || !muisti.has(p));
      if (kaynnissa && kulunut >= VERHO.min && nyt - vakaaAlkaen >= VERHO.vakaa) verhoPois('valmis, furneja ' + n);
    }, 50);
  };
  const esikatselu = r => r >= 0x7FFF0000;   // RoomPreviewer-instanssit, ei oikea huone
  const vaihda = (r) => {
    const t0 = performance.now(); pysaytaKaikki(); hs.huone = r;
    if (r > 0) { try { verhoPaalle(r); } catch (err) {} } else verhoPois('huoneesta pois');
    if (r > 0) { if (lista) aja(r, true); hs.mitta = Math.round((performance.now() - t0) * 10) / 10; merkitse({ huone: r, muistista: !!lista, ms: hs.mitta }); paivita(false); }
  };
  const kytke = () => {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return false; if (hs._palauta) return true;
    const omaLuo = Object.prototype.hasOwnProperty.call(e, 'createRoomInstance'), omaPoista = Object.prototype.hasOwnProperty.call(e, 'removeRoomInstance');
    const luo = e.createRoomInstance, poista = e.removeRoomInstance;
    const uusiLuo = function (roomId) { const t = luo.apply(this, arguments); try { if (!hs.pysaytetty && !esikatselu(roomId)) vaihda(roomId); } catch (err) { console.warn('[huoneskriptit] huoneen vaihto', err); } return t; };
    const uusiPoista = function (roomId) { try { if (!hs.pysaytetty && roomId === hs.huone) vaihda(0); } catch (err) {} return poista.apply(this, arguments); };
    e.createRoomInstance = uusiLuo; e.removeRoomInstance = uusiPoista;
    hs._palauta = () => {   // vain jos kukaan ei ole kääriytynyt päälle
      if (e.createRoomInstance === uusiLuo) { if (omaLuo) e.createRoomInstance = luo; else delete e.createRoomInstance; }
      if (e.removeRoomInstance === uusiPoista) { if (omaPoista) e.removeRoomInstance = poista; else delete e.removeRoomInstance; }
    };
    const r = e.activeRoomId || 0; if (r > 0 && r !== hs.huone) vaihda(r);   // moottori ladattiin kesken huoneen
    return true;
  };
  if (!kytke()) merkitse({ virhe: 'koukku', viesti: 'roomEngine puuttui, yritetään 15 s välein' });
  haeKaikki().then(() => { if (hs.pysaytetty) return; ajaKaikki(); if (hs.huone > 0) aja(hs.huone, false); }, () => {});

  hs._tiki = setInterval(async () => {
    if (hs.pysaytetty) return;
    if (!kytke()) return;
    try { const a = window.NitroDevTools.roomEngine.activeRoomId; if (a > 0 && !esikatselu(a) && a !== hs.huone) { merkitse({ korjattu: 'huone ' + hs.huone + ' -> ' + a }); vaihda(a); } } catch (err) {}
    paivita(false);   // myös tyhjässä huoneessa: uusi huoneet.json-rivi käynnistyy ilman huoneen vaihtoa, ja muisti pysyy tuoreena
    try { const t = await hae('moottori.js'), v = ((t.match(/\/\/\s*@version\s+([^\r\n]+)/) || [])[1] || '').trim();
      if (v && !hs.pysaytetty && uudempi(v, hs.versio)) { const L = window.huoneEfektiLataaja; if (L) L.koodi = t; (0, eval)(t); console.info('[huoneskriptit] moottori päivitetty', v); } } catch (err) {}
  }, 15000);

  // Chat-komento :hw<N> (0.6.1, kp 28.10. 11:16): vie kp:n, Resin, sonan ja robon Halloween-radalle N. Toimii kaikissa huoneissa, joten kuuluu
  //   moottoriin eikä huoneskriptiin. Sama kaappaus kuin huoneet/684.js:70-86 (Enter ennen pelin käsittelijää, kenttä tyhjennetään,
  //   rivi ei lähde palvelimelle). Sallitut tarkistetaan käyttäjä-id:llä (_sessionDataManager._userId), ei nimellä; muille rivi menee chattiin kuten ennen.
  //   Siirto = pelin oma RoomSessionManager.createSession(huone[, salasana]), sama kuin DaybreakShell.tsx ja nitro/enter-room.js. Ei pakettia käsin.
  //   hs.hw.kuiva = true -> ei siirrä, vain palauttaa tuloksen (testi). Salasanat: hs.hw.salasanat[huone], EI kovakoodattuna (repo on julkinen).
  const HW = hs.hw = { huoneet: { 0: 656, 1: 650, 2: 681, 3: 682, 4: 683, 5: 684, 6: 685 }, sallitut: [1, 281, 282, 245], salasanat: {}, kuiva: false };   // 0.6.3: kaikki 6 rataa (navigaattorihaku owner:sona 28.10.) · 0.6.4: :hw0 = lobby 656 (kp 16:10:33 "lisää robo :hw0 sinne lobbyyn menoon")
  const HW_KOMENTO = /^:hw\s*(\d+)$/i, HW_KENTTA = 'input.nitro-chat-input-control';
  const dvh = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  const omaId = () => { const re = window.NitroDevTools && window.NitroDevTools.roomEngine, u = dvh(dvh(re, '_sessionDataManager'), '_userId'); return u > 0 ? u : 0; };
  const siirry = (n) => { const id = omaId(); if (!HW.sallitut.includes(id)) return { ok: false, syy: 'ei oikeutta', id };
    const r = HW.huoneet[n]; if (!r) return { ok: false, syy: 'rata ' + n + ': huonetta ei tiedossa', id };
    if (HW.kuiva) return { ok: true, kuiva: true, huone: r, id };
    const sm = dvh(window.NitroDevTools.roomEngine, '_roomSessionManager');
    if (!sm || typeof sm.createSession !== 'function') return { ok: false, syy: 'createSession puuttuu', id };
    sm.createSession(r, HW.salasanat[r] || null); return { ok: true, huone: r, id }; };
  const hwIlmoita = (teksti) => { const d = document.createElement('div'); d.textContent = teksti;
    d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
      + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
    document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100); };
  hs.hwKomento = (teksti) => { const m = HW_KOMENTO.exec(String(teksti || '').trim()); return m ? siirry(Number(m[1])) : null; };
  const hwKuule = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
    const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(HW_KENTTA)) return;
    const rivi = (el.value || '').trim(); if (!HW_KOMENTO.test(rivi) || !HW.sallitut.includes(omaId())) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    const t = hs.hwKomento(rivi); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
    merkitse({ hw: rivi, tulos: JSON.stringify(t) });
    hwIlmoita(t && t.ok ? (t.huone === HW.huoneet[0] ? 'Halloween-lobby -> huone ' : 'Halloween-rata -> huone ') + t.huone : 'Halloween-rata: ' + (t && t.syy));
  };
  addEventListener('keydown', hwKuule, true);

  hs.pysayta = () => { hs.pysaytetty = true; clearInterval(hs._tiki); verhoPois('moottori pysäytetty'); if (hs._palauta) hs._palauta(); pysaytaKaikki(true); removeEventListener('keydown', hwKuule, true);
    if (window.huoneskriptit === hs) delete window.huoneskriptit; };
})();
