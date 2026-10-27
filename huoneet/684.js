// Huone 684 (Halloween rata 5/6): pimeys + simuloitu dimmeri. Huone on musta ja oman hahmon ympärillä näkyy pieni valopiiri
// (kp 27.10. 20:04:59 "huone on tosi pimee ja näkee vaan pienen alueen ympärillä"). Valokäsiesine (lamppu, kynttilä, soihtu)
// kasvattaa piiriä. Dimmeri (kp 20:11:28 "simuloitu dimmeri") = värisävy koko huoneen päällä, kuten huoneen tunnelmavalo.
// Vain tässä clientissä: jokainen näkee oman valonsa, muiden pelaajien valot eivät valaise sinulle.
// Rakentajille (kp 20:11:28 "komento joka poistaa nää efektit buildausta varten"): chatissa ":efektit pois" / ":efektit päälle"
//   (pelkkä ":efektit" vaihtaa). Komento ei lähde palvelimelle eikä näy muille, ja valinta muistetaan tässä selaimessa.
// Moottori ajaa tämän new Function('kupla', koodi)(api) ja kutsuu palautettua funktiota kun huoneesta lähdetään.
// Konsolissa (testaus): pimeys.sade = 90 · pimeys.lamppuSade = 170 · pimeys.tummuus = 0.97 · pimeys.dimmeri = { vari: '#2a1050', voima: 0.35 }
//   · pimeys.paalla(false) · pimeys.loki
const KASIVALOT = { 1058: 'Öljylamppu', 1027: 'Kynttilä', 1113: 'LED-kynttilä', 1031: 'Soihtu' };
const MUISTI = 'h684.efektit';

const e = window.NitroDevTools && window.NitroDevTools.roomEngine;
const huone = (kupla && kupla.roomId && kupla.roomId()) || (e && e.activeRoomId);
const tila = window.pimeys = { versio: 'huone-684', huone, sade: 90, lamppuSade: 170, tummuus: 0.97,
  dimmeri: { vari: '#2a1050', voima: 0.35 }, loki: [] };
tila.loki.push = function () { const t = new Date().toTimeString().slice(0, 8); for (const o of arguments) if (o && typeof o === 'object' && !o.t) o.t = t; return Array.prototype.push.apply(this, arguments); };

const omaIndeksi = () => {
  const sm = e && Object.getOwnPropertyDescriptor(e, '_roomSessionManager'); const s = sm && sm.value && sm.value.getSession && sm.value.getSession(huone);
  const i = s && s.ownRoomIndex; return (i == null || i < 0) ? null : i;
};
const kanvas = () => [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
// Käsiesine hahmon mallista (RoomObjectVariable.FIGURE_CARRY_OBJECT).
const kadessa = o => { try { return Number(o.model.getValue('figure_carry_object')) || 0; } catch (x) { return 0; } };

const kerros = () => { const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1'; return d; };
const savy = kerros(), verho = kerros();   // savy = dimmerin värisävy, verho = pimeys valopiirin ympärillä
let liitetty = null;
const liita = cv => {
  if (!cv || liitetty === cv) return;
  // Kanvaksen perään samaan vanhempaan: kerrokset peittävät huoneen mutta jäävät chatin ja valikoiden alle (ne tulevat myöhemmin DOMissa).
  cv.parentNode.insertBefore(verho, cv.nextSibling); cv.parentNode.insertBefore(savy, verho); liitetty = cv;
};

let paalla = true;
try { paalla = localStorage.getItem(MUISTI) !== 'pois'; } catch (x) {}
tila.paalla = (p) => { if (p === undefined) return paalla; paalla = !!p;
  savy.style.display = verho.style.display = paalla ? '' : 'none';
  try { localStorage.setItem(MUISTI, paalla ? 'paalla' : 'pois'); } catch (x) {}
  tila.loki.push({ efektit: paalla ? 'päällä' : 'pois' }); return paalla; };
tila.paalla(paalla);

// Chat-komento: kaapataan Enter ennen pelin omaa käsittelijää (sama kenttä ja tapa kuin pitka-viesti-lisäosassa).
const KENTTA = 'input.nitro-chat-input-control', KOMENTO = /^:efektit(?:\s+(pois|päälle|paalle|on|off))?$/i;
const tyhjenna = el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); };
const ilmoita = teksti => { const d = document.createElement('div');
  d.textContent = teksti;
  d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99999;pointer-events:none;padding:8px 16px;'
    + 'background:rgba(0,0,0,.75);color:#fff;font:bold 15px sans-serif;border-radius:6px;transition:opacity .4s';
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 1600); setTimeout(() => d.remove(), 2100); };
const kuuleKomento = ev => {
  if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
  const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
  const m = KOMENTO.exec((el.value || '').trim()); if (!m) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const s = (m[1] || '').toLowerCase(), uusi = s ? !(s === 'pois' || s === 'off') : !paalla;
  tila.paalla(uusi); tyhjenna(el); ilmoita(uusi ? 'Huoneen efektit päällä' : 'Huoneen efektit pois (rakennustila)');
};
addEventListener('keydown', kuuleKomento, true);

let sade = tila.sade, raf = 0, viimeVali = null;
const piirra = () => {
  raf = requestAnimationFrame(piirra);
  if (!paalla) return;
  try {
    const cv = kanvas(); if (!cv) return; liita(cv);
    const d = tila.dimmeri || {};
    savy.style.background = d.vari || 'transparent'; savy.style.opacity = String(Math.max(0, Math.min(1, Number(d.voima) || 0)));
    const r = cv.getBoundingClientRect(), oma = omaIndeksi(), o = oma != null && e.getRoomObject(huone, oma, 100);
    const p = o && e.getRoomObjectScreenLocation(huone, oma, 100);
    const ese = o ? kadessa(o) : 0, valo = KASIVALOT[ese], tavoite = valo ? tila.lamppuSade : tila.sade;
    sade += (tavoite - sade) * 0.08;   // piiri kasvaa ja pienenee pehmeästi kun lamppu otetaan käteen tai pois
    if (valo !== viimeVali) { viimeVali = valo; tila.loki.push({ valo: valo || 'ei valoa', ese }); }
    const a = tila.tummuus;
    if (!p) { verho.style.background = 'rgba(0,0,0,' + a + ')'; return; }
    const x = r.left + p.x, y = r.top + p.y - 45;   // hahmon keskikohta (sijainti on jalkojen kohdalla)
    // Liekin lepatus ja lämmin hehku kun valo on kädessä.
    const s = sade * (valo ? 1 + Math.sin(performance.now() / 120) * 0.025 + Math.sin(performance.now() / 47) * 0.015 : 1);
    const keski = valo ? 'rgba(255,170,60,0.10)' : 'rgba(0,0,0,0)';
    verho.style.background = 'radial-gradient(circle ' + Math.round(s) + 'px at ' + Math.round(x) + 'px ' + Math.round(y) + 'px,'
      + keski + ' 0%,rgba(0,0,0,0) 45%,rgba(0,0,0,' + (a * 0.6).toFixed(3) + ') 75%,rgba(0,0,0,' + a + ') 100%)';
  } catch (x) { tila.loki.push({ virhe: String(x) }); cancelAnimationFrame(raf); }
};
raf = requestAnimationFrame(piirra);
tila.loki.push({ alku: huone, efektit: paalla ? 'päällä' : 'pois' });

return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kuuleKomento, true); savy.remove(); verho.remove();
  if (window.pimeys === tila) delete window.pimeys; };
