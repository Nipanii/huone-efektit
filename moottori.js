// ==UserScript==
// @name         Huoneskriptit (moottori)
// @version      0.7.0
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
// Chat-komennot :pussi ja :showrooms (0.7.0, kp 29.10. 15:0x): ks. koodi, "Chat-komento :hw<N>" -osion jälkeen. Samalla kaappauksella ja
//   samalla sallittu-id-listalla kuin :hw<N>. :pussi N = pussin ulkonäkö (hs.pussiVariantti → kupla683.variantti), :pussi N NIMI = kuiskaus
//   NIMI:lle jonka moottori vastaanottajalla nielee ja toteuttaa, :showrooms = piilotetut huonealueet näkyviin (hs.naytaPiilot).
// Konsolissa: huoneskriptit.ajossa (mitä ajetaan) · huoneskriptit.loki · huoneskriptit.paivita(true) (hae ja käynnistä uudelleen)
(() => {
  const hs = { versio: '0.7.0', huone: 0, ajossa: new Map(), loki: [], pysaytetty: false };   // versio: myös 0.4.x:n itsepäivitys lukee tämän
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
    // 0.7.0: moottorin itsepäivitys ei saa nollata :pussi / :showrooms -valintoja (muistissa vain selainistunnon ajan)
    if (ed.pussiVariantti != null) hs.pussiVariantti = ed.pussiVariantti;
    if (ed.naytaPiilot) hs.naytaPiilot = true;
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
    if (hs.vastaanottoKytke) hs.vastaanottoKytke();   // 0.7.0: :pussi-kuiskauksen vastaanotto, jos yhteys ei ollut vielä valmis latauksessa
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
  // Chat-komennot (0.7.0): yksi kaappaus, komentotaulukko. :hw<N> käyttäytyy täsmälleen kuten ennen; :pussi ja :showrooms käyttävät samaa
  //   kaappausta, kenttää, tyhjennystä ja sallittu-id-tarkistusta (HW.sallitut), joten uutta kaappausta ei ole. Muille käyttäjille rivi menee chattiin kuten ennen.
  const PUSSI_KOMENTO = /^:pussi\s*(\d+)(?:\s+(\S+))?$/i, NAYTA_KOMENTO = /^:showrooms$/i, PUSSI_VIESTI = /^:pussi\s*(\d+)$/i;
  const KOMENNOT = [
    { re: HW_KOMENTO, aja: (rivi) => {
      const t = hs.hwKomento(rivi); merkitse({ hw: rivi, tulos: JSON.stringify(t) });
      hwIlmoita(t && t.ok ? (t.huone === HW.huoneet[0] ? 'Halloween-lobby -> huone ' : 'Halloween-rata -> huone ') + t.huone : 'Halloween-rata: ' + (t && t.syy)); } },
    { re: PUSSI_KOMENTO, aja: (rivi) => { const m = PUSSI_KOMENTO.exec(rivi), n = Number(m[1]);
      if (m[2]) { const t = hs.pussiLahetaMuille(n, m[2]); merkitse({ pussi: rivi, tulos: JSON.stringify(t) }); hwIlmoita(t.ok ? 'Pussi: vaihtoehto ' + n + ' -> ' + m[2] : 'Pussi: ' + t.syy); }
      else { hs.pussiAseta(n); merkitse({ pussi: rivi }); hwIlmoita('Pussi: vaihtoehto ' + n); } } },
    { re: NAYTA_KOMENTO, aja: (rivi) => { const v = hs.naytaPiilotVaihda(); merkitse({ showrooms: rivi, naytaPiilot: v }); hwIlmoita(v ? 'Piilohuoneet: näkyvissä' : 'Piilohuoneet: piilossa'); } },
  ];
  const hwKuule = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
    const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(HW_KENTTA)) return;
    const rivi = (el.value || '').trim(); const k = KOMENNOT.find(x => x.re.test(rivi)); if (!k || !HW.sallitut.includes(omaId())) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
    try { k.aja(rivi); } catch (x) { merkitse({ komentoVirhe: rivi, viesti: String(x) }); hwIlmoita('Komento epäonnistui: ' + x); }
  };
  addEventListener('keydown', hwKuule, true);

  // :pussi (0.7.0, kp 29.10. 15:0x): pussin ulkonäkövaihtoehto huoneeseen 683. Arvo vain muistissa (hs.pussiVariantti = window.huoneskriptit.pussiVariantti,
  //   ei localStorageen), joten se pätee kun 683:een tullaan myöhemmin: 250 ms ajastin syöttää sen window.kupla683.variantti(N):lle aina kun
  //   kupla683 on uusi tai arvo muuttui. 683.js:ää ei muokata; kupla683.variantti puuttuessa vain muistetaan.
  hs.pussiVariantti = hs.pussiVariantti == null ? null : hs.pussiVariantti;
  const PUSSI = hs.pussi = { sovellettu: null, sovellettuArvo: null };
  PUSSI.sovella = () => { const t = window.kupla683, n = hs.pussiVariantti;
    if (n == null || !t || typeof t.variantti !== 'function') return false;
    if (PUSSI.sovellettu === t && PUSSI.sovellettuArvo === n) return false;
    PUSSI.sovellettu = t; PUSSI.sovellettuArvo = n; try { t.variantti(n); } catch (x) { merkitse({ pussi: 'variantti() kaatui', viesti: String(x) }); } return true; };
  hs.pussiAseta = (n) => { hs.pussiVariantti = Number(n); PUSSI.sovella(); return hs.pussiVariantti; };

  // :pussi N NIMI -> toiselle pelaajalle. Lähetys = pelin oma RoomSession.sendWhisperMessage(nimi, teksti, tyyli) (Nitro_Render_V3 session/RoomSession.ts:89-92,
  //   sama jota DarkUI useChatInputWidget.ts:258 kutsuu), ei käsin rakennettua pakettia. Teksti on pelkkä markkeri ":pussi N".
  //   Vastaanotto: pelin chat-viesti kulkee SocketConnection.handleMessages(...) → message.callBack (SocketConnection.ts:1141-1152) → sekä chat-kupla
  //   (RoomChatHandler.ts:14,42) että huonemoottorin suu/ele (RoomMessageHandler.ts:130). Moottori kääriytyy handleMessagesiin täsmälleen kuten
  //   huoneet/682.js:149-170 (toimiva ennakkotapaus: "niellään vain se yksi viesti"), jolloin markkeri-viesti ei koskaan saavu kumpaankaan = ei kuplaa.
  //   Vain sallitun lähettäjän (id roomIndexistä: session.userDataManager.getUserDataByIndex(i).webID) markkeri nielaistaan ja toteutetaan; muiden
  //   saman näköinen viesti menee läpi tavallisena puheena. Omasta kaiusta (palvelin kaiuttaa kuiskauksen lähettäjälle) nielaistaan, ei toteuteta uudestaan.
  //   RAJOITE: kuiskaus/puhe/huuto jakavat saman parserin eikä luokkanimeä voi lukea (minifioituu), joten myös sallitun julkinen ":pussi N" nielaistaisiin.
  const lahettajaId = (indeksi) => { const e = window.NitroDevTools && window.NitroDevTools.roomEngine, sm = e && dvh(e, '_roomSessionManager'), s = sm && sm.getSession && sm.getSession(hs.huone);
    const u = s && s.userDataManager && s.userDataManager.getUserDataByIndex && s.userDataManager.getUserDataByIndex(indeksi); return u ? { id: Number(u.webID) || 0, nimi: String(u.name || '') } : null; };
  hs.pussiLahetaMuille = (n, nimi) => { const id = omaId(); if (!HW.sallitut.includes(id)) return { ok: false, syy: 'ei oikeutta', id };
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine, sm = e && dvh(e, '_roomSessionManager'), s = sm && sm.getSession && sm.getSession(hs.huone);
    if (!s || typeof s.sendWhisperMessage !== 'function') return { ok: false, syy: 'ei huonetta / sendWhisperMessage puuttuu', id };
    s.sendWhisperMessage(String(nimi), ':pussi ' + Number(n), 0); return { ok: true, id, nimi: String(nimi) }; };
  // Vastaanotto, erillään kääreestä testattavaksi: palauttaa true = nielaise viesti.
  hs.pussiViesti = (p) => { if (!p || typeof p.message !== 'string' || typeof p.roomIndex !== 'number') return false;
    const m = PUSSI_VIESTI.exec(p.message.trim()); if (!m) return false;
    const l = lahettajaId(p.roomIndex); if (!l || !HW.sallitut.includes(l.id)) return false;
    if (l.id === omaId()) return true;   // oma kaiku
    hs.pussiAseta(Number(m[1])); merkitse({ pussi: 'vastaanotettu', n: Number(m[1]), lahettaja: l.nimi });
    hwIlmoita('Pussi: vaihtoehto ' + m[1] + ' (lähetti ' + l.nimi + ')'); return true; };
  const yhteysEtsi = () => { const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return null; const nahty = new Set(); let c = null;
    const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
      if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
    etsi(dvh(e, '_roomSessionManager'), 0); return c; };
  const VASTAANOTTO = hs.vastaanotto = { yhteys: null, alkup: null, oma: null };
  hs.vastaanottoKytke = () => { try { const c = yhteysEtsi(); if (!c || typeof c.handleMessages !== 'function' || VASTAANOTTO.yhteys === c) return !!c;
    const alkup = c.handleMessages, oma = function (...viestit) {
      if (!hs.pysaytetty && window.huoneskriptit === hs) { try { viestit = viestit.filter(v => !(v && hs.pussiViesti(v.parser))); if (!viestit.length) return; } catch (x) {} }
      return alkup.apply(this, viestit); };
    c.handleMessages = oma; VASTAANOTTO.yhteys = c; VASTAANOTTO.alkup = alkup; VASTAANOTTO.oma = oma; return true; } catch (x) { return false; } };
  hs.vastaanottoPura = () => { const c = VASTAANOTTO.yhteys; if (c && c.handleMessages === VASTAANOTTO.oma) c.handleMessages = VASTAANOTTO.alkup; VASTAANOTTO.yhteys = null; };

  // :showrooms (0.7.0, kp 29.10. 15:0x): piilotetut huonealueet näkyviin omalla koneella testausta varten. Moottori vain pitää lipun ja kertoo siitä;
  //   huoneskripti päättää mitä "piilotettu alue" on (huoneet/682.js). Skriptit voivat lukea hs.naytaPiilot (kysely joka kierroksella) tai tilata
  //   hs.onNaytaPiilot(fn) (kutsutaan heti muutoksessa; palauttaa peruutusfunktion). Lisäksi window-tapahtuma 'huoneskriptit:naytaPiilot' {detail:{nakyvissa}}.
  hs.naytaPiilot = !!hs.naytaPiilot;
  const NAYTA_KUUNTELIJAT = hs._naytaKuuntelijat = new Set();
  hs.onNaytaPiilot = (fn) => { if (typeof fn !== 'function') return () => {}; NAYTA_KUUNTELIJAT.add(fn); return () => NAYTA_KUUNTELIJAT.delete(fn); };
  hs.naytaPiilotAseta = (v) => { hs.naytaPiilot = !!v;
    for (const f of [...NAYTA_KUUNTELIJAT]) try { f(hs.naytaPiilot); } catch (x) { merkitse({ virhe: 'naytaPiilot-kuuntelija', viesti: String(x) }); }
    try { if (typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('huoneskriptit:naytaPiilot', { detail: { nakyvissa: hs.naytaPiilot } })); } catch (x) {}
    return hs.naytaPiilot; };
  hs.naytaPiilotVaihda = () => hs.naytaPiilotAseta(!hs.naytaPiilot);
  hs._pussiAjastin = setInterval(() => { try { PUSSI.sovella(); } catch (x) {} }, 250);
  hs.vastaanottoKytke();

  // Oma hahmo (0.6.7, kp 29.10. 00:15 "Bibble ei näe itteään" · 00:24 "Korjaa se ongelma pysyvästi" · 00:34 "Vastaava bugi ei sit saa
  //   toistua kun tehdään loput huoneet"): huoneskripti ei saa koskaan piilottaa pelaajaa itseltään. 682.js mykisti oman hahmon
  //   (figure_is_muted IGNORED|HIDDEN) kun ownRoomIndex oli vielä -1, koska Daybreak voi lähettää hahmolistan ennen omaa käyttäjätietoa
  //   (IsOwnRoomUser.ts:14-17), eikä palauttanut sitä koskaan. Moottori valvoo tätä nyt kaikille skripteille, joten uusi huoneskripti
  //   ei voi toistaa virhettä: 250 ms välein, kun jokin skripti on ajossa, oman hahmon mykistysbitit nollataan ja visualisoinnin
  //   instanssikohtainen piilotusohitus (updateIgnoreHiddenState, kuten 682:n zombeilla) poistetaan, jolloin pelin oma
  //   AvatarVisualization.updateIgnoreHiddenState laskee näkyvyyden mallista seuraavassa ruudussa.
  //   hs.oma(huone) = oma huoneindeksi myös ennen ownRoomIndexiä (käyttäjä-id tai nimi kuten clientin IsOwnRoomUser), skripteille.
  //   hs.itse = { korjattu, viimeisin, tarkista } (todennus: tarkista() ajaa yhden kierroksen heti).
  //   TAHALLINEN PIILOTUS (0.6.8, kp 00:40 "jos toinen huone haluu piilottaa pelaajan?"): skripti joka OIKEASTI haluaa piilottaa
  //   pelaajan itseltään (näkymättömyys tms.) kutsuu huoneskriptit.itse.salli('<syy>') ennen piilotusta ja itse.kiella() kun loppuu.
  //   Lupa koskee vain sitä huonetta jossa se annettiin ja raukeaa itsestään huoneen vaihtuessa, ettei unohtunut lupa vuoda.
  const MYKKA = 6;   // ObjectAvatarMutedUpdateMessage IGNORED 2 | HIDDEN 4
  const omaArvo = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  hs.oma = (r) => { const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e || !(r > 0)) return null;
    const sm = omaArvo(e, '_roomSessionManager'), s = sm && sm.getSession && sm.getSession(r); if (!s) return null;
    const i = s.ownRoomIndex; if (i != null && i >= 0) return i;
    const ud = s.userDataManager, sd = omaArvo(e, '_sessionDataManager') || {}, id = Number(sd._userId || 0), nimi = String(sd._name || '').trim().toLowerCase();
    if (!ud || !ud.getUserDataByIndex || (!id && !nimi)) return null;
    for (const o of e.getRoomObjects(r, 100) || []) { const u = o && ud.getUserDataByIndex(o.id);
      if (u && ((id > 0 && Number(u.webID) === id) || (nimi && String(u.name || '').trim().toLowerCase() === nimi))) return o.id; }
    return null; };
  const ITSE = hs.itse = { korjattu: 0, viimeisin: null, sallittu: null };
  ITSE.salli = (syy) => { ITSE.sallittu = { huone: hs.huone, syy: String(syy || 'ei syytä'), aika: new Date().toTimeString().slice(0, 8) }; merkitse({ itse: 'piilotus sallittu', ...ITSE.sallittu }); };
  ITSE.kiella = () => { if (ITSE.sallittu) merkitse({ itse: 'piilotuslupa pois', huone: ITSE.sallittu.huone }); ITSE.sallittu = null; };
  ITSE.tarkista = () => { const r = hs.huone; if (hs.pysaytetty || !(r > 0) || !hs.ajossa.size) return false;
    if (ITSE.sallittu) { if (ITSE.sallittu.huone === r) return false; ITSE.sallittu = null; }
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine, i = hs.oma(r); if (!e || i == null) return false;
    const o = e.getRoomObject(r, i, 100); if (!o || !o.model) return false;
    let m = 0; try { m = o.model.getValue('figure_is_muted') || 0; } catch (x) {}
    const v = o.visualization, ohitus = !!v && Object.prototype.hasOwnProperty.call(v, 'updateIgnoreHiddenState');
    if (!(m & MYKKA) && !ohitus) return false;
    if (m & MYKKA) try { e.updateRoomObjectUserAction(r, i, 'figure_is_muted', m & ~MYKKA); } catch (x) {}
    if (ohitus) try { delete v.updateIgnoreHiddenState; for (const k of Object.keys(v)) if (k.startsWith('__piilo')) delete v[k]; } catch (x) {}
    ITSE.korjattu++; ITSE.viimeisin = { huone: r, indeksi: i, mykistys: m, ohitus, aika: new Date().toTimeString().slice(0, 8) };
    merkitse({ itse: 'oma hahmo palautettu näkyviin', huone: r, mykistys: m, ohitus, skriptit: [...hs.ajossa.keys()].join(' ') });
    // 0.6.9 (kp 29.10. 02:07 "Hahmo ei pysy piilossa ehkä kun lisäsit moottoriin hahmon epäpiilotuksen"): kaukoputki piilotti
    //   oman hahmon tahallaan ja tämä palautti sen 209 ms:ssa hiljaa. Ääneen, jotta seuraava törmäys näkyy konsolista heti.
    console.warn('[huoneskriptit] oma hahmo palautettu näkyviin huoneessa ' + r + ' (mykistys ' + m + (ohitus ? ', ohitus' : '') + '). Ajossa: '
      + [...hs.ajossa.keys()].join(', ') + '. Tahallinen piilotus: huoneskriptit.itse.salli("<syy>") ennen ja itse.kiella() jälkeen.');
    return true; };
  hs._itseAjastin = setInterval(() => { try { ITSE.tarkista(); } catch (x) {} }, 250);

  hs.pysayta = () => { hs.pysaytetty = true; clearInterval(hs._tiki); clearInterval(hs._itseAjastin); clearInterval(hs._pussiAjastin); if (hs.vastaanottoPura) hs.vastaanottoPura(); verhoPois('moottori pysäytetty'); if (hs._palauta) hs._palauta(); pysaytaKaikki(true); removeEventListener('keydown', hwKuule, true);
    if (window.huoneskriptit === hs) delete window.huoneskriptit; };
})();
