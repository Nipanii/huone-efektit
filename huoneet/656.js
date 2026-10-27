// Huone 656: väliaikainen Halloween-pila 2, pyörremyrsky (kp 28.10. 00:20:38 "saisko sittenkin öö pyörremyrskyn joka tulee ja nappaa
//   kaikki", 00:20:50 "me ollaa tehty pyörremyrsky kerran aiemmin sitä voi käyttää pohjana"). Pohja: re-lab userscriptit/datajako/demot/
//   pyorre.js (Res 1.10., kalusteet kiertoradalle suppiloon), hahmojen haamut ja kävelyesto edellisestä 656-pilasta (auto, git-historiassa).
// Kulku: myrsky syntyy tien itäpäähän (41,16), kulkee tietä länteen mutkitellen ja nappaa kaiken säteellä R, palaa keskelle ja imee
//   loput hahmot koko huoneesta, pyörittää kaikkia ilmassa, ja heittää jokaisen takaisin omalle paikalleen makaamaan LEPO ms.
//   Kalusteet putoavat takaisin tarkalleen alkuperäisille paikoilleen; palvelimen kesken myrskyn siirtämä kaluste jätetään rauhaan.
// Kaikki paikallista: palvelimelle ei lähde mitään, paitsi että oma UNIT_WALK (3320) jätetään lähettämättä kun oma hahmo on myrskyssä.
// Käynnistys ajastettu (ALKAA, epoch ms): kaikki clientit samasta kellonajasta, myöhässä latautuva liittyy kesken. Konsolista: pila.aja().
const e0 = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e0 && e0.activeRoomId);
const tila = window.pila = { versio: 'huone-656-pyorre', huone, ajossa: false, loki: [] };
const V = e0 && e0.getRoomObjects(huone, 100)[0] && e0.getRoomObjects(huone, 100)[0].getLocation().constructor;
const OHITA = /^(conf_|hole|nyc_c23_building|nyc_c23_firestairs)/;   // näkymättömät ohjaimet, reiät ja talot jäävät maahan
const R = 2.4, LEPO = 5000;
const T_SYNTY = 1500, T_LANSI = 9500, T_KESKI = 12500, T_HUIPPU = 19000, T_PUDOTUS = 1400, KESTO = T_HUIPPU + T_PUDOTUS + LEPO + 800;
const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const keskus = t => {
  if (t < T_SYNTY) return [41, 16];
  if (t < T_LANSI) { const u = (t - T_SYNTY) / (T_LANSI - T_SYNTY); return [41 - u * 26, 16 + Math.sin(u * Math.PI * 3) * 2]; }
  if (t < T_KESKI) { const u = ease((t - T_LANSI) / (T_KESKI - T_LANSI)); return [15 + u * 12, 16 - u]; }
  return [27 + Math.sin(t / 700) * 0.6, 15 + Math.cos(t / 900) * 0.6];
};
const voima = t => Math.min(1, t / T_SYNTY);   // suppilo kasvaa syntyessä ja pysyy täytenä huippuun asti

let haamuId = -960001, ajo = null, kehys = null, omaMukana = false, lahetysYhteys = null, lahetysOma = null, lahetysAlkup = null;
const roska = new Map();    // kalusteen id -> { o, a0, tg, a, h, irti, viime, p, pt }
const hahmot = new Map();   // hahmon oid -> { g, talteen, tg, alku, a, h, i, heitto, maassa }

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
const kavelyEsto = () => { const c = yhteys(); if (!c || typeof c.send !== 'function' || lahetysYhteys === c) return;
  const alkup = c.send;
  const oma = function (...k) { try { if (omaMukana && this._messages) { k = k.filter(x => this._messages.getComposerId(x) !== 3320); if (!k.length) return true; } } catch (x) {}
    return alkup.apply(this, k); };
  c.send = oma; lahetysYhteys = c; lahetysOma = oma; lahetysAlkup = alkup; };
const piilota = (o, talteen) => { const sp = (o && o.visualization && o.visualization.sprites) || [];
  for (const s of sp) { if (!talteen.has(s)) talteen.set(s, s.alpha); if (s.alpha !== 0) { s.alpha = 0; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } } };
const palautaNakyvyys = talteen => { for (const [s, a] of talteen) { s.alpha = a > 0 ? a : 255; if (s.increaseUpdateCounter) s.increaseUpdateCounter(); } talteen.clear(); };
const sama = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

// Kiertorata: korkeus h (0..1) määrää säteen ja korkeuden, alhaalla kapea ja ylhäällä leveä kuten suppilo.
const rata = (k, t, cx, cy, v, hahmo) => {
  const kulma = k.a + t / 1000 * (3.6 - k.h * 1.5), r = (hahmo ? 1.1 + k.h * 3.4 : 0.8 + k.h * 4.2) * (0.4 + 0.6 * v);
  // kp 00:29 "näyttää aika pitkältä toi tornado ukkelit kyl": hahmojen korkeus 0,8-6,3 näytti pinolta -> matalampi ja leveämpi
  const z = ((hahmo ? 0.6 + k.h * 3.0 : 0.2 + k.h * 5.0) * v) + Math.sin(t / 280 + k.a) * 0.25;
  return { x: cx + Math.cos(kulma) * r, y: cy + Math.sin(kulma) * r, z };
};
const nappaaKaluste = (o, t) => { const L = o.getLocation(), i = roska.size, h = ((i * 7) % 20) / 20;
  roska.set(o.id, { o, a0: { x: L.x, y: L.y, z: L.z }, tg: t, a: i * 2.39996, h, irti: false, viime: null }); };
const nappaaHahmo = (o, t) => { const L = o.getLocation(), fig = o.model.getValue('figure'); if (!fig) return;
  const g = haamuId--; if (!e0.addRoomObjectUser(huone, g, new V(L.x, L.y, L.z), new V(90), 90, 1, fig)) return;
  const i = hahmot.size;
  hahmot.set(o.id, { g, talteen: new Map(), tg: t, veto: true, x: L.x, y: L.y, z: L.z, alku: { x: L.x, y: L.y, z: L.z }, a: i * 2.39996 + 1, h: 0.15 + ((i * 5) % 13) / 13 * 0.7, i, heitto: null, maassa: 0 });
  if (o.id === omaIndeksi()) omaMukana = true;
};

const askel = () => {
  const nyt = performance.now(), t = tila.jaada != null ? tila.jaada : nyt - ajo.alku, [cx, cy] = keskus(Math.min(t, T_HUIPPU)), v = voima(t);
  // nappaukset: kalusteet säteellä R koko matkan, hahmot säteellä R ja imussa (T_LANSI ->) koko huoneesta
  if (t < T_HUIPPU - 1500) {
    for (const o of e0.getRoomObjects(huone, 10) || []) { if (o.id < 0 || roska.has(o.id) || OHITA.test(o.type || '')) continue;
      const L = o.getLocation(); if (Math.hypot(L.x - cx, L.y - cy) < R * v) nappaaKaluste(o, t); }
    for (const o of e0.getRoomObjects(huone, 100) || []) { if (o.id < 0 || hahmot.has(o.id) || !o.model || !o.model.getValue('figure')) continue;
      if (t >= T_SYNTY / 2) nappaaHahmo(o, t); }   // kaikki alkavat liukua kohti myrskyä heti kun se syntyy
  }
  for (const k of roska.values()) { if (k.irti) continue; const o = k.o, nytL = o.getLocation();
    if (k.viime && !sama(nytL, k.viime)) { k.irti = true; continue; }   // palvelin siirsi: irti myrskystä
    let p;
    if (t < T_HUIPPU) { const q = rata(k, t, cx, cy, v, false), m = ease(Math.min(1, (t - k.tg) / 700));
      p = { x: k.a0.x + (q.x - k.a0.x) * m, y: k.a0.y + (q.y - k.a0.y) * m, z: k.a0.z + (q.z - k.a0.z) * m }; k.p = p; }
    else { if (!k.pt) k.pt = 900 + k.h * 700; const u = Math.min(1, (t - T_HUIPPU) / k.pt);
      p = { x: k.p.x + (k.a0.x - k.p.x) * ease(u), y: k.p.y + (k.a0.y - k.p.y) * ease(u), z: k.p.z + (k.a0.z - k.p.z) * u * u }; }
    o.setLocation(new V(p.x, p.y, p.z)); k.viime = { x: p.x, y: p.y, z: p.z }; }
  const dt = Math.min(0.05, (nyt - (ajo.viime || nyt)) / 1000); ajo.viime = nyt;
  for (const [oid, k] of hahmot) { try {
    const o = e0.getRoomObject(huone, oid, 100); piilota(o, k.talteen);
    const ho = e0.getRoomObject(huone, k.g, 100);
    // Imu (kp 00:30 "slow pull jos kaukana ja kiihtyy jos lähel"): nopeus = pohja + 9/(etäisyys+0,4) ruutua/s, pieni kierre sivulle.
    //   Pohja kasvaa vaiheittain (0,35 -> 1,4 kun myrsky palaa keskelle -> 5 viimeiset 2,5 s), jotta huoneen toinen pääkin ehtii mukaan.
    //   Kun hahmo on alle 1,3 ruudun päässä keskuksesta, se nousee kiertoradalle.
    if (k.veto && !k.heitto) { const dx = cx - k.x, dy = cy - k.y, d = Math.hypot(dx, dy) || 1e-6;
      const pohja = t < T_LANSI ? 0.35 : t < T_HUIPPU - 2500 ? 1.4 : 5, askelPit = Math.min(d, (pohja + 9 / (d + 0.4)) * v * dt);
      const ux = dx / d, uy = dy / d; k.x += (ux - uy * 0.35) * askelPit; k.y += (uy + ux * 0.35) * askelPit;
      k.z = k.alku.z + Math.max(0, 2.5 - d) * 0.45 + (d < 4 ? Math.abs(Math.sin(t / 120 + k.i)) * 0.15 : 0);
      const suunta = d < 3 ? ((Math.floor(t / 110) + k.i) % 8) * 45 : (((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 2) % 8) + 8) % 8 * 45;
      e0.updateRoomObjectUserLocation(huone, k.g, new V(k.x, k.y, k.z), null, false, 0, new V(suunta), suunta, true, false, 16);
      if (d < 1.3 || t >= T_HUIPPU) { k.veto = false; k.tg = t; k.alku = { x: k.x, y: k.y, z: k.z }; }
      continue; }
    if (t < T_HUIPPU + k.i * 50 && !k.heitto) {
      const q = rata(k, t, cx, cy, v, true), ms = 600, m = ease(Math.min(1, (t - k.tg) / ms));
      const kaari = 0;
      k.x = k.alku.x + (q.x - k.alku.x) * m; k.y = k.alku.y + (q.y - k.alku.y) * m; k.z = k.alku.z + (q.z - k.alku.z) * m + kaari;
      const suunta = ((Math.floor(t / 90) + k.i) % 8) * 45;
      e0.updateRoomObjectUserLocation(huone, k.g, new V(k.x, k.y, k.z), null, false, 0, new V(suunta), suunta, true, false, 16);
    } else if (!k.maassa) {
      if (!k.heitto) { const L = o ? o.getLocation() : k.alku;   // heitetään takaisin oikean hahmon nykyiseen paikkaan
        k.heitto = { alku: nyt, ms: 900 + Math.random() * 500, x0: k.x, y0: k.y, z0: k.z, x1: L.x, y1: L.y, z1: L.z, kierr: Math.random() < .5 ? -1 : 1 }; }
      const f = k.heitto, u = Math.min(1, (nyt - f.alku) / f.ms);
      k.x = f.x0 + (f.x1 - f.x0) * u; k.y = f.y0 + (f.y1 - f.y0) * u; k.z = f.z0 + (f.z1 - f.z0) * u + Math.sin(u * Math.PI) * 1.2;
      const suunta = ((Math.round(u * 10 * f.kierr) % 8) + 8) % 8 * 45;
      e0.updateRoomObjectUserLocation(huone, k.g, new V(k.x, k.y, k.z), null, false, 0, new V(suunta), suunta, true, false, 16);
      if (u >= 1) { k.maassa = nyt; const d = Math.random() < .5 ? 0 : 90;
        e0.updateRoomObjectUserLocation(huone, k.g, new V(f.x1, f.y1, f.z1), null, false, 0, new V(d), d, true, false, 30); }
    }
    if (k.maassa && ho && ho.model.getValue('figure_posture') !== 'lay') e0.updateRoomObjectUserPosture(huone, k.g, 'lay', '');
    if (k.maassa && nyt - k.maassa >= LEPO + k.i * 40) {
      try { e0.removeRoomObjectUser(huone, k.g); } catch (x) {} palautaNakyvyys(k.talteen); hahmot.delete(oid);
      if (oid === omaIndeksi()) omaMukana = false; }
  } catch (x) { if (tila.loki.length < 50) tila.loki.push({ virhe: String(x) }); } }
  if (t >= KESTO && !hahmot.size) { lopeta(); tila.loki.push({ ajo: 'valmis', t: new Date().toTimeString().slice(0, 8) }); return; }
  kehys = document.hidden ? setTimeout(askel, 30) : requestAnimationFrame(askel);
};
const lopeta = () => { if (ajo) ajo.kaynnissa = false; tila.ajossa = false; kehys = null;
  for (const k of roska.values()) if (!k.irti && sama(k.o.getLocation(), k.viime)) k.o.setLocation(new V(k.a0.x, k.a0.y, k.a0.z));
  roska.clear(); };

tila.aja = (ohi = 0) => { if (!e0 || !V || (ajo && ajo.kaynnissa) || ohi >= T_HUIPPU) return false;
  kavelyEsto(); ajo = { alku: performance.now() - ohi, kaynnissa: true }; tila.ajossa = true;
  tila.loki.push({ ajo: 'alku', ohi: Math.round(ohi), t: new Date().toTimeString().slice(0, 8) });
  kehys = document.hidden ? setTimeout(askel, 30) : requestAnimationFrame(askel); return true; };
tila.tilanne = () => ({ ajossa: tila.ajossa, t: ajo ? Math.round(performance.now() - ajo.alku) : null, kalusteita: roska.size, hahmoja: hahmot.size,
  makaa: [...hahmot.values()].filter(k => k.maassa).length });

const ALKAA = 1793140890000;   // 28.10. 00:41:30 (kp 00:38 "joo oli hyvä saisko jo sen")
const ajastus = ALKAA ? setTimeout(() => tila.aja(Math.max(0, Date.now() - ALKAA)), Math.max(0, ALKAA - Date.now())) : null;

return () => {
  clearTimeout(ajastus);
  if (kehys) { cancelAnimationFrame(kehys); clearTimeout(kehys); }
  lopeta();
  for (const k of hahmot.values()) { try { e0.removeRoomObjectUser(huone, k.g); } catch (x) {} palautaNakyvyys(k.talteen); } hahmot.clear(); omaMukana = false;
  try { if (lahetysYhteys && lahetysYhteys.send === lahetysOma) { if (lahetysAlkup === Object.getPrototypeOf(lahetysYhteys).send) delete lahetysYhteys.send; else lahetysYhteys.send = lahetysAlkup; } } catch (x) {}
  if (window.pila === tila) delete window.pila;
};
