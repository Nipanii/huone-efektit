// Huone 656: väliaikainen Halloween-pila (kp 28.10. 00:07:31 yv "tee läpäl väliaikanen script et toi auto ajaa kaikkien yli tietä
//   pitkin ees taas muutaman kerran ja kaikki hahmot jää hetkeks maahan makaa eikä voi liikkua", 00:07:50 "vähä halloween pilaa",
//   00:08:10 "sit pois päältä hetken päästä kun tehnyt työnsä", 00:09:20 "jos otat mallii miinoista et hahmot ragdollaa vähä").
// Laukaisu: kurkkupomo sanoo huoneessa "tööt" -> jokainen moottorilla varustettu client ajaa saman ajon samaan aikaan. Konsolista: pila.aja().
// Auto 438129 (army15_ltdhumvee) ajaa tietä (cpunk_c15_road, x 15-40, y 13-18; kp osoitti päät 00:08:32-00:08:56) edestakaisin.
//   Kaikki paikallista: palvelimella auto ei liiku eikä kukaan kaadu. Näkyy vain pelaajille joilla huone-efektit on päällä.
// Suunta: humveen kirjastossa on vain kaksi kuvaa, keula oikealle-alas (+x, suunnat 0/2) ja vasemmalle-alas (+y, 4/6)
//   (kaluste-kuva 8025 --dir=0/2/4/6 + gw 28.10.). Ylös-vasemmalle (-x) katsovaa kuvaa ei ole, joten paluumatkalla auto peruuttaa.
// Osuma: hahmo tienauhalla (y 12,5-19,5) jonka kohdalta auto ajaa -> lentää sivuun (kuten 681:n miinat), jää makaamaan LEPO ms,
//   ja jos auto ajaa uudestaan yli, lentää taas. Oma hahmo ei voi kävellä makuun aikana (UNIT_WALK 3320 jätetään lähettämättä).
const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
const AUTO = 438129, LAUKAISIJAT = ['kurkkupomo'], SANA = /^t[öo]{2,}t!*$/i;
const REITTI = [[38, 17], [15, 16], [40, 16], [15, 16], [38, 17]];   // auton alkupaikka 38,17 -> länsipää -> itäpää -> länsipää -> takaisin
const NOPEUS = 7, TAUKO = 600, LEPO = 4000, KAISTA = [12.5, 19.5], LEVEYS = 1.6;
const tila = window.pila = { versio: 'huone-656', huone, ajossa: false, loki: [] };
let haamuId = -950001;
const V = e0 && e0.getRoomObjects(huone, 100)[0] && e0.getRoomObjects(huone, 100)[0].getLocation().constructor;
const kaatuneet = new Map();   // oid -> { g, x, y, z, maassa, loppuu, talteen, ohi }
let ajo = null, autoAlku = null, omaAlhaalla = false, lahetysYhteys = null, lahetysOma = null, lahetysAlkup = null;

const yhteys = () => {
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  const nahty = new Set(); let c = null;
  const etsi = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || nahty.has(o)) return; nahty.add(o);
    if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
    for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') etsi(de.value, d + 1); } };
  etsi(dv(e0, '_roomSessionManager'), 0); return c;
};
const sessio = () => { const sm = Object.getOwnPropertyDescriptor(e0, '_roomSessionManager'); return sm && sm.value && sm.value.getSession && sm.value.getSession(huone); };
const omaIndeksi = () => { const s = sessio(), i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i; };
// Kävelyesto: kääritään yhteyden send ja pudotetaan UNIT_WALK kun oma hahmo makaa. Palautetaan lopetuksessa.
const kavelyEsto = () => { const c = yhteys(); if (!c || typeof c.send !== 'function' || lahetysYhteys === c) return;
  const alkup = c.send;
  const oma = function (...k) { try { if (omaAlhaalla && this._messages) { k = k.filter(x => this._messages.getComposerId(x) !== 3320); if (!k.length) return true; } } catch (x) {}
    return alkup.apply(this, k); };
  c.send = oma; lahetysYhteys = c; lahetysOma = oma; lahetysAlkup = alkup; };

const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
  for (const s of sp) { if (!talteen.has(s)) talteen.set(s, s.alpha); if (s.alpha !== 0) { s.alpha = 0; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
const palauta = talteen => { for (const [s, a] of talteen) { s.alpha = a > 0 ? a : 255; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } talteen.clear(); };
const esto = (zA) => { try { const m = e0.getFurnitureStackingHeightMap(huone);
  return (px, py) => { const tx = Math.round(px), ty = Math.round(py); if (!m || !m.validPosition(tx, ty)) return true; return m.getTileHeight(tx, ty) - zA > 2; }; } catch (x) { return () => false; } };

// Lento: hahmon haamu lentää kaaressa poispäin autosta, pyörii vähän ja jää makaamaan. Oikea hahmo piilossa koko ajan.
const lennata = (oid, sivu, liike) => {
  const o = e0.getRoomObject(huone, oid, 100); if (!o) return;
  let k = kaatuneet.get(oid);
  const L = k ? { x: k.x, y: k.y, z: k.z } : o.getLocation(), fig = o.model.getValue('figure'); if (!fig) return;
  if (!k) { const g = haamuId--; if (!e0.addRoomObjectUser(huone, g, new V(L.x, L.y, L.z), new V(90), 90, 1, fig)) return;
    k = { g, x: L.x, y: L.y, z: L.z, talteen: new Map() }; kaatuneet.set(oid, k); }
  const r = Math.random(), matka = 1.5 + r * 2, h = 1.5 + Math.random() * 2.5, ms = 650 + Math.random() * 400;
  const kulma = Math.atan2(sivu, liike * 0.6), x0 = k.x, y0 = k.y, z0 = k.z, osuu = esto(z0);
  let lento = matka; for (let d = 0.1; d <= matka; d += 0.1) if (osuu(x0 + Math.cos(kulma) * d, y0 + Math.sin(kulma) * d)) { lento = Math.max(0, d - 0.6); break; }
  const dx = Math.cos(kulma) * lento, dy = Math.sin(kulma) * lento, kierr = (0.4 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
  const lepoSuunta = (dx - dy) < 0 ? 0 : 90, alku = performance.now();
  k.lento = { alku, ms, x0, y0, z0, dx, dy, h, kierr, lepoSuunta }; k.maassa = 0; k.loppuu = 0;
  if (oid === omaIndeksi()) omaAlhaalla = true;
};
const paivitaKaatuneet = (nyt) => {
  for (const [oid, k] of kaatuneet) { try {
    const o = e0.getRoomObject(huone, oid, 100); piilota(o, k.talteen);
    const f = k.lento;
    if (f && !k.maassa) { const t = Math.min(1, (nyt - f.alku) / f.ms);
      const suunta = ((Math.round(t * 8 * f.kierr) % 8) + 8) % 8 * 45;
      k.x = f.x0 + t * f.dx; k.y = f.y0 + t * f.dy; k.z = f.z0 + 4 * f.h * t * (1 - t);
      e0.updateRoomObjectUserLocation(huone, k.g, new V(k.x, k.y, k.z), null, false, 0, new V(suunta), suunta, true, false, 16);
      if (t >= 1) { k.z = f.z0; k.maassa = nyt; k.loppuu = nyt + LEPO;
        e0.updateRoomObjectUserLocation(huone, k.g, new V(k.x, k.y, k.z), null, false, 0, new V(f.lepoSuunta), f.lepoSuunta, true, false, 30); } }
    const ho = e0.getRoomObject(huone, k.g, 100);
    if (k.maassa && ho && ho.model.getValue('figure_posture') !== 'lay') e0.updateRoomObjectUserPosture(huone, k.g, 'lay', '');
    if (k.maassa && nyt >= k.loppuu && !(ajo && ajo.kaynnissa)) {
      try { e0.removeRoomObjectUser(huone, k.g); } catch (x) {} palauta(k.talteen); kaatuneet.delete(oid);
      if (oid === omaIndeksi()) omaAlhaalla = false; }
  } catch (x) { tila.loki.push({ virhe: String(x) }); } }
};

// Ajon aikataulu: osuudet REITIN pisteiden välillä, TAUKO jokaisen pään jälkeen. Peruutus = keula pysyy +x (suunta 90).
const osuudet = () => { const o = []; let t = 0;
  for (let i = 1; i < REITTI.length; i++) { const [ax, ay] = REITTI[i - 1], [bx, by] = REITTI[i], ms = Math.hypot(bx - ax, by - ay) / NOPEUS * 1000;
    o.push({ t0: t, t1: t + ms, ax, ay, bx, by }); t += ms + TAUKO; } return { o, kesto: t }; };
const kuvaa = () => {
  const nyt = performance.now();
  if (ajo && ajo.kaynnissa) { const t = nyt - ajo.alku, a = e0.getRoomObject(huone, AUTO, 10);
    let x = REITTI[REITTI.length - 1][0], y = REITTI[REITTI.length - 1][1], liike = 0;
    for (const s of ajo.o) { if (t < s.t0) break; const u = Math.min(1, (t - s.t0) / (s.t1 - s.t0)); x = s.ax + (s.bx - s.ax) * u; y = s.ay + (s.by - s.ay) * u; liike = u < 1 ? Math.sign(s.bx - s.ax) : 0; }
    if (a) e0.updateRoomObjectFloor(huone, AUTO, new V(x, y, autoAlku.z), new V(90), a.getState(0), null);
    if (liike) for (const o of e0.getRoomObjects(huone, 100) || []) { if (o.id < 0 || !o.model || !o.model.getValue('figure')) continue;
      const k = kaatuneet.get(o.id), L = k ? { x: k.x, y: k.y } : o.getLocation(); if (L.y < KAISTA[0] || L.y > KAISTA[1]) continue;
      if (Math.abs(L.x - (x + 0.5)) > LEVEYS) continue;
      if (k && (k.lento && !k.maassa || nyt - (k.osui || 0) < 1200)) continue;
      lennata(o.id, L.y >= y + 0.5 ? 1 : -1, liike); const kk = kaatuneet.get(o.id); if (kk) kk.osui = nyt; }
    if (t >= ajo.kesto) { ajo.kaynnissa = false; tila.ajossa = false;
      if (a) e0.updateRoomObjectFloor(huone, AUTO, new V(autoAlku.x, autoAlku.y, autoAlku.z), new V(autoAlku.d), a.getState(0), null);
      for (const k of kaatuneet.values()) if (k.maassa) k.loppuu = Math.max(k.loppuu, nyt + 1500);
      tila.loki.push({ ajo: 'valmis', t: new Date().toTimeString().slice(0, 8) }); } }
  if (kaatuneet.size) paivitaKaatuneet(nyt);
  if ((ajo && ajo.kaynnissa) || kaatuneet.size) seuraava(); else kehys = null;
};
let kehys = null;
const seuraava = () => { kehys = document.hidden ? setTimeout(kuvaa, 30) : requestAnimationFrame(kuvaa); };
tila.aja = () => { if (!e0 || !V || (ajo && ajo.kaynnissa)) return false; const a = e0.getRoomObject(huone, AUTO, 10); if (!a) return false;
  const L = a.getLocation(); autoAlku = { x: L.x, y: L.y, z: L.z, d: a.getDirection().x }; REITTI[0] = [L.x, L.y]; REITTI[REITTI.length - 1] = [L.x, L.y];
  kavelyEsto(); const s = osuudet(); ajo = { alku: performance.now(), o: s.o, kesto: s.kesto, kaynnissa: true }; tila.ajossa = true;
  tila.loki.push({ ajo: 'alku', kesto: Math.round(s.kesto), t: new Date().toTimeString().slice(0, 8) }); if (!kehys) seuraava(); return true; };

const vayla = e0 && e0.events;
const kuule = ev => { try { if (!ev || ev.chatType == null || !SANA.test(String(ev.message || '').trim())) return;
  const s = sessio(), u = s && s.userDataManager && s.userDataManager.getUserDataByIndex(ev.objectId);
  if (!u || !LAUKAISIJAT.includes(String(u.name || '').toLowerCase())) return; tila.aja(); } catch (x) { tila.loki.push({ virhe: String(x) }); } };
if (vayla && vayla.addEventListener) vayla.addEventListener('RSCE_CHAT_EVENT', kuule);

return () => {
  if (vayla && vayla.removeEventListener) vayla.removeEventListener('RSCE_CHAT_EVENT', kuule);
  if (kehys) { cancelAnimationFrame(kehys); clearTimeout(kehys); }
  try { const a = autoAlku && e0.getRoomObject(huone, AUTO, 10); if (a) e0.updateRoomObjectFloor(huone, AUTO, new V(autoAlku.x, autoAlku.y, autoAlku.z), new V(autoAlku.d), a.getState(0), null); } catch (x) {}
  for (const k of kaatuneet.values()) { try { e0.removeRoomObjectUser(huone, k.g); } catch (x) {} palauta(k.talteen); } kaatuneet.clear(); omaAlhaalla = false;
  try { if (lahetysYhteys && lahetysYhteys.send === lahetysOma) { if (lahetysAlkup === Object.getPrototypeOf(lahetysYhteys).send) delete lahetysYhteys.send; else lahetysYhteys.send = lahetysAlkup; } } catch (x) {}
  if (window.pila === tila) delete window.pila;
};
