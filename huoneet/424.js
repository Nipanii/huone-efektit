// Huone 424 (zen den, kurkkupomo): kaikki tyynyt (furni-tyyppi 1583, luokka pillow, "Tyyny") piirretään valtaistuimina (tyyppi 230, luokka
//   throne, "Kuninkaantuoli") jokaiselle moottorilla varustetulle clientille. kp 4.11. 07:16-07:18: "piirtää. kaikki x tavarat muunetaan y
//   tavaraks" · "huoneessa olevat siis" · "ei inventoori" · osoitin Tyyny #osoita:r424:f284873 · aiemmin 07:11 "furni: 230 (throne)".
//   Vain huoneen esineet, ei inventoria. PALVELIMEN data ei muutu: tyynyt ovat palvelimella yhä tyynyjä, tämä vaihtaa vain oman clientin
//   piirron. Tapa: pelin oma removeRoomObjectFloor + addFurnitureFloor (tyyppi-id) samaan ruutuun/korkeuteen/suuntaan, uusi id = -960000 - oikea id
//   (sama kuin 656.js:n veri). Pysäytettäessä tai huoneesta lähdettäessä tyynyt palautetaan alkuperäisillä id:illä.
// Väri (kp 07:19 "juuri nuo punaiset tyynyt"): tyyppi 1583 + furniture_color 2 (esine 284873:n arvo; kaikki 4 huoneen tyynyä ovat 2). Muunväriset jäävät ennalleen.
// Mitattu 4.11. robon clientista (:9223): tyyppi 1583, 4 kpl, kaikki ruudussa 7,8 z 0.2 (284872, 284873, 273421, 273422).
// Raja: jos palvelin siirtää/poistaa tyynyn kesken, client ei löydä vaihdettua objektia; 1,5 s tikki vaihtaa uudelleen kaikki tyynyt joita
//   ilmestyy (esim. huoneen uudelleenlataus), joten vanha tyynyn id tulee takaisin tikin jälkeen valtaistuimena.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
// VAIHDETTAVAT (kp 07:20 "source esine voi vaihtua myöhemmin"): vaihda vain tämä yksi rivi.
const LAHDE = { tyyppi: 1583, vari: 2 };   // punainen Tyyny: furniture_type_id ja furniture_color (väri tulee tyypin furnidatasta, palautus samalla tyyppi-id:llä)
const KOHDE = { tyyppi: 230 };                                    // Kuninkaantuoli (luokka throne)
const KANTA = -960000;
const tila = window.troni424 = { versio: 'huone-424', huone, vaihdetut: new Map(), loki: [] };
const fdata = (st) => ({ flags: 0, uniqueNumber: 0, uniqueSeries: 0, rarityLevel: -1, state: 0,
  writeRoomObjectModel(m) { m.setValue('furniture_data_format', 0); m.setValue('furniture_data', st); },
  initializeFromRoomObjectModel() {}, parseWrapper() {}, getLegacyString() { return st; },
  compare() { return false; }, setString() {}, getValue() { return ''; } });
const lisaa = (id, tyyppi, V, x, y, z, suunta) => e.addFurnitureFloor(huone, id, tyyppi, new V(x, y, z), new V(suunta), 0, fdata('0'), NaN, -1, 0, -1, '', true, false);
const vaihda = () => {
  if (!e || e.activeRoomId !== huone) return;
  let lattia; try { lattia = e.getRoomObjects(huone, 10) || []; } catch (x) { return; }
  for (const o of lattia.slice()) {
    try {
      if (o.id < 0 || o.model.getValue('furniture_type_id') !== LAHDE.tyyppi || o.model.getValue('furniture_color') !== LAHDE.vari) continue;
      const l = o.getLocation(), V = l.constructor, suunta = o.getDirection().x, uusi = KANTA - o.id;
      const rec = { x: l.x, y: l.y, z: l.z, suunta };
      e.removeRoomObjectFloor(huone, o.id);
      if (lisaa(uusi, KOHDE.tyyppi, V, rec.x, rec.y, rec.z, suunta)) tila.vaihdetut.set(o.id, rec);
      else { lisaa(o.id, LAHDE.tyyppi, V, rec.x, rec.y, rec.z, suunta); tila.loki.push('lisäys epäonnistui ' + o.id); }   // ei jätetä tyhjää
    } catch (x) { tila.loki.push(String(x)); }
  }
};
vaihda();
const tikki = setInterval(vaihda, 1500);
return () => {
  clearInterval(tikki);
  try { const lattia = e.getRoomObjects(huone, 10) || [], V = lattia[0] && lattia[0].getLocation().constructor;
    for (const [id, r] of tila.vaihdetut) { try { e.removeRoomObjectFloor(huone, KANTA - id); lisaa(id, LAHDE.tyyppi, V, r.x, r.y, r.z, r.suunta); } catch (x) {} } } catch (x) {}
  delete window.troni424;
};
