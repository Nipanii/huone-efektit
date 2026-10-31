// Huone 811 (Hallowen rata 6/6, aulan kopio 31.10.): tulostaulu-ikkuna.
// sona 31.10. "tehdää tähä huoneeseen kans sellanen ikkuna, score board UI · siihen pitäis tulla kaikkien tän radan läpi päässeiden pisteet"
//   "rakennusvaiheessa tehdää mockup, mutta sitten kun huone alkaa olee valmis niin tehdään siitä toimiva scoreboard"
//   "välilehtiä. Ainakin highscores ja ohjeet" · "Ohjeissa kerrotaan miten tätä viimeistä rataa pelataan"
// TILA: MOCKUP. Pisteet ja ohjeteksti ovat paikkamerkkejä (MALLI_TULOKSET, OHJEET). Mitään ei lueta palvelimelta eikä tallenneta.
// Ikkuna aukeaa huoneeseen tullessa, sulkeutuu ×:stä ja aukeaa uudelleen vasemman reunan napista. Raahattavissa otsikosta (683.js-malli).
const huone = kupla.roomId();

const OTSIKKO = 'Hallowen rata 6/6';
const VALILEHDET = ['Highscores', 'Ohjeet'];
const MALLI_TULOKSET = [   // [nimi, pisteet, aika] — keksittyjä, vain ulkoasua varten
  ['Pelaaja 1', 980, '04:12'],
  ['Pelaaja 2', 870, '05:01'],
  ['Pelaaja 3', 760, '05:47'],
  ['Pelaaja 4', 640, '06:30'],
  ['Pelaaja 5', 510, '07:15'],
];
const OHJEET = [   // sona kirjoittaa oikeat ohjeet; nämä ovat paikkamerkkejä
  'Tämä on Halloween-radan viimeinen osa.',
  'Ohjeet tulevat tähän, kun rata on valmis.',
];
const NAPPI_TEKSTI = 'Tulokset';
const Z = 1000;

let ikkuna = null, nappi = null, sisalto = null, valittu = 0, vedto = null;
const tabit = [];

const siirra = (ev) => { if (!vedto || !ikkuna || ev.pointerId !== vedto.id) return;
  const w = ikkuna.offsetWidth || 0, h = ikkuna.offsetHeight || 0, iw = window.innerWidth || 0, ih = window.innerHeight || 0;
  ikkuna.style.left = Math.min(Math.max(0, ev.clientX - vedto.dx), Math.max(0, iw - w)) + 'px';
  ikkuna.style.top = Math.min(Math.max(0, ev.clientY - vedto.dy), Math.max(0, ih - h)) + 'px'; };
const lopeta = (ev) => { if (!vedto || (ev && ev.pointerId !== undefined && ev.pointerId !== vedto.id)) return; vedto = null; };

const piirra = () => {
  if (!sisalto) return;
  tabit.forEach((t, i) => { const on = i === valittu;
    t.style.background = on ? '#3a2f4a' : 'transparent'; t.style.color = on ? '#d9a35b' : '#a99bbd';
    t.style.borderBottom = on ? '2px solid #d9a35b' : '2px solid transparent'; });
  sisalto.textContent = '';
  if (valittu === 0) {
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font:13px sans-serif';
    const otsRivi = document.createElement('tr');
    for (const [t, a] of [['#', 'left'], ['Pelaaja', 'left'], ['Pisteet', 'right'], ['Aika', 'right']]) {
      const th = document.createElement('th'); th.textContent = t;
      th.style.cssText = 'text-align:' + a + ';padding:3px 6px;color:#8f82a3;font-weight:normal;border-bottom:1px solid #4b3f5e';
      otsRivi.appendChild(th); }
    tbl.appendChild(otsRivi);
    MALLI_TULOKSET.forEach(([nimi, p, aika], i) => {
      const tr = document.createElement('tr');
      const solut = [[String(i + 1), 'left'], [nimi, 'left'], [String(p), 'right'], [aika, 'right']];
      for (const [t, a] of solut) { const td = document.createElement('td'); td.textContent = t;
        td.style.cssText = 'text-align:' + a + ';padding:3px 6px;' + (i === 0 ? 'color:#e8c46a;font-weight:bold' : '');
        tr.appendChild(td); }
      tbl.appendChild(tr); });
    sisalto.appendChild(tbl);
    const huom = document.createElement('div'); huom.textContent = 'Mockup: pisteet eivät ole oikeita.';
    huom.style.cssText = 'margin-top:8px;font-size:11px;color:#7d7090;font-style:italic';
    sisalto.appendChild(huom);
  } else {
    for (const r of OHJEET) { const p = document.createElement('p'); p.textContent = r; p.style.cssText = 'margin:0 0 6px'; sisalto.appendChild(p); }
  }
};

const avaa = () => { if (ikkuna) ikkuna.style.display = ''; if (nappi) nappi.style.display = 'none'; };
const sulje = () => { if (ikkuna) ikkuna.style.display = 'none'; if (nappi) nappi.style.display = ''; };

const rakenna = () => {
  ikkuna = document.createElement('div'); ikkuna.className = 'h811-tulostaulu';
  ikkuna.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:' + Z + ';width:300px;max-width:92vw;box-sizing:border-box;'
    + 'background:rgba(20,17,26,.94);border:1px solid #4b3f5e;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.6);font:13px sans-serif;color:#cfc6dc;user-select:none';
  const ots = document.createElement('div');
  ots.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-weight:bold;letter-spacing:.5px;color:#d9a35b;cursor:move;touch-action:none;border-bottom:1px solid #4b3f5e';
  const ot = document.createElement('span'); ot.textContent = OTSIKKO;
  const x = document.createElement('div'); x.textContent = '×'; x.title = 'Sulje';
  x.style.cssText = 'cursor:pointer;font-size:17px;line-height:14px;color:#a99bbd;padding:0 2px;touch-action:manipulation';
  x.addEventListener('pointerdown', ev => ev.stopPropagation());
  x.addEventListener('click', ev => { ev.stopPropagation(); sulje(); });
  ots.appendChild(ot); ots.appendChild(x);
  ots.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button && ev.button !== 0) return;
    const r0 = ikkuna.getBoundingClientRect();
    vedto = { id: ev.pointerId, dx: ev.clientX - r0.left, dy: ev.clientY - r0.top };
    ikkuna.style.left = r0.left + 'px'; ikkuna.style.top = r0.top + 'px'; ikkuna.style.transform = 'none';
    if (ots.setPointerCapture) try { ots.setPointerCapture(ev.pointerId); } catch (e) {} });
  ots.addEventListener('pointermove', siirra);
  ots.addEventListener('pointerup', lopeta);
  ots.addEventListener('pointercancel', lopeta);
  ots.addEventListener('lostpointercapture', lopeta);
  const rivi = document.createElement('div'); rivi.style.cssText = 'display:flex;gap:2px;padding:6px 8px 0';
  VALILEHDET.forEach((nimi, i) => { const t = document.createElement('div'); t.textContent = nimi;
    t.style.cssText = 'padding:5px 10px;cursor:pointer;border-radius:5px 5px 0 0;touch-action:manipulation';
    t.addEventListener('pointerdown', ev => ev.stopPropagation());
    t.addEventListener('click', ev => { ev.stopPropagation(); valittu = i; piirra(); });
    tabit.push(t); rivi.appendChild(t); });
  sisalto = document.createElement('div'); sisalto.style.cssText = 'padding:10px 12px 12px;border-top:1px solid #4b3f5e;min-height:120px';
  ikkuna.appendChild(ots); ikkuna.appendChild(rivi); ikkuna.appendChild(sisalto);
  ikkuna.addEventListener('pointerdown', ev => ev.stopPropagation());
  nappi = document.createElement('div'); nappi.className = 'h811-nappi'; nappi.textContent = NAPPI_TEKSTI;
  nappi.style.cssText = 'position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:' + Z + ';display:none;padding:6px 10px;cursor:pointer;'
    + 'background:rgba(20,17,26,.92);border:1px solid #4b3f5e;border-radius:6px;font:bold 12px sans-serif;color:#d9a35b;touch-action:manipulation';
  nappi.addEventListener('pointerdown', ev => ev.stopPropagation());
  nappi.addEventListener('click', ev => { ev.stopPropagation(); avaa(); });
  document.body.appendChild(ikkuna); document.body.appendChild(nappi);
  piirra();
};

for (const el of document.querySelectorAll('.h811-tulostaulu, .h811-nappi')) el.remove();   // skriptipäivitys: ei tuplaikkunaa
rakenna();
window.__h811 = { huone, avaa, sulje, versio: 'mockup-1' };

return () => {
  if (ikkuna) ikkuna.remove(); if (nappi) nappi.remove();
  ikkuna = nappi = sisalto = null; vedto = null;
  if (window.__h811 && window.__h811.huone === huone) delete window.__h811;
};
