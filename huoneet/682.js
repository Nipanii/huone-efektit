// Huone 682 (Halloween rata 3/6 (ruoka)): piiloalue, joka näkyy vasta kun oma hahmo on siellä.
//
// kp 28.10. 16:43:46 "niin tuo alue minne pääsee kun teleporttaa pitäs näkyä vasta kun sinne pääsee" · 16:44:42 "tehdään scriptillä se
//   jos mahdollista" · 16:44:48 "se on tosi sus wired" · 16:46:17 "robo lattia pitää myös piilottaa sitten".
// Alue = korotettu taso z 26 huoneen vasemmassa reunassa (x 1-6, y 26-39): xmas_c22_woodenfloor-lattiapalat, sänky, keittiö, tuolit,
//   ja teleportin kohde Nuolilaatta 438305 (6,28). Mitattu robolla 28.10. 16:51 (kp:n osoitus #osoita:p:682:-1053,-677,-300,-240
//   on huonepikseleissä ja osuu tason yläosaan; raja on tässä ruutuina, ettei se riipu kamerasta).
// Piilotus kuten hween-wired.js: furniture_wired_opacity 0 + furniture_wired_click_through 1 (FurnitureVisualization.ts:245-258).
//   Ne eivät nollaudu itsestään, joten ajastin vain vaihtaa tilaa kun oma hahmo tulee alueelle tai lähtee sieltä, ja ottaa mukaan
//   myöhemmin lisätyt furnit. Wired-laatikot jätetään hween-wired.js:lle (muuten näyttäminen paljastaisi ne kaikille).
// Lattia: tason oma lattia on huoneen korkeuskarttaa (x 1-6, y 26-39, korkeus 26, ympärillä tyhjää), ei furnia (kp 17:14:57 "oot
//   piilottanu sen alueen tavarat mut et lattiaa"). Se piilotetaan clientin omalla aluepiilolla RoomEngine.updateAreaHide
//   (RoomEngine.ts:665-693 -> lattiareiät RoomPlaneParser.addFloorHole), vain tässä clientissä, 0 pakettia. Reikä osuu vain
//   suorakaiteen olemassa oleviin ruutuihin, ja tässä suorakaiteessa niitä on vain tasolla. REIKA = keksitty furni-id (reikien id:t
//   -(id*10000+i+1)); aluepiilo-widget reagoi vain omaan avoimeen furniinsa. Mitattu robolla 17:20: 14 reikää, taso pois kuvasta.
// RAJA: muiden hahmot alueella näkyvät edelleen (vain furnit ja lattia piilotetaan). Koskee vain pelaajia joilla huoneskriptimoottori on päällä.
// Konsolissa: huone682.piilossa (montako furnia piilossa) · huone682.nakyy · huone682.pakota(true|false|null) testiin.
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

const ALUE = { x0: 0, x1: 7, y0: 25, y1: 40, zMin: 20 };
const WIRED = /^wf_(trg|act|cnd|xtra|slc|var)_/;
const REIKA = 6820;
const sisalla = (l) => l && l.x >= ALUE.x0 && l.x <= ALUE.x1 && l.y >= ALUE.y0 && l.y <= ALUE.y1 && l.z >= ALUE.zMin;
const tila = window.huone682 = { piilossa: 0, nakyy: false, pakko: null, pakota(v) { tila.pakko = v; paivita(); } };

const omaIndeksi = () => {
  const sm = Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i;
};
const omaAlueella = () => { const i = omaIndeksi(); const o = i == null ? null : e.getRoomObject(huone, i, 100); return !!(o && sisalla(o.getLocation())); };

const asetettu = new Map();   // furni -> 0 (piilossa) / 1 (näkyy)
const aseta = (o, n) => { if (asetettu.get(o) === n) return; try { o.model.setValue('furniture_wired_opacity', n); o.model.setValue('furniture_wired_click_through', n ? 0 : 1); asetettu.set(o, n); } catch (x) {} };
const paivita = () => {
  tila.nakyy = tila.pakko == null ? omaAlueella() : !!tila.pakko;
  const n = tila.nakyy ? 1 : 0; let piilossa = 0;
  if (tila.reika !== !n) { try { e.updateAreaHide(huone, REIKA, !n, ALUE.x0, ALUE.y0, ALUE.x1 - ALUE.x0 + 1, ALUE.y1 - ALUE.y0 + 1, false); tila.reika = !n; } catch (x) {} }
  for (const o of e.getRoomObjects(huone, 10) || []) {
    if (!o || !o.model || WIRED.test(String(o.type || '').toLowerCase()) || !sisalla(o.getLocation())) continue;
    aseta(o, n); if (!n) piilossa++;
  }
  tila.piilossa = piilossa;
};
paivita();
const ajastin = setInterval(paivita, 250);

return () => {
  clearInterval(ajastin);
  try { e.updateAreaHide(huone, REIKA, false, 0, 0, 0, 0, false); } catch (x) {}
  for (const o of asetettu.keys()) try { o.model.setValue('furniture_wired_opacity', 1); o.model.setValue('furniture_wired_click_through', 0); } catch (x) {}
  if (window.huone682 === tila) delete window.huone682;
};
