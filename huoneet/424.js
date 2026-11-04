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
];
const MIHIN = new Map(SAANNOT.map(s => [s.mista, s.mihin])), MISTA = new Map(SAANNOT.map(s => [s.mihin, s.mista]));
const tila = window.troni424 = { versio: 'huone-424-v2', huone, vaihdetut: new Set(), loki: [] };
const fdata = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
  writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
  initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
  compare() { return false; }, setString() {}, getValue() { return ''; } });
const alku = e.addFurnitureFloor, omaAlku = Object.prototype.hasOwnProperty.call(e, 'addFurnitureFloor');
const kaare = function (huoneId, id, tyyppi) {
  const a = Array.prototype.slice.call(arguments);
  if (huoneId === huone && MIHIN.has(tyyppi) && id > 0) { a[2] = MIHIN.get(tyyppi); tila.vaihdetut.add(id); }
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
vaihda();
const tikki = setInterval(vaihda, 1500);
return () => {
  clearInterval(tikki);
  if (e.addFurnitureFloor === kaare) { if (omaAlku) e.addFurnitureFloor = alku; else delete e.addFurnitureFloor; }
  try { for (const id of tila.vaihdetut) { const o = e.getRoomObject(huone, id, 10); const tt = o && o.model.getValue('furniture_type_id'); if (o && MISTA.has(tt)) korvaa(o, MISTA.get(tt)); } } catch (x) {}
  delete window.troni424;
};
