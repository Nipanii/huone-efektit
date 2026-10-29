// Huone 683 (Halloween rata 4/6): tyhjä pohja huonekohtaisille efekteille.
// kp 28.10. 16:02:08 "luo tyhjä pohja event huoneille joilla ei vielä ole". Wired-piilotus on erikseen huoneet/hween-wired.js.
// Moottori ajaa tämän new Function('kupla', koodi)(api) huoneeseen tullessa ja kutsuu palautettua funktiota kun huoneesta lähdetään.
//   kupla.roomId() = tämä huone. Mallit: huoneet/681.js (miinat), huoneet/684.js (pimeys), huoneet/656.js (auto).
//
// Sonan inventaario (kankainen pussi). sona 29.10. 14:31-14:32 "Tässä huoneessa on kankainen pussi. Se vois olla inventaario." · "tilaa vaikka 3
//   inventario itemille" · "pussista ei saada mitään, vaan pelaaja saa pussin itsessään joka on se inventario" · "Näkyisi vain tässä huoneessa
//   sen jälkeen kun on klikannut itemiä 'kankainen pussi'". Mitkä esineet pussiin menevät, päätetään myöhemmin -> tässä vain pussi, 3 paikkaa ja API.
//   - Klikkaus furniin PUSSI (REOE_SELECTED, kuten 682.js:487-489) = pelaaja "saa pussin": oikeaan alakulmaan tulee pieni tumma paneeli,
//     jossa 3 tyhjää paikkaa. Furni jää huoneeseen (muutkin saavat oman pussinsa); mitään ei poisteta eikä lähetetä palvelimelle.
//   - Paneeli näkyy vain tässä huoneessa (moottori pysäyttää skriptin huoneesta lähtiessä, siivous poistaa paneelin) ja vain jos pussi on otettu.
//   - EI pysyvyyttä (sona 29.10. 14:42:21, kp:n kysymykseen "pitääkö esineiden pysyä inventoorissa jos käy huoneesta poissa?": "ei"): pussi ja
//     paikat ovat vain muistissa, huoneesta lähtiessä siivous nollaa kaiken ja huoneeseen tullessa pussi pitää ottaa uudestaan. Ei localStorageä.
//   - Pussin tunnistus: furni-id 444838 (sona Osoita "#osoita:r683:f444838"); varalle luokka hp_sack (FurnitureData "Kankainen pussi").
// Konsolissa / myöhemmille pulma-askelille: window.kupla683 =
//   .lisaa(nimi, kuvaUrl?)  ensimmäiseen vapaaseen paikkaan; palauttaa paikan (0-2), -1 jos täynnä; sama nimi uudestaan palauttaa vanhan paikan
//   .poista(nimi) true jos oli · .tavarat() [{nimi, kuva}] · .onPussi() · .anna() anna pussi (testi) · .nollaa() pussi ja tavarat pois · .loki
//   Tavarat voi lisätä myös ennen pussin ottoa (paneeli ei vielä näy). kuvaUrl vain http(s):// tai data:image/, muuten paikkaan tulee nimen alku.
// EPÄVARMAA LIVENÄ (vain offline-testattu): REOE_SELECTED ei ehkä laukea jos pussi on jo valittuna skriptin käynnistyessä (valitse jokin muu ja klikkaa
//   pussia uudestaan) · paneeli voi peittää oikean alakulman infokortin (PANEELI.oikea/alas) · z-index 1000 on arvaus pelin omien ikkunoiden suhteen.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

// ---- ASETUKSET. Pussin tunnistus: id ensisijainen, luokka varalle jos furni vaihtuu (nostettu ja laskettu uudelleen = uusi id).
const PUSSI = { id: 444838, tyyppi: 'hp_sack' };   // tyyppi = classname (FurnitureData id 29109676 "Kankainen pussi"); o.type on luokan nimi (656.js IKKUNA, hween-wired WIRED)
const PAIKKOJA = 3;
const PANEELI = { oikea: 14, alas: 70, z: 1000 };   // px reunoista; alas jättää toolbarin/chat-kentän alle tilaa

const vayla = e.events;
const loki = [];
const lokiin = (x) => { x.t = new Date().toTimeString().slice(0, 8); loki.push(x); if (loki.length > 50) loki.shift(); };

// ---- tila (vain muistissa: skripti käynnistyy joka huoneeseen tullessa, joten alkutila on aina "ei pussia, tyhjät paikat")
let pussi = false, paikat = new Array(PAIKKOJA).fill(null);
const kuvaKelpaa = (u) => typeof u === 'string' && /^(https?:\/\/|data:image\/)/i.test(u);
const siisti = (x) => (x && typeof x.nimi === 'string' && x.nimi) ? { nimi: x.nimi.slice(0, 60), kuva: kuvaKelpaa(x.kuva) ? x.kuva : '' } : null;

// ---- paneeli (tumma, pieni, ei peitä huonetta)
let paneeli = null, ruudut = [];
const rakennaPaneeli = () => {
  if (paneeli) return;
  paneeli = document.createElement('div'); paneeli.className = 'h683-pussi';
  paneeli.style.cssText = 'position:fixed;right:' + PANEELI.oikea + 'px;bottom:' + PANEELI.alas + 'px;z-index:' + PANEELI.z + ';padding:6px 8px 8px;'
    + 'background:rgba(20,17,26,.9);border:1px solid #4b3f5e;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.55);font:11px sans-serif;color:#cfc6dc;user-select:none';
  const ots = document.createElement('div'); ots.textContent = 'Pussi'; ots.style.cssText = 'margin:0 0 4px 2px;font-weight:bold;letter-spacing:.5px;color:#d9a35b';
  const rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;gap:6px';
  ruudut = [];
  for (let i = 0; i < PAIKKOJA; i++) {
    const r = document.createElement('div');
    r.style.cssText = 'width:44px;height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;'
      + 'background:#0c0a10;border:1px solid #3a3148;border-radius:5px;text-align:center;font-size:10px;line-height:11px;word-break:break-all';
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
const ilmoita = (teksti) => { const d = document.createElement('div'); d.className = 'h683-pussi'; d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d);
  const a = setTimeout(() => { d.style.opacity = '0'; ajastimet.delete(a); }, 1600), b = setTimeout(() => { d.remove(); ajastimet.delete(b); }, 2100); ajastimet.add(a); ajastimet.add(b); };

// ---- API
const tila = window.kupla683 = { versio: 'huone-683 pussi 1', huone, loki };
tila.onPussi = () => pussi;
tila.anna = () => { const uusi = !pussi; pussi = true; piirra(); if (uusi) { lokiin({ pussi: 'annettu' }); ilmoita('Sait kankaisen pussin'); } return uusi; };
tila.tavarat = () => paikat.filter(Boolean).map(t => ({ nimi: t.nimi, kuva: t.kuva }));
tila.lisaa = (nimi, kuvaUrl) => {
  if (typeof nimi !== 'string' || !nimi.trim()) return -1;
  const t = siisti({ nimi: nimi.trim(), kuva: kuvaUrl }), vanha = paikat.findIndex(p => p && p.nimi === t.nimi); if (vanha >= 0) return vanha;
  const i = paikat.indexOf(null); if (i < 0) { lokiin({ lisaa: 'täynnä', nimi: t.nimi }); return -1; }
  paikat[i] = t; piirra(); lokiin({ lisaa: t.nimi, paikka: i }); return i; };
tila.poista = (nimi) => { const i =paikat.findIndex(p => p && p.nimi === String(nimi).trim()); if (i < 0) return false;
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

return () => {
  // siivous: pussi ja paikat nollataan (sona 14:42:21 "ei" pysyvyydelle), paneeli ja ilmoitus pois, kuuntelija pois, API pois
  pussi = false; paikat = new Array(PAIKKOJA).fill(null);
  for (const a of ajastimet) clearTimeout(a); ajastimet.clear();
  for (const d of document.querySelectorAll('.h683-pussi')) d.remove(); paneeli = null; ruudut = [];
  try { if (vayla && vayla.removeEventListener) vayla.removeEventListener('REOE_SELECTED', valittu); } catch (x) {}
  if (window.kupla683 === tila) delete window.kupla683;
};
