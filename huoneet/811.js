// Huone 811 (Hallowen rata 6/6, aulan kopio 31.10.): tulostaulu-ikkuna.
// sona 31.10. "tehdää tähä huoneeseen kans sellanen ikkuna, score board UI · siihen pitäis tulla kaikkien tän radan läpi päässeiden pisteet"
//   "rakennusvaiheessa tehdää mockup, mutta sitten kun huone alkaa olee valmis niin tehdään siitä toimiva scoreboard"
//   "välilehtiä. Ainakin highscores ja ohjeet" · "Ohjeissa kerrotaan miten tätä viimeistä rataa pelataan"
//   15:28 "voisko se aina olla päällä ja että sen voi vaan pienentää" · "värimaailma punainen" (ei sulkemista: ×-nappi poistettu, tilalla –/+)
// TILA: MOCKUP. Pisteet ja ohjeteksti ovat paikkamerkkejä (MALLI_TULOKSET, OHJEET). Mitään ei lueta palvelimelta eikä tallenneta.
// Ikkuna on aina näkyvissä; otsikon –/+ pienentää otsikkoriviksi ja palauttaa. Raahattavissa otsikosta (683.js-malli).
const huone = kupla.roomId();

const OTSIKKO = 'Hallowen rata finaali';   // sona 15:27 'vaihdetaan 6/6 sanaksi finaali'
const VALILEHDET = ['Highscores', 'Ohjeet'];
const MALLI_TULOKSET = [   // [nimi, pisteet, aika] — keksittyjä, vain ulkoasua varten
  ['Pelaaja 1', 980, '04:12'],
  ['Pelaaja 2', 870, '05:01'],
  ['Pelaaja 3', 760, '05:47'],
  ['Pelaaja 4', 640, '06:30'],
  ['Pelaaja 5', 510, '07:15'],
];
const OHJEET = [   // sona 15:42 "yksi pelaaja kerrallaan pelaa zombie rataa yksin ja muut voivat katsoa ... 25 zombieta. 1 zombi = 1 piste."
  'Yksi pelaaja kerrallaan pelaa zombirataa yksin, muut voivat katsoa.',
  'Tavoite: tapa mahdollisimman monta zombia. 1 zombi = 1 piste.',
  'Rata on läpäisty, kun olet tappanut 25 zombia.',
];
// Ohjaus kuvina (sona 15:43 "WASD-liikutaan ja hiirellä ammutaan" · 15:45 "divit joissa on wasd kirjaimet jotka kuvastaa suuntaa ja hiiren kuva ja pyssy")
const OHJAUS_LIIKE = 'Liiku', OHJAUS_AMMU = 'Ammu (vasen nappi)', OHJAUS_HUOM = 'Kuten Kupla Shooterissa.';
const HIIRI_SVG = '<svg width="38" height="54" viewBox="0 0 38 54"><rect x="2" y="2" width="34" height="50" rx="17" fill="none" stroke="currentColor" stroke-width="2.5"/>'
  + '<path d="M19 2 V22 M2 22 H36" stroke="currentColor" stroke-width="2"/><path d="M3.5 20 V19 A15.5 15.5 0 0 1 17.8 3.5 H18 V20 Z" fill="#ff5a4f"/></svg>';
const ASE_SVG = '<svg width="58" height="36" viewBox="0 0 58 36"><path d="M4 8 H50 V6 H54 V16 H24 L21 32 H10 L13 16 H4 Z" fill="currentColor"/>'
  + '<path d="M20 16 Q22 23 28 22" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="56" cy="11" r="1.6" fill="#ffb347"/></svg>';
// Värit (sona 15:28 punainen): tausta, reuna, korostus (otsikko + aktiivinen välilehti), himmeä teksti, kärkirivi
const V = { tausta: 'rgba(26,10,12,.94)', reuna: '#6e1f26', korostus: '#ff5a4f', teksti: '#ecd2d0', himmea: '#d6a5a0', valittu: '#4a1519', karki: '#ffb347' };
const Z = 1000;

let ikkuna = null, sisalto = null, rivi = null, pieni = null, valittu = 0, vedto = null, pienennetty = false;
const tabit = [];

const siirra = (ev) => { if (!vedto || !ikkuna || ev.pointerId !== vedto.id) return;
  const w = ikkuna.offsetWidth || 0, h = ikkuna.offsetHeight || 0, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
  ikkuna.style.left = Math.min(Math.max(0, ev.clientX - vedto.dx), Math.max(0, iw - w)) + 'px';
  ikkuna.style.top = Math.min(Math.max(0, ev.clientY - vedto.dy), Math.max(0, ih - h)) + 'px'; };
const lopeta = (ev) => { if (!vedto || (ev && ev.pointerId !== undefined && ev.pointerId !== vedto.id)) return; vedto = null; };

// WASD-näppäimet nuolineen + hiiri (vasen nappi korostettu) + ase. Kaikki DOMia ja inline-SVG:tä, ei ulkoisia kuvia.
const nappain = (kirjain, nuoli) => { const k = document.createElement('div');
  k.style.cssText = 'width:30px;height:30px;box-sizing:border-box;border:1px solid ' + V.korostus + ';border-bottom-width:3px;border-radius:5px;background:' + V.valittu
    + ';display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;color:' + V.teksti;
  const a = document.createElement('div'); a.textContent = nuoli; a.style.cssText = 'font-size:9px;color:' + V.korostus;
  const b = document.createElement('div'); b.textContent = kirjain; b.style.cssText = 'font:bold 13px sans-serif';
  k.appendChild(a); k.appendChild(b); return k; };
const ohjausKuva = () => {
  const box = document.createElement('div');
  box.style.cssText = 'margin-top:8px;padding:8px;border:1px solid ' + V.reuna + ';border-radius:6px;display:flex;justify-content:space-around;align-items:flex-end;gap:8px';
  const sarake = (sisus, teksti) => { const s = document.createElement('div'); s.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px';
    s.appendChild(sisus); const t = document.createElement('div'); t.textContent = teksti; t.style.cssText = 'font-size:11px;color:' + V.himmea; s.appendChild(t); return s; };
  const wasd = document.createElement('div'); wasd.style.cssText = 'display:grid;grid-template-columns:repeat(3,30px);gap:3px';
  [['', ''], ['W', '▲'], ['', ''], ['A', '◀'], ['S', '▼'], ['D', '▶']].forEach(([k, n]) => { if (!k) { wasd.appendChild(document.createElement('div')); return; } wasd.appendChild(nappain(k, n)); });
  const ammu = document.createElement('div'); ammu.style.cssText = 'display:flex;align-items:center;gap:6px;color:' + V.teksti;
  ammu.innerHTML = HIIRI_SVG + ASE_SVG;
  box.appendChild(sarake(wasd, OHJAUS_LIIKE)); box.appendChild(sarake(ammu, OHJAUS_AMMU));
  const kaikki = document.createElement('div'); kaikki.appendChild(box);
  const h = document.createElement('div'); h.textContent = OHJAUS_HUOM; h.style.cssText = 'margin-top:5px;font-size:11px;color:' + V.himmea + ';text-align:center';
  kaikki.appendChild(h); return kaikki; };

const piirra = () => {
  if (!sisalto) return;
  tabit.forEach((t, i) => { const on = i === valittu;
    t.style.background = on ? V.valittu : 'transparent'; t.style.color = on ? V.korostus : V.himmea;
    t.style.borderBottom = on ? '2px solid ' + V.korostus : '2px solid transparent'; });
  sisalto.textContent = '';
  if (valittu === 0) {
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font:13px sans-serif';
    const otsRivi = document.createElement('tr');
    for (const [t, a] of [['#', 'left'], ['Pelaaja', 'left'], ['Pisteet', 'right'], ['Aika', 'right']]) {
      const th = document.createElement('th'); th.textContent = t;
      th.style.cssText = 'text-align:' + a + ';padding:3px 6px;color:' + V.himmea + ';font-weight:normal;border-bottom:1px solid ' + V.reuna;
      otsRivi.appendChild(th); }
    tbl.appendChild(otsRivi);
    MALLI_TULOKSET.forEach(([nimi, p, aika], i) => {
      const tr = document.createElement('tr');
      const solut = [[String(i + 1), 'left'], [nimi, 'left'], [String(p), 'right'], [aika, 'right']];
      for (const [t, a] of solut) { const td = document.createElement('td'); td.textContent = t;
        td.style.cssText = 'text-align:' + a + ';padding:3px 6px;' + (i === 0 ? 'color:' + V.karki + ';font-weight:bold' : '');
        tr.appendChild(td); }
      tbl.appendChild(tr); });
    sisalto.appendChild(tbl);
    const huom = document.createElement('div'); huom.textContent = 'Mockup: pisteet eivät ole oikeita.';
    huom.style.cssText = 'margin-top:8px;font-size:11px;color:' + V.himmea + ';font-style:italic';
    sisalto.appendChild(huom);
  } else {
    for (const r of OHJEET) { const p = document.createElement('p'); p.textContent = r; p.style.cssText = 'margin:0 0 6px';
      // sona 15:50 "korostaa tota tavoite kohtaa"
      if (/^Tavoite/.test(r)) p.style.cssText = 'margin:2px 0 8px;padding:6px 8px;font-weight:bold;font-size:14px;color:#fff;background:' + V.valittu + ';border-left:4px solid ' + V.korostus + ';border-radius:4px';
      sisalto.appendChild(p); }
    sisalto.appendChild(ohjausKuva());
  }
};

const pienenna = (on) => { pienennetty = on;
  if (rivi) rivi.style.display = on ? 'none' : 'flex'; if (sisalto) sisalto.style.display = on ? 'none' : '';
  if (pieni) { pieni.textContent = on ? '+' : '–'; pieni.title = on ? 'Suurenna' : 'Pienennä'; } };

const rakenna = () => {
  ikkuna = document.createElement('div'); ikkuna.className = 'h811-tulostaulu';
  ikkuna.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:' + Z + ';width:300px;max-width:92vw;box-sizing:border-box;'
    + 'background:' + V.tausta + ';border:1px solid ' + V.reuna + ';border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.6);font:13px sans-serif;color:' + V.teksti + ';user-select:none';
  const ots = document.createElement('div');
  ots.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-weight:bold;letter-spacing:.5px;color:' + V.korostus + ';cursor:move;touch-action:none';
  const ot = document.createElement('span'); ot.textContent = OTSIKKO;
  pieni = document.createElement('div');
  pieni.style.cssText = 'cursor:pointer;font-size:17px;line-height:14px;color:' + V.himmea + ';padding:0 4px;touch-action:manipulation';
  pieni.addEventListener('pointerdown', ev => ev.stopPropagation());
  pieni.addEventListener('click', ev => { ev.stopPropagation(); pienenna(!pienennetty); });
  ots.appendChild(ot); ots.appendChild(pieni);
  ots.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button && ev.button !== 0) return;
    const r0 = ikkuna.getBoundingClientRect();
    vedto = { id: ev.pointerId, dx: ev.clientX - r0.left, dy: ev.clientY - r0.top };
    ikkuna.style.left = r0.left + 'px'; ikkuna.style.top = r0.top + 'px'; ikkuna.style.transform = 'none';
    if (ots.setPointerCapture) try { ots.setPointerCapture(ev.pointerId); } catch (e) {} });
  ots.addEventListener('pointermove', siirra);
  ots.addEventListener('pointerup', lopeta);
  ots.addEventListener('pointercancel', lopeta);
  ots.addEventListener('lostpointercapture', lopeta);
  rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;gap:2px;padding:6px 8px 0;border-top:1px solid ' + V.reuna;
  VALILEHDET.forEach((nimi, i) => { const t = document.createElement('div'); t.textContent = nimi;
    t.style.cssText = 'padding:5px 10px;cursor:pointer;border-radius:5px 5px 0 0;touch-action:manipulation';
    t.addEventListener('pointerdown', ev => ev.stopPropagation());
    t.addEventListener('click', ev => { ev.stopPropagation(); valittu = i; piirra(); });
    tabit.push(t); rivi.appendChild(t); });
  sisalto = document.createElement('div'); sisalto.style.cssText = 'padding:10px 12px 12px;border-top:1px solid ' + V.reuna + ';min-height:120px';
  ikkuna.appendChild(ots); ikkuna.appendChild(rivi); ikkuna.appendChild(sisalto);
  ikkuna.addEventListener('pointerdown', ev => ev.stopPropagation());
  document.body.appendChild(ikkuna);
  pienenna(false);
  piirra();
};

for (const el of document.querySelectorAll('.h811-tulostaulu, .h811-nappi')) el.remove();   // skriptipäivitys: ei tuplaikkunaa (h811-nappi = mockup-1:n avausnappi)
rakenna();
window.__h811 = { huone, pienenna, versio: 'mockup-3' };

return () => {
  if (ikkuna) ikkuna.remove();
  ikkuna = sisalto = rivi = pieni = null; vedto = null;
  if (window.__h811 && window.__h811.huone === huone) delete window.__h811;
};
