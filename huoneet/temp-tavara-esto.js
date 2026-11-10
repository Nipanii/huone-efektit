// @version 1.0.0
// Kaikkien huoneiden hotfix (huoneet.json "kaikki"): väliaikaisen tavaran kopioita (negatiivinen esine-id) ei lunasteta eikä nosteta.
// MIKSI: wired-efektin väliaikaisilla kopioilla on palvelimella negatiivinen id ja niitä ei ole tietokannassa. Palvelin ei tarkista
//   lunastuksessa eikä nostossa id < 0 -ehtoa, joten kopion lunastus tai nosto inventaarioon antaa jotain tyhjästä (kp + Laatikko 10.11. 17:41).
// MITEN: kääritään clientin yhteyden send (sama tapa kuin huoneet/656.js) ja pudotetaan LÄHTEVÄ paketti, jonka kohde-id < 0:
//   3115 ITEM_EXCHANGE_REDEEM [itemId]            (palvelin: CreditFurniRedeemMessageEvent)
//   3456 FURNITURE_PICKUP     [category, objectId] (palvelin: PickupObjectMessageEvent)
//   10017 FURNITURE_PICKUP_ALL [n, ...objectIds]   negatiiviset id:t poistetaan listalta; jos mitään ei jää, paketti pudotetaan.
//   Id:t ja argumenttijärjestys: node D:/re-lab/nitro/composer-db.js 3115|3456|10017 ja kupla-cc client
//   FurnitureExchangeComposer.ts / FurniturePickupComposer.ts / FurniturePickupAllComposer.ts. Id > 0 kulkee koskematta.
// RAJA: tämä on VÄLIAIKAINEN. Se estää vain tavallisen clientin; itse lähetetty paketti ohittaa sen. Oikea korjaus on palvelimen plugin.
//   Ei kata :redeem-komentoa (chat-rivi) eikä vaihtoa, koska kopio ei pääse inventaarioon kun nosto on estetty.
// SIIVOUS: palautettu funktio palauttaa send:n jos kääreemme on yhä päällimmäisenä; muuten kääre jää läpikulkevaksi (aktiivinen=false).
if (window.__tempTavaraEsto) { try { window.__tempTavaraEsto.pois(); } catch (e) {} }
const tila = window.__tempTavaraEsto = { versio: '1.0.0', aktiivinen: true, pudotettu: 0, suodatettu: 0, yhteydet: 0, loki: [], pois() {} };
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };

const REDEEM = 3115, PICKUP = 3456, PICKUP_ALL = 10017;
const neg = v => typeof v === 'number' && v < 0;
// Puhdas päätös: palauttaa 'pudota', 'muutettu' tai 'ok'. PICKUP_ALL muokataan paikallaan (getMessageArray palauttaa composerin oman _data-taulukon).
const paata = tila.paata = (id, data) => {
  if (!Array.isArray(data)) return 'ok';
  if (id === REDEEM) return neg(data[0]) ? 'pudota' : 'ok';
  if (id === PICKUP) return neg(data[1]) ? 'pudota' : 'ok';
  if (id === PICKUP_ALL) {
    const ids = data.slice(1); if (!ids.some(neg)) return 'ok';
    const jaa = ids.filter(v => !neg(v)); if (!jaa.length) return 'pudota';
    data.length = 0; data.push(jaa.length, ...jaa); return 'muutettu';
  }
  return 'ok';
};

const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
const yhteys = () => {
  const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e0) return null;
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e0, '_roomSessionManager'), 0); return c;
};
const composerId = (c, x) => { try { const m = dv(c, '_messages');
  if (m && typeof m.getComposerId === 'function') return m.getComposerId(x);
  const k = dv(m, '_messageIdByComposer'); return k && typeof k.get === 'function' && x ? k.get(x.constructor) : undefined; } catch (e) { return undefined; } };

const kaaritty = [];   // { c, alkup, oma }
const kaari = c => {
  if (!c || typeof c.send !== 'function' || kaaritty.some(k => k.c === c)) return;
  const alkup = c.send;
  const oma = function (...k) {
    if (tila.aktiivinen) {
      try {
        k = k.filter(x => {
          const id = composerId(c, x); if (id !== REDEEM && id !== PICKUP && id !== PICKUP_ALL) return true;
          const p = paata(id, x && typeof x.getMessageArray === 'function' ? x.getMessageArray() : null);
          if (p === 'pudota') { tila.pudotettu++; loki('pudotettu ' + id); console.info('[temp-tavara-esto] väliaikaisen tavaran paketti ' + id + ' pudotettu'); return false; }
          if (p === 'muutettu') { tila.suodatettu++; loki('suodatettu ' + id); }
          return true;
        });
        if (!k.length) return true;
      } catch (e) { loki('virhe ' + e); }
    }
    return alkup.apply(this, k);
  };
  c.send = oma; kaaritty.push({ c, alkup, oma }); tila.yhteydet++; loki('kääritty yhteys #' + tila.yhteydet);
};
const tarkista = () => { if (tila.aktiivinen) kaari(yhteys()); };
const ajastin = setInterval(tarkista, 3000);   // yhteys voi syntyä vasta kirjautumisen jälkeen tai vaihtua uudelleenyhdistyksessä
tarkista();

tila.pois = () => {
  tila.aktiivinen = false; clearInterval(ajastin);
  for (const k of kaaritty) { try { if (k.c.send === k.oma) { if (k.alkup === Object.getPrototypeOf(k.c).send) delete k.c.send; else k.c.send = k.alkup; } } catch (e) {} }
  kaaritty.length = 0; if (window.__tempTavaraEsto === tila) delete window.__tempTavaraEsto;
};
return tila.pois;
