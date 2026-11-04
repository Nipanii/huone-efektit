// Huone 424 (zen den, kurkkupomo): kaikki punaiset tyynyt (furni-tyyppi 1583, luokka pillow*2, "Tyyny") piirretään valtaistuimina (tyyppi 230, luokka
//   throne, "Kuninkaantuoli") jokaiselle moottorilla varustetulle clientille. kp 4.11. 07:16-07:29: "piirtää. kaikki x tavarat muunetaan y
//   tavaraks" · "huoneessa olevat siis" · "ei inventoori" · osoitin Tyyny #osoita:r424:f284873 · "juuri nuo punaiset tyynyt" ·
//   "ja nyt sitä ei voi kääntää" · "ja ei ehk poimia". Vain huoneen esineet, ei inventoria. PALVELIMEN data ei muutu.
// TAPA (v2): esineen id PYSYY samana, vain sen tyyppi-id vaihtuu 1583 -> 230. Siksi palvelimen kaikki päivitykset (käännös, siirto, korkeus,
//   tila, poisto/poiminta) osuvat samaan id:hen kuin ennenkin, ja klikkaus/siirto/poiminta lähettää palvelimelle alkuperäisen id:n.
//   v1 poisti alkuperäisen ja piirsi toisen negatiivisella id:llä, jolloin käännös ja poiminta eivät löytäneet esinettä.
//   1) kääre RoomEngine.addFurnitureFloorin ympärille: huoneeseen tuleva tai palvelimelta lisättävä SAANNOT-listan mista-tyyppinen esine luodaan mihin-tyyppisenä
//      samalla id:llä; 2) huoneessa jo olevat vaihdetaan poistamalla ja lisäämällä samalla id:llä (paikka, suunta, data, omistaja, käyttöoikeus säilyvät).
//   Pysäytettäessä kääre pois ja vaihdetut palautetaan 1583:ksi samoilla id:illä.
// Istumakorkeus: palvelimen items_base-dumpissa (nitro/data/items-base/dump-202610010618.sql) pillow*2 ja throne ovat molemmat stack_height 1.00
//   ja istuja saa wire-statuksen sit 1.0 (mitattu Ezkey 7,8: z 0.2, sit 1.0, client z 1.2), joten istuja on jo valtaistuimen istumakorkeudella eikä
//   korjausta tarvita. Istujan suunta tulee palvelimelta esineen suunnasta, ja esineen suunta on sama kuin ennen.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
// VAIHDETTAVAT (kp 07:20 "source esine voi vaihtua myöhemmin", 07:43 toinen sääntö): sääntölista, yksi rivi per vaihto. mista/mihin = furniture_type_id.
//   Väri on tyypin oma (1583 = pillow*2, furniture_color 2). Lisää, poista tai muuta rivejä; mikään muu koodi ei tiedä tyypeistä.
const SAANNOT = [
  { mista: 1583, mihin: 230 },          // punainen Tyyny -> Kuninkaantuoli (throne)
  { mista: 425624465, mihin: 1619 },    // Lelu ankka (yang_d3_SPLITDuck, esine 528210) -> Musta lohikäärmelamppu (rare_dragonlamp)
  { mista: 425624520, mihin: 449 },     // Tupakoiva ankka (yang_d61_Bald_duck, esine 528216) -> djesko_turntable
];
const MIHIN = new Map(SAANNOT.map(s => [s.mista, s.mihin])), MISTA = new Map(SAANNOT.map(s => [s.mihin, s.mista]));
const tila = window.troni424 = { versio: 'huone-424-v2', huone, vaihdetut: new Set(), loki: [] };
const fdata = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
  writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
  initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
  compare() { return false; }, setString() {}, getValue() { return ''; } });
// Päälle/pois KOKO HUONEELLE (kp 07:57 ":toggleitems", 08:02 "päivittää myös muille", 08:04 "käytetää mun vps vaikka palvelimena"): tila on VPS:llä
//   (vps/kupla-huonetila.js, Caddy /huonetila/*, levylle tallessa). Jokainen client hakee sen huoneeseen tullessa ja pollaa POLLI ms välein, joten myöhemmin
//   tuleva saa nykytilan. POST hyväksytään vain user id 282:lle (kurkkupomo). 🔴 Se id on clientin oma väite, devtoolsista väärennettävissä; palvelin ei voi tarkistaa sitä.
//   Komento kuten aa-kytkin 0.6.4: Enter-kaappaus (capture) pelin chat-kentässä, rivi ei lähde palvelimelle, kenttä tyhjennetään; vahvistus omana chattirivinä
//   vain itselle (RSCE_CHAT_EVENT). Rekisteröidään myös window.kuplaKomennotJono:on (Resin kuplaKomennot-lisäosa), ja oma kaappaus väistää jos lisäosa hoitaa komennon.
const PALVELIN = 'https://49-12-45-218.sslip.io/huonetila/', POLLI = 4000, VALIMUISTI = 'kupla424Esinekorvaukset', OMISTAJA_ID = 282;
let paalla = null;   // null = ei vielä tietoa palvelimelta: ei vaihdeta mitään (verho peittää huoneen lataamisen ajan), 3 s jälkeen viimeksi tiedetty tai päällä
const alku = e.addFurnitureFloor, omaAlku = Object.prototype.hasOwnProperty.call(e, 'addFurnitureFloor');
const kaare = function (huoneId, id, tyyppi) {
  const a = Array.prototype.slice.call(arguments);
  if (paalla === true && huoneId === huone && MIHIN.has(tyyppi) && id > 0) { a[2] = MIHIN.get(tyyppi); tila.vaihdetut.add(id); }
  return alku.apply(this, a);
};
e.addFurnitureFloor = kaare;
// Korvaa huoneessa jo olevan esineen toisella tyypillä samalla id:llä. mista -> mihin: tyyppi-id:t.
// Omistaja (kp 07:39 "puuttuu omistaja vielä"): infostand lukee omistajan esineen mallista (furniture_owner_id / furniture_owner_name, jotka palvelin
//   antaa kun esine lisätään). Ne luetaan ennen vaihtoa ja annetaan uudelle objektille; talteen myös window.troni424Omistajat-karttaan, joka säilyy
//   skriptin uudelleenkäynnistyksen yli, koska tyhjä malli (-1, '') on merkki aiemmin menetetystä omistajasta (v1 palautti tyynyt ilman omistajaa).
const omistajat = window.troni424Omistajat = window.troni424Omistajat || new Map();
const korvaa = (o, mihin) => {
  const m = o.model, l = o.getLocation(), V = l.constructor, id = o.id;
  const v = (k, d) => { const x = m.getValue(k); return x == null ? d : x; };
  const oid = v('furniture_owner_id', -1), onimi = v('furniture_owner_name', '');
  if (oid > 0 || onimi) omistajat.set(id, { id: oid, nimi: onimi, kaytto: v('furniture_usage_policy', 0), oikea: v('furniture_real_room_object', 0) });
  const om = omistajat.get(id) || { id: oid, nimi: onimi, kaytto: v('furniture_usage_policy', 0), oikea: v('furniture_real_room_object', 0) };
  e.removeRoomObjectFloor(huone, id);
  return alku.call(e, huone, id, mihin, new V(l.x, l.y, l.z), new V(o.getDirection().x), 0, fdata(String(v('furniture_data', '0'))), Number(m.getValue('furniture_extras')),
    v('furniture_expiry_time', -1), om.kaytto, om.id, om.nimi, true, !!om.oikea);
};
const vaihda = () => {
  if (e.activeRoomId !== huone) return;
  let lattia; try { lattia = e.getRoomObjects(huone, 10) || []; } catch (x) { return; }
  for (const o of lattia.slice()) {
    try { const tt = o.model.getValue('furniture_type_id'); if (o.id > 0 && MIHIN.has(tt)) { korvaa(o, MIHIN.get(tt)); tila.vaihdetut.add(o.id); } }
    catch (x) { tila.loki.push(String(x)); }
  }
};
// Palautus (sama polku pysäytyksessä ja :toggleitems pois): kaikki vaihdetut takaisin alkuperäiseen tyyppiin samalla id:llä ja omistajalla.
const palauta = () => {
  try { for (const id of tila.vaihdetut) { const o = e.getRoomObject(huone, id, 10); const tt = o && o.model.getValue('furniture_type_id'); if (o && MISTA.has(tt)) korvaa(o, MISTA.get(tt)); } } catch (x) {}
  tila.vaihdetut.clear();
};
const tikki = setInterval(() => { if (paalla === true) vaihda(); }, 1500);
const omaRivi = (teksti) => {   // kuten kayttajat/aa/aa-kytkin.user.js omaRivi: pelin oma chat-tapahtuma, ei palvelimelle
  try {
    const ses = e._roomSessionManager && e._roomSessionManager.getSession(e.activeRoomId);
    if (!e.events || !ses) return false;
    e.events.dispatchEvent({ type: 'RSCE_CHAT_EVENT', session: ses, objectId: ses.ownRoomIndex, message: teksti, chatType: 1, style: 0, chatColours: '', links: null,
      extraParam: -1, prefixText: '', prefixColor: '', prefixIcon: '', prefixEffect: '', prefixFont: '', nickIcon: '', displayOrder: 'icon-prefix-name' });
    return true;
  } catch (x) { return false; }
};
const kayta = (uusi) => { if (uusi === paalla) return; paalla = uusi; try { window.localStorage.setItem(VALIMUISTI, uusi ? 'on' : 'off'); } catch (x) {} if (uusi) vaihda(); else palauta(); };
const haeTila = () => fetch(PALVELIN + huone, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(o => { if (o && typeof o.paalla === 'boolean') kayta(o.paalla); }, () => {});
const omaId = () => { try { const d = (o, k) => { const x = o && Object.getOwnPropertyDescriptor(o, k); return x && !x.get ? x.value : undefined; }; const u = d(d(e, '_sessionDataManager'), '_userId'); return u > 0 ? u : 0; } catch (x) { return 0; } };
const vaihdaTila = () => {
  if (omaId() !== OMISTAJA_ID) return omaRivi('esinekorvaukset: vain huoneen omistaja voi vaihtaa');
  const uusi = paalla === false;   // pois -> päälle, muuten pois
  fetch(PALVELIN + huone, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paalla: uusi, id: OMISTAJA_ID, nimi: 'kurkkupomo' }) })
    .then(r => r.ok ? r.json() : Promise.reject(r.status)).then(o => { kayta(o.paalla); omaRivi(o.paalla ? 'esinekorvaukset: päällä (kaikille)' : 'esinekorvaukset: pois (kaikille)'); },
      err => omaRivi('esinekorvaukset: palvelin ei vastannut (' + err + ')'));
};
haeTila();
const pollaus = setInterval(haeTila, POLLI);
const oletus = setTimeout(() => { if (paalla === null) { let v = true; try { v = window.localStorage.getItem(VALIMUISTI) !== 'off'; } catch (x) {} kayta(v); } }, 3000);   // palvelin ei vastannut: viimeksi tiedetty, muuten päällä
tila.vaihdaTila = vaihdaTila;
const jono = window.kuplaKomennotJono = window.kuplaKomennotJono || [], jonoRivi = [['toggleitems'], () => vaihdaTila(), 'huone 424: esinekorvaukset päälle/pois (vain sinulle)', 'Huone 424'];
jono.push(jonoRivi);
const komennotHoitaa = () => { try { return !!(window.kuplaKomennot && window.kuplaKomennot.lista().some(k => k.nimet.includes('toggleitems'))); } catch (x) { return false; } };
const nappain = (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing) return;
  const t = ev.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  if (!/^s*:toggleitemss*$/i.test(t.value || '') || komennotHoitaa()) return;
  ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set; setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) { t.value = ''; }
  vaihdaTila();
};
document.addEventListener('keydown', nappain, true);
return () => {
  clearInterval(tikki); clearInterval(pollaus); clearTimeout(oletus); document.removeEventListener('keydown', nappain, true);
  const i = jono.indexOf(jonoRivi); if (i >= 0) jono.splice(i, 1);
  if (e.addFurnitureFloor === kaare) { if (omaAlku) e.addFurnitureFloor = alku; else delete e.addFurnitureFloor; }
  palauta();
  delete window.troni424;
};
