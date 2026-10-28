// Huone 656: väliaikainen Halloween-pila (kp 28.10. 00:07:31 yv "tee läpäl väliaikanen script et toi auto ajaa kaikkien yli tietä
//   pitkin ees taas muutaman kerran ja kaikki hahmot jää hetkeks maahan makaa eikä voi liikkua", 00:07:50 "vähä halloween pilaa",
//   00:08:10 "sit pois päältä hetken päästä kun tehnyt työnsä", 00:09:20 "jos otat mallii miinoista et hahmot ragdollaa vähä").
// Laukaisu: kurkkupomo, Res, sona tai robo sanoo huoneessa ":auto" (21:57, ennen "tööt") -> jokainen moottorilla varustettu client ajaa saman ajon samaan aikaan. Konsolista: pila.aja().
// Auto 438129 (army15_ltdhumvee) ajaa tietä (cpunk_c15_road, x 15-40, y 13-18; kp osoitti päät 00:08:32-00:08:56) edestakaisin.
//   Kaikki paikallista: palvelimella auto ei liiku eikä kukaan kaadu. Näkyy vain pelaajille joilla huone-efektit on päällä.
// Suunta: humveen kirjastossa on vain kaksi kuvaa, keula oikealle-alas (+x, suunnat 0/2) ja vasemmalle-alas (+y, 4/6)
//   (kaluste-kuva 8025 --dir=0/2/4/6 + gw 28.10.). Ylös-vasemmalle (-x) katsovaa kuvaa ei ole, joten paluumatkalla auto peruuttaa.
// Osuma: hahmo tienauhalla (y 12,5-19,5) jonka kohdalta auto ajaa -> lentää sivuun (kuten 681:n miinat), jää makaamaan LEPO ms,
//   ja jos auto ajaa uudestaan yli, lentää taas. Oma hahmo ei voi kävellä makuun aikana (UNIT_WALK 3320 jätetään lähettämättä).
const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
const AUTO = 438129, LAUKAISIJAT = ['kurkkupomo', 'res', 'sona', 'herra-robotti'], SANA = /^:auto!*$/i;
const REITTI = [[38, 17], [15, 16], [40, 16], [15, 16], [38, 17]];   // auton alkupaikka 38,17 -> länsipää -> itäpää -> länsipää -> takaisin
const NOPEUS = 7, TAUKO = 600, LEPO = 4000, KAISTA = [12.5, 19.5], LEVEYS = 1.6;
const tila = window.pila = { versio: 'huone-656', huone, ajossa: false, loki: [] };
let haamuId = -950001;
// V (Vector3d-luokka) luetaan hahmosta; jos huoneessa ei ollut hahmoja skriptin käynnistyessä, se otetaan autosta ajon alussa.
let V = e0 && e0.getRoomObjects(huone, 100)[0] && e0.getRoomObjects(huone, 100)[0].getLocation().constructor;
// Veri (kp 28.10. 01:22:37 "mis veri"): laskeutuessa paikallinen hp_blood (Verta maassa) hahmon alle, poistuu VERI_MS jälkeen.
const VERI = 'hp_blood', VERI_MS = 90000, veret = new Set(); let veriId = -955001;
tila.veri = (...a) => veriLatakko(...a);
const fdata = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
  writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
  initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
  compare() { return false; }, setString() {}, getValue() { return ''; } });
const veriLatakko = (x, y, z) => { try { const id = veriId--;
  // kp 29.10. 00:00 "edellee veret penkin pääl": lentäjän z oli penkin/istuimen korkeus. Veri lattiatasoon (ruudun korkeus), jolloin penkki ja hahmot piirtyvät sen päälle.
  const rx = Math.round(x), ry = Math.round(y); let lz = 0; try { const g = e0.getLegacyWallGeometry(huone); lz = g ? (g.getHeight(rx, ry) || 0) : 0; } catch (x2) {}
  if (!e0.addFurnitureFloorByTypeName(huone, id, VERI, new V(rx, ry, lz), new V(Math.floor(Math.random() * 4) * 90), 0, fdata('0'), NaN, -1, 0, -1, '', true, false)) return;
  veret.add(id); setTimeout(() => { try { e0.removeRoomObjectFloor(huone, id); } catch (x) {} veret.delete(id); }, VERI_MS); } catch (x) { tila.loki.push({ veri: String(x) }); } };
const veriLatakot = (x, y, z) => { veriLatakko(x, y, z); for (let i = 0; i < 3; i++) veriLatakko(x + (Math.random() * 2 - 1), y + (Math.random() * 2 - 1), z); };   // Shorp 01:25:39 "enemmän verta"
const kaatuneet = new Map();   // oid -> { g, x, y, z, maassa, loppuu, talteen, ohi }
let ajo = null, autoAlku = null, omaAlhaalla = false, lahetysYhteys = null, lahetysOma = null, lahetysAlkup = null;
// Kyyti (kp 28.10. 23:39:40 "jos istuu autos nii pysyy auton kyydis auton mukana"): ajon alussa auton päällä (jalanjälki, z >= 0,5)
//   olevat hahmot liikkuvat auton mukana samalla etäisyydellä eivätkä kaadu. Jos palvelin siirtää kyytiläistä kesken (käveli pois),
//   hän putoaa kyydistä. Lopussa paluu alkupaikkaan (= palvelimen paikka, koska auto palaa lähtöön).
//   Jalanjälki 28.10. 23:42 robon clientista: koko 2x3, suunta 90 -> x 38-40, y 17-18; istujat z 1,3 (sz 1,3).
let kyyti = new Map();   // oid -> { x, y, z, dx, dy, asetettu }
const kyytiAlku = (a, L) => { kyyti = new Map(); try { const sx = a.model.getValue('furniture_size_x') || 1, sy = a.model.getValue('furniture_size_y') || 1,
    kaanto = Math.round(a.getDirection().x / 90) % 2 === 1, lx = kaanto ? sy : sx, ly = kaanto ? sx : sy;
  for (const o of e0.getRoomObjects(huone, 100) || []) { if (o.id < 0 || !o.model || !o.model.getValue('figure')) continue; const l = o.getLocation();
    if (l.x < L.x - 0.5 || l.x > L.x + lx - 0.5 || l.y < L.y - 0.5 || l.y > L.y + ly - 0.5 || l.z < 0.5) continue;
    kyyti.set(o.id, { x: l.x, y: l.y, z: l.z, dx: l.x - L.x, dy: l.y - L.y, asetettu: null }); }
  tila.loki.push({ kyyti: [...kyyti.keys()] }); } catch (x) { tila.loki.push({ kyyti: String(x) }); } };
const kyytiSiirra = (x, y) => { for (const [oid, k] of kyyti) { try { const o = e0.getRoomObject(huone, oid, 100); if (!o) { kyyti.delete(oid); continue; }
    // Palvelimen tilapäivitys (esim. kyytiläinen puhuu, 28.10. 23:50 robo putosi Oliverin ja jukuhomman ruudulla) palauttaa hahmon
    // istumapaikalleen k.x,k.y: se on yhä kyydissä. Vain muualle siirtynyt (käveli pois) pudotetaan.
    const l = o.getLocation(); if (k.asetettu && Math.hypot(l.x - k.asetettu[0], l.y - k.asetettu[1]) > 0.6 && Math.hypot(l.x - k.x, l.y - k.y) > 0.6) { kyyti.delete(oid); continue; }
    const p = new V(x + k.dx, y + k.dy, k.z); e0.updateRoomObjectUserLocation(huone, oid, p, p, false, 0, o.getDirection(), o.getDirection().x, true); k.asetettu = [p.x, p.y];
  } catch (x) { kyyti.delete(oid); } } };
const kyytiLoppu = () => { for (const [oid, k] of kyyti) { try { const o = e0.getRoomObject(huone, oid, 100); if (!o) continue; const p = new V(k.x, k.y, k.z);
    e0.updateRoomObjectUserLocation(huone, oid, p, p, false, 0, o.getDirection(), o.getDirection().x, true); } catch (x) {} } kyyti = new Map(); };

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
    try { const n = k.length; k = k.filter(x => !autoViesti(x)); if (k.length < n) { autoLaheta(); if (!k.length) return true; } } catch (x) {}
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
  const r = Math.random(), matka = 1.5 + r * 3.5, h = 1.5 + Math.random() * 2.5, ms = 650 + Math.random() * 500;   // kp 01:32:33 "hajauta": pidempi ja hajonnut lento
  const kulma = Math.atan2(sivu, liike * 0.6) + (Math.random() - 0.5) * 1.6, x0 = k.x, y0 = k.y, z0 = k.z, osuu = esto(z0);
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
      if (t >= 1) { k.z = f.z0; k.maassa = nyt; k.loppuu = nyt + LEPO; veriLatakot(k.x, k.y, k.z);
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
    if (kyyti.size) kyytiSiirra(x, y);
    if (liike) for (const o of e0.getRoomObjects(huone, 100) || []) { if (o.id < 0 || !o.model || !o.model.getValue('figure') || kyyti.has(o.id)) continue;
      const k = kaatuneet.get(o.id), L = k ? { x: k.x, y: k.y } : o.getLocation(); if (L.y < KAISTA[0] || L.y > KAISTA[1]) continue;
      if (Math.abs(L.x - (x + 0.5)) > LEVEYS) continue;
      if (k && (k.lento && !k.maassa || nyt - (k.osui || 0) < 1200)) continue;
      lennata(o.id, L.y >= y + 0.5 ? 1 : -1, liike); const kk = kaatuneet.get(o.id); if (kk) kk.osui = nyt; }
    if (t >= ajo.kesto) { ajo.kaynnissa = false; tila.ajossa = false;
      if (a) e0.updateRoomObjectFloor(huone, AUTO, new V(autoAlku.x, autoAlku.y, autoAlku.z), new V(autoAlku.d), a.getState(0), null);
      kyytiLoppu();
      for (const k of kaatuneet.values()) if (k.maassa) k.loppuu = Math.max(k.loppuu, nyt + 1500);
      tila.loki.push({ ajo: 'valmis', t: new Date().toTimeString().slice(0, 8) }); } }
  if (kaatuneet.size) paivitaKaatuneet(nyt);
  if ((ajo && ajo.kaynnissa) || kaatuneet.size) seuraava(); else kehys = null;
};
let kehys = null;
const seuraava = () => { kehys = document.hidden ? setTimeout(kuvaa, 30) : requestAnimationFrame(kuvaa); };
tila.aja = (ohi = 0) => { if (!e0 || (ajo && ajo.kaynnissa)) return false; const a = e0.getRoomObject(huone, AUTO, 10); if (!a) return false;
  if (!V) V = a.getLocation().constructor;
  const L = a.getLocation(); autoAlku = { x: L.x, y: L.y, z: L.z, d: a.getDirection().x }; REITTI[0] = [L.x, L.y]; REITTI[REITTI.length - 1] = [L.x, L.y];
  kyytiAlku(a, L); kavelyEsto(); const s = osuudet(); if (ohi >= s.kesto) return false; ajo = { alku: performance.now() - ohi, o: s.o, kesto: s.kesto, kaynnissa: true }; tila.ajossa = true;
  tila.loki.push({ ajo: 'alku', kesto: Math.round(s.kesto), t: new Date().toTimeString().slice(0, 8) }); if (!kehys) seuraava(); return true; };

// Ajastettu käynnistys ilman tööt-sanaa (kp 28.10. 00:15:25 yv "ei, pistä päälle ilman tööt"): kaikki clientit alkavat samasta kellonajasta
//   ALKAA (epoch ms). Myöhässä latautuva client liittyy kesken ajon oikeaan kohtaan; ajon jälkeen latautuva ei aja mitään.
// Linjalaukaisu (kp 28.10. 01:18:43 "tee sillai et ku on x pelaajaa linjal nii auto tulee"): kun tienauhalla (x 15-40, y KAISTA)
//   seisoo vähintään LINJALLA hahmoa, auto lähtee. Jokainen client näkee samat palvelimen sijainnit, joten ajot alkavat lähes yhtä aikaa.
//   JAAHY ajon jälkeen ettei auto lähde heti uudestaan kaatuneiden päälle. LINJALLA = 3 on valittu luku, kp voi pyytää muun.
// kp 28.10. 11:03 yv "auto tulee vaan jos 5 hahmoo linjalla ja max 3 kertaa tunnissa": LINJALLA 3 -> 5, jakso 15 -> 20 min
//   (kellojakso = enintään yksi ajo per jakso, eli enintään 3 tunnissa).
// kp 28.10. 23:03:49 yv "auto tulee max 2x tunnis ellei käytä komentoa": jakso 20 -> 30 min (:auto ohittaa).
const LINJALLA = 5, JAAHY = 30 * 60000;   // kp 01:21:18 "muutaman kerran tunnis" + 01:21:25 "EI MUUTAMAN KERRAN MINUUTIS"
// Kellojakso (01:24): ajo kerran per JAAHY-jakso seinäkellosta, jolloin kaikki clientit lähtevät samassa jaksossa yhtä aikaa ja
//   koodin uudelleenlataus ei nollaa jäähyä pitkäksi aikaa. Reuna-ehto poistettu: porukka seisoo tiellä koko ajan (15 hahmoa), joten tie ei tyhjene.
// 28.10. 10:35 (kp "oon nähny sen monta kertaa jo 5 min sisään" · "huoneeseen tullessa kai tekee sen"): -1 alussa = jokainen
//   huoneeseen tulo / sivun lataus / skriptin uudelleenkäynnistys ajoi heti, koska tiellä on aina >= 3. Nyt alku = nykyinen jakso,
//   joten ajo tulee vasta seuraavan 15 min jakson alussa, ja silloin kaikilla clienteillä yhtä aikaa.
let viimJakso = Math.floor(Date.now() / JAAHY);
const ajastus = setInterval(() => { try {
  if (tila.ajossa || (ajo && ajo.kaynnissa) || kaatuneet.size || Math.floor(Date.now() / JAAHY) === viimJakso) return;
  let n = 0; for (const o of e0.getRoomObjects(huone, 100) || []) { if (o.id < 0 || !o.model || !o.model.getValue('figure')) continue;
    const L = o.getLocation(); if (L.x >= 15 && L.x <= 40 && L.y >= KAISTA[0] && L.y <= KAISTA[1]) n++; }
  tila.linjalla = n;
  if (n >= LINJALLA && tila.aja()) { viimJakso = Math.floor(Date.now() / JAAHY); tila.loki.push({ ajo: 'linja', n, t: new Date().toTimeString().slice(0, 8) }); }
} catch (x) {} }, 500);

// Safe housen ikkunavalot (kp 28.10. 10:42 yv "jos var on 1 tai isompi niin script laittaa valoja päälle noihin ikkunoihin",
//   10:47 "vaan ikkunalliset vaihdetaan osa versioon samasta seinästä/ikkunasta mis on valot"). Sininen kaupunkitiili
//   (nyc_c23_buildingblue) olomuodot kaluste-kuvista 28.10.: 5 = ikkuna pimeä -> 6 = sama valo päällä, 7 = tupla-ikkuna pimeä -> 8 = valo.
//   Muut olomuodot (seinä, ovi) ennallaan. Oma ratoja_tehty (room:439263, oletus 0, +1 per rata) luetaan Wired Menun tarkastuksella
//   kuten 681:n arkku: 7012 [1, oma huoneindeksi] -> vastaus siepataan handleMessages-kutsusta. Muutos vain tämän pelaajan clientissä.
//   Alkuperäiset tilat talteen: re-lab nitro/data/656-seinat-backup-2810.txt. Testi: pila.valot.pakota = true (näyttää valot arvosta riippumatta).
//   kp 10:50 "ei ihan kaikkii valoi" + "vierekkäisiin päälle ja vierekkäisistä pois": PIMEA = ryhmät jotka jää pimeiksi
//   (yläkerta x3-7, alakerta x9-11, sivu 1,23). Ovilla (olomuoto 4) ei ole valoversiota.
const PIMEA = new Set([403308, 403307, 403306, 369492, 369491, 425605]);
const IKKUNA = 'nyc_c23_buildingblue', VALO = { 5: 6, 7: 8 }, RATA_MUUTTUJA = 'room:439263', VALO_RAJA = 1;
const valot = tila.valot = { arvo: null, paalla: false, pakota: false, kysytty: 0, alkup: new Map() };
let valoOdottaa = 0, valoYhteys = null, valoOma = null, valoAlkup = null;
const valoPakota = () => { try { if (!e0) return; const pois = !(valot.paalla || valot.pakota);
  for (const o of e0.getRoomObjects(huone, 10) || []) { if (o.type !== IKKUNA || !o.getState) continue;
    const s = o.getState(0); if (!PIMEA.has(o.id) && !valot.alkup.has(o.id) && VALO[s] != null) valot.alkup.set(o.id, s);
    const a = valot.alkup.get(o.id); if (a == null) continue; const halu = pois ? a : VALO[a];
    if (s !== halu) e0.updateRoomObjectFloor(huone, o.id, o.getLocation(), o.getDirection(), halu, null); }
} catch (x) { tila.loki.push({ valot: 'virhe', viesti: String(x) }); } };
const valoKoukku = () => {
  const c = yhteys(); if (!c || typeof c.handleMessages !== 'function') return null; if (valoYhteys === c) return c;
  const alkup = c.handleMessages;
  const oma = function (...viestit) { try { if (valoOdottaa && Date.now() - valoOdottaa < 5000) {
    const i = omaIndeksi();
    viestit = viestit.filter(v => { const p = v && v.parser;
      if (!p || p.type !== 1 || p.objectId !== i || !Array.isArray(p.values) || !Array.isArray(p.wiredIds)) return true;
      valoOdottaa = 0; const r = p.values.find(x => x && x.id === RATA_MUUTTUJA); const arvo = r ? r.value : 0;
      valot.arvo = arvo; valot.paalla = arvo >= VALO_RAJA; tila.loki.push({ valot: 'luettu', arvo, paalla: valot.paalla });
      valoPakota(); return false; });
    if (!viestit.length) return; } } catch (x) { tila.loki.push({ valot: 'virhe', viesti: String(x) }); }
    return alkup.apply(this, viestit); };
  c.handleMessages = oma; valoYhteys = c; valoOma = oma; valoAlkup = alkup; return c;
};
const valoKysy = () => { try {
  const c = valoKoukku(), i = omaIndeksi(); if (!c || i == null || typeof c.sendRawPacket !== 'function') return false;
  valoOdottaa = Date.now(); valot.kysytty++; c.sendRawPacket(7012, [1, i], 'valot656'); return true;
} catch (x) { tila.loki.push({ valot: 'virhe', viesti: String(x) }); return false; } };
valot.kysy = valoKysy;
let valoYrit = 0;
const valoAloitus = setInterval(() => { if (valoKysy() || ++valoYrit > 30) clearInterval(valoAloitus); }, 1000);
const valoAjastin = setInterval(valoPakota, 500);
// kp 10:53 "tarkistus vaan sisäänkirjauksessa ei riitä ... voi tulla teleportin kautta": muuttuja luetaan uudestaan 15 s välein.
const valoKysely = setInterval(valoKysy, 15000);

// kp 28.10. 21:57:09 yv "tee :auto komento, toimii mulla resillä ja sonalla". kp:n clientissa 21:56
//   kuuntelija oli, 3 tööttiä, 0 ajoa. Väylä EI ollut syy: RSCE_CHAT_EVENT tulee sekä RoomSessionManagerin että roomEnginen väylälle
//   (mitattu robon clientissa 682:ssa). Epäilty syy (mittaamatta): V oli undefined, jos huoneessa ei ollut hahmoja skriptin käynnistyessä,
//   ja aja() palautti false -> korjattu yllä. Tuntematon :komento palaa CommandHandler.handleCommand:ista false -> menee chattiin kaikille.
const vayla = (e0 && e0._roomSessionManager && e0._roomSessionManager.events) || (e0 && e0.events);
const kuule = ev => { try { if (!ev || ev.chatType == null || !SANA.test(String(ev.message || '').trim())) return;
  const s = sessio(), u = s && s.userDataManager && s.userDataManager.getUserDataByIndex(ev.objectId);
  if (!u || !LAUKAISIJAT.includes(String(u.name || '').toLowerCase())) return; tila.aja(); } catch (x) { tila.loki.push({ virhe: String(x) }); } };
if (vayla && vayla.addEventListener) vayla.addEventListener('RSCE_CHAT_EVENT', kuule);
// kp 22:16:09 "voi vitun tyhmä robo :auto komento näky kaikille" · "ja nyt se paljastu": oma ":auto" (chat, huuto, kuiskaus) pudotetaan
//   lähetyksestä (send-koukku yllä) eikä mene palvelimelle, ja laukaisu kulkee Messenger-skriptien datakanavalla (window.kuplaScripts,
//   sama kuin 681:n mitattu jako 27.10.) jokaiselle moottorilla varustetulle clientille. Lähettäjä saa oman kaikunsa ja ajaa siitä.
//   Chat-kuuntelija yllä jää varaksi pelaajalle jolla ei ole moottoria (hänen :autonsa näkyy silloin kuten ennen).
const ks = window.kuplaScripts, AIHE = 'h656.auto';
const autoViesti = x => { const a = x && typeof x.getMessageArray === 'function' && x.getMessageArray(); return Array.isArray(a) && a.some(v => typeof v === 'string' && SANA.test(v.trim())); };
const autoLaheta = () => { const oma = String((sessio() && sessio().userDataManager && (sessio().userDataManager.getUserDataByIndex(omaIndeksi()) || {}).name) || '').toLowerCase();
  tila.loki.push({ auto: 'oma', oma, kanava: !!ks });
  if (!LAUKAISIJAT.includes(oma)) return; if (!ks) { tila.aja(); return; }
  try { ks.send(AIHE, JSON.stringify({ t: Date.now() })); } catch (x) { tila.loki.push({ auto: 'virhe', viesti: String(x) }); tila.aja(); } };
let ksPois = null;
if (ks) try { ks.subscribe(AIHE);
  ksPois = ks.on('message', m => { try { if (!m || m.topic !== AIHE) return;
    tila.loki.push({ auto: 'saatu', kenelta: m.senderName });
    if (LAUKAISIJAT.includes(String(m.senderName || '').toLowerCase())) tila.aja(); } catch (x) {} });
} catch (x) { tila.loki.push({ auto: 'kanava virhe', viesti: String(x) }); }
// send-koukku asennetaan heti (ennen vain ajon alussa), 2 s välein koska uudelleenyhdistys tuo uuden yhteysolion.
const koukkuAjastin = setInterval(() => { try { kavelyEsto(); } catch (x) {} }, 2000); try { kavelyEsto(); } catch (x) {}
tila.autoKanava = () => autoLaheta();   // konsolista / robolta: pila.autoKanava()

return () => {
  clearInterval(ajastus);
  clearInterval(valoAloitus); clearInterval(valoAjastin); clearInterval(valoKysely);
  try { if (valoYhteys && valoYhteys.handleMessages === valoOma) { if (valoAlkup === Object.getPrototypeOf(valoYhteys).handleMessages) delete valoYhteys.handleMessages; else valoYhteys.handleMessages = valoAlkup; } } catch (x) {}
  for (const [id, s] of valot.alkup) { try { const o = e0.getRoomObject(huone, id, 10); if (o) e0.updateRoomObjectFloor(huone, id, o.getLocation(), o.getDirection(), s, null); } catch (x) {} }
  if (vayla && vayla.removeEventListener) vayla.removeEventListener('RSCE_CHAT_EVENT', kuule);
  clearInterval(koukkuAjastin);
  try { if (typeof ksPois === 'function') ksPois(); if (ks) ks.unsubscribe(AIHE); } catch (x) {}
  if (kehys) { cancelAnimationFrame(kehys); clearTimeout(kehys); }
  kyytiLoppu();
  try { const a = autoAlku && e0.getRoomObject(huone, AUTO, 10); if (a) e0.updateRoomObjectFloor(huone, AUTO, new V(autoAlku.x, autoAlku.y, autoAlku.z), new V(autoAlku.d), a.getState(0), null); } catch (x) {}
  for (const id of veret) { try { e0.removeRoomObjectFloor(huone, id); } catch (x) {} } veret.clear();
  for (const k of kaatuneet.values()) { try { e0.removeRoomObjectUser(huone, k.g); } catch (x) {} palauta(k.talteen); } kaatuneet.clear(); omaAlhaalla = false;
  try { if (lahetysYhteys && lahetysYhteys.send === lahetysOma) { if (lahetysAlkup === Object.getPrototypeOf(lahetysYhteys).send) delete lahetysYhteys.send; else lahetysYhteys.send = lahetysAlkup; } } catch (x) {}
  if (window.pila === tila) delete window.pila;
};
