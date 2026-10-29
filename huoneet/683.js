// Huone 683 (Halloween rata 4/6): tyhjä pohja huonekohtaisille efekteille.
// kp 28.10. 16:02:08 "luo tyhjä pohja event huoneille joilla ei vielä ole". Wired-piilotus on erikseen huoneet/hween-wired.js.
// Moottori ajaa tämän new Function('kupla', koodi)(api) huoneeseen tullessa ja kutsuu palautettua funktiota kun huoneesta lähdetään.
//   kupla.roomId() = tämä huone. Mallit: huoneet/681.js (miinat), huoneet/684.js (pimeys), huoneet/656.js (auto).
//
// Sonan inventaario (kankainen pussi). sona 29.10. 14:31-14:32 "Tässä huoneessa on kankainen pussi. Se vois olla inventaario." · "tilaa vaikka 3
//   inventario itemille" · "pussista ei saada mitään, vaan pelaaja saa pussin itsessään joka on se inventario" · "Näkyisi vain tässä huoneessa
//   sen jälkeen kun on klikannut itemiä 'kankainen pussi'". Mitkä esineet pussiin menevät, päätetään myöhemmin -> tässä vain pussi, 3 paikkaa ja API.
//   - Klikkaus furniin PUSSI (REOE_SELECTED, kuten 682.js:487-489) = pelaaja "saa pussin": ruudun keskelle tulee tumma paneeli (pussin kuva + "Pussi"),
//     jossa 3 tyhjää paikkaa. Paneelin voi raahata otsikosta (sona 14:52:59); raahaus ei liikuta hahmoa. Furni jää huoneeseen (muutkin saavat oman pussinsa); mitään ei poisteta eikä lähetetä palvelimelle.
//   - Paneeli näkyy vain tässä huoneessa (moottori pysäyttää skriptin huoneesta lähtiessä, siivous poistaa paneelin) ja vain jos pussi on otettu.
//   - EI pysyvyyttä (sona 29.10. 14:42:21, kp:n kysymykseen "pitääkö esineiden pysyä inventoorissa jos käy huoneesta poissa?": "ei"): pussi ja
//     paikat ovat vain muistissa, huoneesta lähtiessä siivous nollaa kaiken ja huoneeseen tullessa pussi pitää ottaa uudestaan. Ei localStorageä.
//   - Pussin tunnistus: furni-id 444838 (sona Osoita "#osoita:r683:f444838"); varalle luokka hp_sack (FurnitureData "Kankainen pussi").
//   - Akku (sona 29.10. 14:42:56 "Sen jälkeen kun pussi on saatu. Pelaaja voi noutaa ambulanssiin astuessa akun."): kun oma hahmo astuu ambulanssin
//     (furni 434093) ruutuihin ja pussi on, tulee "Akku" pussiin (kuva easter_c23_battery_icon). Ilman pussia: ilmoitus "Tarvitset pussin ensin".
//     Ruudut luetaan joka tarkistuksessa huoneen objektista (sijainti, furniture_size_x/y, kierto); jos ei luettavissa, varafallback 5,15 1x1 ja console.warn kerran.
// Konsolissa / myöhemmille pulma-askelille: window.kupla683 =
//   .lisaa(nimi, kuvaUrl?)  ensimmäiseen vapaaseen paikkaan; palauttaa paikan (0-2), -1 jos täynnä; sama nimi uudestaan palauttaa vanhan paikan
//   .poista(nimi) true jos oli · .tavarat() [{nimi, kuva}] · .onPussi() · .anna() anna pussi (testi) · .nollaa() pussi ja tavarat pois · .loki
//   Tavarat voi lisätä myös ennen pussin ottoa (paneeli ei vielä näy). kuvaUrl vain http(s):// tai data:image/, muuten paikkaan tulee nimen alku.
// EPÄVARMAA LIVENÄ (vain offline-testattu): REOE_SELECTED ei ehkä laukea jos pussi on jo valittuna skriptin käynnistyessä (valitse jokin muu ja klikkaa
//   pussia uudestaan) · paneeli voi peittää pelin ikkunoita (raahattavissa) · z-index 1000 on arvaus pelin omien ikkunoiden suhteen · pussin kuva ja koko (2x) arvattu, ei mitattu.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

// ---- ASETUKSET. Pussin tunnistus: id ensisijainen, luokka varalle jos furni vaihtuu (nostettu ja laskettu uudelleen = uusi id).
const PUSSI = { id: 444838, tyyppi: 'hp_sack' };   // tyyppi = classname (FurnitureData id 29109676 "Kankainen pussi"); o.type on luokan nimi (656.js IKKUNA, hween-wired WIRED)
const AMBULANSSI = { id: 434093, x: 5, y: 15 };   // hween_c25_ambulance, lattiafurni. x,y = varafallback, oikea sijainti ja koko luetaan huoneen objektista
const AMBULANSSI_VALI = 250;                      // ms, oman hahmon ruudun tarkistus
const AKKU = 'Akku', AKKU_KUVA = 'https://kupla.cc/swf/dcr/hof_furni/icons/easter_c23_battery_icon.png';
const PAIKKOJA = 3;
const PANEELI = { z: 1000 };   // keskellä ruutua kun pussi otetaan; raahataan otsikosta (ei peitä pelin ikkunoita pysyvästi: rajataan ikkunaan)
const PUSSI_KUVA = 'https://kupla.cc/swf/dcr/hof_furni/icons/hp_sack_icon.png';
const POIMINTA_TEKSTI = 'Otit pussin ja voit nyt kerätä tavaroita siihen.', POIMINTA_MS = 4000;

const vayla = e.events;
const loki = [];
const lokiin = (x) => { x.t = new Date().toTimeString().slice(0, 8); loki.push(x); if (loki.length > 50) loki.shift(); };

// ---- tila (vain muistissa: skripti käynnistyy joka huoneeseen tullessa, joten alkutila on aina "ei pussia, tyhjät paikat")
let pussi = false, paikat = new Array(PAIKKOJA).fill(null);
const kuvaKelpaa = (u) => typeof u === 'string' && /^(https?:\/\/|data:image\/)/i.test(u);
const siisti = (x) => (x && typeof x.nimi === 'string' && x.nimi) ? { nimi: x.nimi.slice(0, 60), kuva: kuvaKelpaa(x.kuva) ? x.kuva : '' } : null;

// ---- paneeli (tumma, pieni, ei peitä huonetta)
let paneeli = null, ruudut = [], vedto = null, otsikko = null;   // vedto = käynnissä oleva raahaus (pointerId + siirtymä)
// Raahaus otsikosta pointer-tapahtumilla (hiiri, kosketus, kynä). setPointerCapture pitää tapahtumat otsikolla, vaikka sormi lähtee sen päältä.
// Paneeli pysyy kokonaan ikkunan sisällä. Otsikon pointerdown ei mene pelille (stopPropagation). touch-action:none estää selaimen vierityksen raahauksen aikana.
const siirra = (ev) => { if (!vedto || !paneeli || ev.pointerId !== vedto.id) return;
  const w = paneeli.offsetWidth || 0, h = paneeli.offsetHeight || 0, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
  const x = Math.min(Math.max(0, ev.clientX - vedto.dx), Math.max(0, iw - w)), y = Math.min(Math.max(0, ev.clientY - vedto.dy), Math.max(0, ih - h));
  paneeli.style.left = x + 'px'; paneeli.style.top = y + 'px'; };
const lopeta = (ev) => { if (!vedto || (ev && ev.pointerId !== undefined && ev.pointerId !== vedto.id)) return; vedto = null; };
// Koko: ruudut 60 px, alle 600 px leveällä ruudussa suhteessa (ruutu 320 px -> 32 px). Paneeli max 92vw (CSS).
const mitat = () => { const k = Math.min(1, (window.innerWidth || 1024) / 600); return { ruutu: Math.round(60 * k), kuva: Math.round(32 * k) }; };
const rakennaPaneeli = () => {
  if (paneeli) return;
  paneeli = document.createElement('div'); paneeli.className = 'h683-pussi';
  const m = mitat();
  paneeli.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:' + PANEELI.z + ';padding:8px 10px 10px;max-width:92vw;box-sizing:border-box;'
    + 'background:rgba(20,17,26,.92);border:1px solid #4b3f5e;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.55);font:13px sans-serif;color:#cfc6dc;user-select:none';
  const ots = document.createElement('div'); ots.className = 'h683-otsikko';
  ots.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 0 6px 2px;font-weight:bold;letter-spacing:.5px;color:#d9a35b;cursor:move;touch-action:none';
  const kuva = document.createElement('img'); kuva.src = PUSSI_KUVA; kuva.alt = ''; kuva.draggable = false;
  kuva.style.cssText = 'height:' + m.kuva + 'px;width:auto;image-rendering:pixelated;pointer-events:none';
  const otsTeksti = document.createElement('span'); otsTeksti.textContent = 'Pussi';
  ots.appendChild(kuva); ots.appendChild(otsTeksti);
  ots.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button && ev.button !== 0) return;
    const r0 = paneeli.getBoundingClientRect ? paneeli.getBoundingClientRect() : { left: 0, top: 0 };
    vedto = { id: ev.pointerId, dx: ev.clientX - r0.left, dy: ev.clientY - r0.top };
    paneeli.style.left = r0.left + 'px'; paneeli.style.top = r0.top + 'px'; paneeli.style.transform = 'none';
    if (ots.setPointerCapture) try { ots.setPointerCapture(ev.pointerId); } catch (x) {} });
  ots.addEventListener('pointermove', siirra);
  ots.addEventListener('pointerup', lopeta);
  ots.addEventListener('pointercancel', lopeta);
  ots.addEventListener('lostpointercapture', lopeta);
  otsikko = ots;
  const rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;gap:8px';
  ruudut = [];
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = document.createElement('div');
    r.style.cssText = 'width:' + m.ruutu + 'px;height:' + m.ruutu + 'px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;'
      + 'background:#0c0a10;border:1px solid #3a3148;border-radius:6px;text-align:center;font-size:12px;line-height:13px;word-break:break-all';
    rivi.appendChild(r); ruudut.push(r);
  }
  paneeli.appendChild(ots); paneeli.appendChild(rivi);
  // Klikkaus paneeliin ei saa mennä pelille (muuten hahmo kävelee), kuten 682.js:479 nappi.
  for (const t of ['mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu']) paneeli.addEventListener(t, ev => ev.stopPropagation());
  document.body.appendChild(paneeli);
};
const piirra = () => {
  if (!pussi) { if (paneeli) { paneeli.remove(); paneeli = null; ruudut = []; } return; }
  rakennaPaneeli();
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = ruudut[i], t = paikat[i]; r.textContent = ''; r.title = t ? t.nimi : '';
    r.style.borderColor = t ? '#7d6a9a' : '#3a3148';
    if (!t) continue;
    if (t.kuva) { const im = document.createElement('img'); im.src = t.kuva; im.alt = t.nimi; im.draggable = false;
      im.style.cssText = 'max-width:100%;max-height:100%;image-rendering:pixelated'; r.appendChild(im); }
    else r.textContent = t.nimi.slice(0, 8);
  }
};

// ---- ilmoitus kuten 684.js ilmoita()
const ajastimet = new Set();
const ilmoita = (teksti, ms = 1600) => { const d = document.createElement('div'); d.className = 'h683-pussi'; d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d);
  const a = setTimeout(() => { d.style.opacity = '0'; ajastimet.delete(a); }, ms), b = setTimeout(() => { d.remove(); ajastimet.delete(b); }, ms + 500); ajastimet.add(a); ajastimet.add(b); };

// ---- API
const tila = window.kupla683 = { versio: 'huone-683 pussi 1', huone, loki };
tila.onPussi = () => pussi;
tila.anna = () => { const uusi = !pussi; pussi = true; piirra(); if (uusi) { lokiin({ pussi: 'annettu' }); ilmoita(POIMINTA_TEKSTI, POIMINTA_MS); } return uusi; };
tila.tavarat = () => paikat.filter(Boolean).map(t => ({ nimi: t.nimi, kuva: t.kuva }));
tila.lisaa = (nimi, kuvaUrl) => {
  if (typeof nimi !== 'string' || !nimi.trim()) return -1;
  const t = siisti({ nimi: nimi.trim(), kuva: kuvaUrl }), vanha = paikat.findIndex(p => p && p.nimi === t.nimi); if (vanha >= 0) return vanha;
  const i = paikat.indexOf(null); if (i < 0) { lokiin({ lisaa: 'täynnä', nimi: t.nimi }); return -1; }
  paikat[i] = t; piirra(); lokiin({ lisaa: t.nimi, paikka: i }); return i; };
tila.poista = (nimi) => { const i = paikat.findIndex(p => p && p.nimi === String(nimi).trim()); if (i < 0) return false;
  paikat[i] = null; piirra(); lokiin({ poista: String(nimi), paikka: i }); return true; };
tila.nollaa = () => { pussi = false; paikat = new Array(PAIKKOJA).fill(null); piirra(); lokiin({ nollaa: 1 }); };

// ---- klikkaus pussiin
const onPussiFurni = (ev) => {
  if (!ev || ev.category !== 10) return false;
  if (ev.objectId === PUSSI.id) return true;
  try { const o = e.getRoomObject(huone, ev.objectId, 10); return !!o && String(o.type || '').toLowerCase() === PUSSI.tyyppi; } catch (x) { return false; }   // varatunnistus luokalla
};
const valittu = (ev) => { try {
  if (!onPussiFurni(ev)) return;
  if (!pussi) tila.anna();   // jo otettu: mitään ei tapahdu
} catch (x) { lokiin({ virhe: String(x) }); } };
if (vayla && vayla.addEventListener) vayla.addEventListener('REOE_SELECTED', valittu); else lokiin({ virhe: 'e.events puuttuu, klikkausta ei kuunnella' });

// ---- akku ambulanssista. Oman hahmon ruutu luetaan samalla idiomilla kuin 681.js omaIndeksi() + naapurit(); ei muokata engineä.
let ambulanssissa = null, varoitettu = false;   // null = ei vielä mitattu (ensimmäinen mittaus ei laukaise)
const omaRuutu = () => {
  const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; if (i == null || i < 0) return null;
  const o = e.getRoomObject(huone, i, 100), L = o && o.getLocation && o.getLocation(); return L ? { x: Math.round(L.x), y: Math.round(L.y) } : null; };
// Alue = ruudut, joihin ambulanssi osuu. Kierto 90/270 vaihtaa leveyden ja korkeuden (681.js:387 sama ehto).
const ambulanssiAlue = () => {
  let x = AMBULANSSI.x, y = AMBULANSSI.y, w = 1, h = 1; const puutteet = [];
  let o = null; try { o = e.getRoomObject(huone, AMBULANSSI.id, 10); } catch (err) { o = null; }
  const L = o && o.getLocation && o.getLocation();
  if (L && isFinite(L.x) && isFinite(L.y)) { x = Math.round(L.x); y = Math.round(L.y); } else puutteet.push('sijainti');
  const m = o && o.model, sx = Number(m && m.getValue && m.getValue('furniture_size_x')), sy = Number(m && m.getValue && m.getValue('furniture_size_y'));
  if (sx > 0 && sy > 0) { w = sx; h = sy; } else puutteet.push('koko');
  const d = o && o.getDirection && o.getDirection();
  if (d && isFinite(d.x)) { if (Math.round(d.x) % 180 === 90) { const t = w; w = h; h = t; } } else puutteet.push('kierto');
  if (puutteet.length && !varoitettu) { varoitettu = true; console.warn('683 ambulanssi: ei luettu (' + puutteet.join(', ') + '), käytetään ' + x + ',' + y + ' ' + w + 'x' + h); }
  return { x, y, w, h };
};
const ambulanssiVali = setInterval(() => { try {
  const r = omaRuutu(); if (!r) return;
  const a = ambulanssiAlue();
  const sisalla = r.x >= a.x && r.x < a.x + a.w && r.y >= a.y && r.y < a.y + a.h;
  const oli = ambulanssissa; ambulanssissa = sisalla;
  if (!sisalla || oli !== false) return;   // laukeaa vain sisään astuttaessa (oli === false), ei joka ruudussa
  if (!pussi) { lokiin({ akku: 'ei pussia' }); ilmoita('Tarvitset pussin ensin'); return; }
  if (paikat.some(p => p && p.nimi === AKKU)) return;   // jo saatu
  const i = tila.lisaa(AKKU, AKKU_KUVA);
  if (i >= 0) { lokiin({ akku: 'saatu', paikka: i }); ilmoita('Sait akun'); } else lokiin({ akku: 'pussi täynnä' });   // täynnä: ei ilmoitusta (speksissä ei ole), yritys jatkuu seuraavassa sisääntulossa
} catch (err) { lokiin({ virhe: 'ambulanssi: ' + String(err) }); } }, AMBULANSSI_VALI);

return () => {
  // siivous: pussi ja paikat nollataan (sona 14:42:21 "ei" pysyvyydelle), paneeli ja ilmoitus pois, kuuntelija pois, API pois
  pussi = false; paikat = new Array(PAIKKOJA).fill(null);
  clearInterval(ambulanssiVali); ambulanssissa = null;
  vedto = null; otsikko = null;   // raahauksen kaappaus loppuu kun otsikko poistuu (paneeli poistetaan yllä)
  for (const a of ajastimet) clearTimeout(a); ajastimet.clear();
  for (const d of document.querySelectorAll('.h683-pussi')) d.remove(); paneeli = null; ruudut = [];
  try { if (vayla && vayla.removeEventListener) vayla.removeEventListener('REOE_SELECTED', valittu); } catch (x) {}
  if (window.kupla683 === tila) delete window.kupla683;
};
