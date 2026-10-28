// Halloween RATA 2026 -huoneet (lobby 656 + radat): wired-laatikot näkyvät vain rakentajille.
//
// kp 28.10. 11:12 "jos item type on wired niin se ei renderöi niitä muille kuin minä sona ja res" · 11:14 "et me voidaan vapaasti
//   muokkaa wiredeitä vaik huone olis jo auki" · 11:18 "sun pitää kans olla whitelistillä" · 11:18 "kaikki hween huoneet pitää sit olla
//   tää systeemi: vaan me jotka buildataan niitä näkee wiredit". Sama tiedosto on huoneet.json:ssa jokaisen Halloween-huoneen kohdalla.
//   Palvelimen :hidewired piilottaa kaikilta, myös omistajalta (Habbo-Daybreak RoomManager.java:1027), joten muilla piilotus tehdään tässä clientissä.
// Laukaisin on pelin oma RoomEngine.addObjectFurnitureFromData (jokainen lattiafurni luodaan sen kautta: huoneeseen tulo, uusi furni,
//   :hidewired pois, grafiikan latauksen jälkeinen uudelleenluonti, RoomEngine.ts:943 ja :1842), ei ajastin. Piilotus on
//   furniture_wired_opacity 0 + furniture_wired_click_through 1 (FurnitureVisualization.ts:245-258: alpha 0, varjo 0, klikkaus läpi).
//   Ne kentät eivät nollaudu itsestään, toisin kuin furniture_alpha_multiplier, jonka FurnitureLogic asettaa 1:ksi (siksi 681.js pollaa).
// Vain wired-laatikot (wf_trg/act/cnd/xtra/slc/var), EI pelifurnit kuten wf_arrowplate. Tyyppi puuttuu -> ei piiloteta (muuten tavallinen furni voisi kadota kaikilta).
// RAJA: koskee vain pelaajia joilla huoneskriptimoottori on päällä. Paketit tulevat silti clientille; tämä on näkymä, ei suojaus.
// kp 28.10. 17:27 "tehään muutos wired whitelist scriptiin: se whitelistaa ne joilla on oikat niihin huoneisiin": näkyy myös jos tällä
//   pelaajalla on huoneen oikeudet (RoomSession.controllerLevel >= 1 GUEST..MODERATOR, RoomControllerLevel.ts, tai isRoomOwner).
//   Oikeudet tulevat serveriltä vasta huoneeseen tulon jälkeen ja voivat muuttua kesken (anna/poista oikeudet), siksi tarkistus 1 s välein.
// Konsolissa: hweenWired.piilossa (montako laatikkoa piilossa) · hweenWired.nakyy (näkeekö tämä pelaaja wiredit) · hweenWired.syy
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
const NAKYY = [282, 281, 1, 245];   // user-id:t (nimi voi vaihtua): kurkkupomo, sona, Res, Herra-Robotti
const WIRED = /^wf_(trg|act|cnd|xtra|slc|var)_/;
const sdm = e && e._sessionDataManager;
const listalla = NAKYY.includes(Number(sdm && sdm._userId));
const tila = window.hweenWired = { nakyy: listalla, piilossa: 0, syy: listalla ? 'lista' : null };
if (!e || listalla) return () => { if (window.hweenWired === tila) delete window.hweenWired; };

const oikeudet = () => {
  try { const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
    return !!(s && (s.isRoomOwner || s.controllerLevel >= 1)); } catch (x) { return false; }
};
const piilossa = new Set();
const piilota = (o) => {
  if (tila.nakyy || !o || !o.model || !WIRED.test(String(o.type || '').toLowerCase())) return;
  o.model.setValue('furniture_wired_opacity', 0); o.model.setValue('furniture_wired_click_through', 1);
  piilossa.add(o); tila.piilossa = piilossa.size;
};
const palauta = () => {
  for (const o of piilossa) try { o.model.setValue('furniture_wired_opacity', 1); o.model.setValue('furniture_wired_click_through', 0); } catch (x) {}
  piilossa.clear(); tila.piilossa = 0;
};
const tarkista = () => {
  const n = oikeudet(); if (n === tila.nakyy) return;
  tila.nakyy = n; tila.syy = n ? 'oikeudet' : null;
  if (n) palauta(); else for (const o of e.getRoomObjects(huone, 10) || []) piilota(o);
};
const alkup = e.addObjectFurnitureFromData, oma = Object.prototype.hasOwnProperty.call(e, 'addObjectFurnitureFromData');
const koukku = function (roomId, id) {
  const t = alkup.apply(this, arguments);
  try { if (roomId === huone) piilota(e.getRoomObject(roomId, id, 10)); } catch (x) {}
  return t;
};
e.addObjectFurnitureFromData = koukku;
tila.nakyy = oikeudet(); tila.syy = tila.nakyy ? 'oikeudet' : null;
for (const o of e.getRoomObjects(huone, 10) || []) piilota(o);   // moottori käynnisti tämän kesken huoneen
const ajastin = setInterval(tarkista, 1000);

return () => {
  clearInterval(ajastin);
  if (e.addObjectFurnitureFromData === koukku) { if (oma) e.addObjectFurnitureFromData = alkup; else delete e.addObjectFurnitureFromData; }
  palauta();
  if (window.hweenWired === tila) delete window.hweenWired;
};
