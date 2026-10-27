// Huone 684 (Halloween rata 5/6): pimeys. Huone on musta ja oman hahmon ympärillä näkyy pieni valopiiri (kp 27.10. 20:04:59
// "huone on tosi pimee ja näkee vaan pienen alueen ympärillä"). Valokäsiesine (lamppu, kynttilä, soihtu) kasvattaa piiriä.
// Vain tässä clientissä: jokainen näkee oman valonsa, muiden pelaajien valot eivät valaise sinulle.
// Moottori ajaa tämän new Function('kupla', koodi)(api) ja kutsuu palautettua funktiota kun huoneesta lähdetään.
// Konsolissa (testaus): pimeys.sade = 90 · pimeys.lamppuSade = 170 · pimeys.tummuus = 0.97 · pimeys.loki
const KASIVALOT = { 1058: 'Öljylamppu', 1027: 'Kynttilä', 1113: 'LED-kynttilä', 1031: 'Soihtu' };

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
const tila = window.pimeys = { versio: 'huone-684', huone, sade: 90, lamppuSade: 170, tummuus: 0.97, loki: [] };

const omaIndeksi = () => {
  const sm = e && Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i;
};
const kanvas = () => [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
// Käsiesine hahmon mallista (RoomObjectVariable.FIGURE_CARRY_OBJECT).
const kadessa = o => { try { return Number(o.model.getValue('figure_carry_object')) || 0; } catch (x) { return 0; } };

const verho = document.createElement('div');
verho.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1;will-change:background';
let liitetty = null;
const liita = cv => {
  if (!cv || liitetty === cv) return;
  // Kanvaksen perään samaan vanhempaan: verho peittää huoneen mutta jää chatin ja valikoiden alle (ne tulevat myöhemmin DOMissa).
  cv.parentNode.insertBefore(verho, cv.nextSibling); liitetty = cv;
};

let sade = tila.sade, raf = 0, viimeVali = null;
const piirra = () => {
  raf = requestAnimationFrame(piirra);
  try {
    const cv = kanvas(); if (!cv) return; liita(cv);
    const r = cv.getBoundingClientRect(), oma = omaIndeksi(), o = oma != null && e.getRoomObject(huone, oma, 100);
    const p = o && e.getRoomObjectScreenLocation(huone, oma, 100);
    const ese = o ? kadessa(o) : 0, tavoite = KASIVALOT[ese] ? tila.lamppuSade : tila.sade;
    sade += (tavoite - sade) * 0.08;   // piiri kasvaa ja pienenee pehmeästi kun lamppu otetaan käteen tai pois
    if (KASIVALOT[ese] !== viimeVali) { viimeVali = KASIVALOT[ese]; tila.loki.push({ t: new Date().toTimeString().slice(0, 8), valo: viimeVali || 'ei valoa', ese }); }
    const a = tila.tummuus;
    if (!p) { verho.style.background = 'rgba(0,0,0,' + a + ')'; return; }
    const x = r.left + p.x, y = r.top + p.y - 45;   // hahmon keskikohta (sijainti on jalkojen kohdalla)
    // Liekin lepatus: säde heiluu hieman kun valo on kädessä.
    const s = sade * (KASIVALOT[ese] ? 1 + Math.sin(performance.now() / 120) * 0.025 + Math.sin(performance.now() / 47) * 0.015 : 1);
    verho.style.background = 'radial-gradient(circle ' + Math.round(s) + 'px at ' + Math.round(x) + 'px ' + Math.round(y) + 'px,'
      + 'rgba(0,0,0,0) 0%,rgba(0,0,0,0) 45%,rgba(0,0,0,' + (a * 0.6).toFixed(3) + ') 75%,rgba(0,0,0,' + a + ') 100%)';
  } catch (x) { tila.loki.push({ virhe: String(x) }); cancelAnimationFrame(raf); }
};
raf = requestAnimationFrame(piirra);
tila.loki.push({ t: new Date().toTimeString().slice(0, 8), alku: huone });

return () => { cancelAnimationFrame(raf); verho.remove(); if (window.pimeys === tila) delete window.pimeys; };
