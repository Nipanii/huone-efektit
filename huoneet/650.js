// Huone 650 (Halloween rata 1/6): tyhjä pohja huonekohtaisille efekteille.
// kp 28.10. 16:02:08 "luo tyhjä pohja event huoneille joilla ei vielä ole". Wired-piilotus on erikseen huoneet/hween-wired.js.
// Moottori ajaa tämän new Function('kupla', koodi)(api) huoneeseen tullessa ja kutsuu palautettua funktiota kun huoneesta lähdetään.
//   kupla.roomId() = tämä huone. Mallit: huoneet/681.js (miinat), huoneet/684.js (pimeys), huoneet/656.js (auto).
const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = kupla.roomId();
if (!e) return;

return () => {
  // siivous: palauta kaikki mitä yllä muutettiin
};
