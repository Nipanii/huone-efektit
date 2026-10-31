// Huone 811 (Hallowen rata 6/6, aulan kopio 31.10.): tulostaulu-ikkuna.
// sona 31.10. "tehdää tähä huoneeseen kans sellanen ikkuna, score board UI · siihen pitäis tulla kaikkien tän radan läpi päässeiden pisteet"
//   "rakennusvaiheessa tehdää mockup, mutta sitten kun huone alkaa olee valmis niin tehdään siitä toimiva scoreboard"
//   "välilehtiä. Ainakin highscores ja ohjeet" · "Ohjeissa kerrotaan miten tätä viimeistä rataa pelataan"
//   15:28 "voisko se aina olla päällä ja että sen voi vaan pienentää" · "värimaailma punainen" (ei sulkemista: ×-nappi poistettu, tilalla –/+)
// TILA: MOCKUP. Pisteet ja ohjeteksti ovat paikkamerkkejä (MALLI_TULOKSET, OHJEET). Mitään ei lueta palvelimelta eikä tallenneta.
// Ikkuna on aina näkyvissä; otsikon –/+ pienentää otsikkoriviksi ja palauttaa. Raahattavissa otsikosta (683.js-malli).
const huone = kupla.roomId();

const OTSIKKO = 'Halloween rata 2026 FINAALI';   // sona 15:27 'vaihdetaan 6/6 sanaksi finaali'
const VALILEHDET = ['Highscores', 'Ohjeet'];
const KORISTEET = false;   // sona 16:00 lisätty, 16:04 poistettu ("Ei ne sovikkaan"); koodi jätetty
const LAPI_RAJA = 25;   // sona 15:42 "pääsee radan läpi jos on tappanut 25 zombieta"
const MALLI_EI_LAPI = [   // [nimi, pisteet < LAPI_RAJA, figure] — oikeita pelaajia, pisteet keksittyjä (sona 16:16)
  ["Izmo",23,"fa-8110-92.hr-11571-45.lg-10059-1408.hd-11209-3-14.ca-989999899-1285.sh-305-92.ch-3934-1408-1408.wa-39483458-92.cp-990000813-1408.cc-3838-1408.ha-6116-92\n"],
  ["subikka3",21,"hd-1000002009-10.he-3082-92.fa-11693-1408.lg-1000002981-1325-91.ch-1000001288-92.hr-1000001037-32.ea-9036-107556-92.wa-999999017-92.sh-3338-92.cp-1000001893-110.ca-999999364-1408.0"],
  ["Karita",19,"hd-11397-1359.hr-500003-61.ch-990000872-1409.sh-11754-110-1408.fa-8110-1408.lg-10059-1425.he-61156490-1320.ca-11297-1325-1408.0\n"],
  ["sedimenttisielu",17,"hr-1000002956-42-40.hd-990000912-19.ch-1000002748-82.lg-1000002982-76.fa-1201-0.ca-1804-64.0\n"],
  ["PlumberJack",14,"hd-190-19.ch-10934-82.lg-285-81.ca-11655-1408.sh-290-1408.ha-1004-110"],
  ["Nicszerg",11,"fa-3344-1000024.ch-215-110.cp-9032-1308.lg-275-110.hd-3091-1.ea-3484-1408.he-3560-1408.ha-1000002933-1408.hr-125-32.0"],
  ["Aido",8,"fa-201407-1324.hr-3322-34.ch-800001467-1408-1408.sh-3068-92-1408.cp-9032-1308.lg-10059-1408.hd-209-1024.cc-2935-1408-1408"],
];
const NAKYVAT = 7;   // highscore-rivejä näkyvissä ilman vieritystä (sona 15:57 10 · 16:31 "liian korkea ... top 7")
const MALLI_TULOKSET = [   // [nimi, pisteet, figure] — oikeita pelaajia satunnaisesti, sona #1, pisteet keksittyjä (sona 16:16)
  ["sona",78,"hr-1000002941-61.hd-11626-18-18.ch-1000001712-110.lg-10464-110-110.sh-1000002987-110-110.ea-999999641-110-110.fa-999999498-110.cc-1000001547-110.he-10419-110.ca-999999837-110.0"],
  ["T1R0M1",72,"fa-1209-1408.hr-990000606-1394.ch-990000871-1408.sh-10043-92-1408.cp-9032-1308.lg-11333-1408.hd-209-3.wa-11314-1408.ha-11031-1408"],
  ["dog",69,"fa-8110-1331.hr-115-1035.ch-267-1261.sh-290-92.lg-3078-1281.hd-205-97554.he-1610-62.ea-1404-110.cc-3867-1408-64.0\n"],
  ["Morso",65,"hr-828-1035.ch-255-66.sh-8305-92.lg-285-81.hd-1000001108-1-14.ha-1001-1408.ea-3107-1321-1408.wa-3072-84-1315.pt-5826-1408.fa-8119-1408.he-1000002892-107573.0"],
  ["Laatikko",61,"hd-180-1021.lg-275-92.hr-802-59.ch-255-110.ha-1013-92.fa-1209-92.sh-295-92.cc-1000000841-91.0\n"],
  ["parsa",58,"hr-1000002718-40.hd-11510-1021.ch-800001419-1408-1408.lg-1000001474-110.he-1000000444-173638.sh-10584-92.ha-1000002079-110.ha-10785-92.ea-1000002051-64.cp-11715-110.cc-1000002874-110.wa-11707-1409-106\n"],
  ["Kessu",55,"fa-1203-1324.hr-3090-1033.ch-255-98.lg-281-1205.hd-195-19.ha-1002-1205.sh-295-92"],
  ["bibble",52,"hr-999999559-61-61.hd-1000002010-11.ch-5030-71-1329.lg-1000002328-92-92.sh-3206-91.fa-1000002534-85.cc-4184-110-110.0"],
  ["mohammed_king04",49,"hd-3094-1373.lg-3078-110.hr-125-1407.fa-1201-0.sh-1000001979-110-1408.wa-2011-1408.ca-1816-64.cc-3152-110.ha-8560-110.he-1608-1408\n"],
  ["Grandi",47,"hr-1000002824-34.hd-1000002010-19.ch-1000002997-75-1408.lg-275-1408.fa-1201-0.ca-1000002913-64.ha-1000002930-1408"],
  ["jukuhomma",44,"hd-11010-18.hr-3665-1829.ha-1000001043-110.he-3805-110.ch-1000001801-110-110.lg-9930-110.sh-3354-110-110.ca-11412-110-110.cc-11065-110-110.wa-10676-110.ea-990000041-110"],
  ["nennuh07",42,"hr-1000001037-1520.hd-9835-1392.ch-7089-110.lg-1000002880-110.sh-1000002808-110.he-999999750-110.fa-3276-1414.wa-990000857-1414.mc-5461-1414-110\n"],
  ["hihi",40,"hr-678-42.hd-1000002493-19.ch-1000002748-1320.lg-3078-110.ca-1804-64.sh-1000002985-1408-1408.wa-2005-1408.ea-6152-1408.fa-10989-0.he-1000002663-1592-76\n"],
  ["Siili",38,"hr-115-42.hd-185-1386.ch-3030-1419.lg-275-94.fa-1202-64.ca-1804-64.ea-11323-1408-1408.he-999999506-1408\n"],
  ["kurkkupomo",36,"hd-3704-1.ha-1000001618-1428.he-1000002062-64.ca-999999489-4002-1408.hr-3733-40.lg-3282-1428.ch-1000000412-1428-1408.cc-1000002994-1408.cp-93483448-1408"],
  ["Oliver",34,"fa-201407-110.hr-828-1051.ch-255-110.sh-290-110.lg-275-110.hd-1000002098-18.ha-987462863-110.pt-6577-1417"],
  ["Jerban",33,"hr-11276-1395.ch-255-110.lg-3526-110-110.hd-205-18.sh-910000071-110-110.ha-39483460-110.cp-7735-1408.ca-1000002087-110.cc-1000000737-110.fa-3276-110.0"],
  ["Dix",31,"ch-1000001289-110.sh-295-110.lg-1000001314-110.hd-11208-1379-22.ca-10904-92-92.cc-568282-1213.ha-1000002460-110.hr-828-156627.ea-910000006-110-1408.0\n"],
  ["EsaOnEsa",30,"hr-155-1394.sh-11754-110-1408.lg-1000001477-110.hd-894624589-1370.ch-1000002748-110.cp-3315-1408.ca-5934-1408.fa-1000002759-1408.he-3716-1408.0"],
  ["Manu",29,"hd-190-1.hr-125-37.ha-1013-1408.ea-8010-1408.ch-3015-1408.lg-3057-1408.sh-3115-1408-1408.mc-3744-1408-1408.mc-6579-1408"],
  ["Bronxi",28,"hd-11510-18.ha-1002-110.hr-828-37.ch-1000001551-110.lg-999999536-110.sh-10829-110.ea-1404-110.he-3716-1408.0\n"],
];
const OHJEET = [   // sona 15:42 "yksi pelaaja kerrallaan pelaa zombie rataa yksin ja muut voivat katsoa ... 25 zombieta. 1 zombi = 1 piste."
  'Tervetuloa Halloween radan finaaliin.',   // sona 15:58
  'Yksi pelaaja kerrallaan pelaa zombirataa yksin.',
  'Tavoite: tapa mahdollisimman monta zombia.',
  '1 zombi = 1 piste.',   // sona 16:08 omalle rivilleen
  'Rata on läpäisty, kun olet tappanut 25 zombia.',
];
// Ohjaus kuvina (sona 15:43 "WASD-liikutaan ja hiirellä ammutaan" · 15:45 "divit joissa on wasd kirjaimet jotka kuvastaa suuntaa ja hiiren kuva ja pyssy")
const OHJAUS_LIIKE = 'Liiku', OHJAUS_AMMU = 'Ammu (vasen nappi)', OHJAUS_HUOM = '';   // sona 16:00 poisti 'Kuten Kupla Shooterissa.'
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
  if (OHJAUS_HUOM) kaikki.appendChild(h); return kaikki; };

const piirra = () => {
  if (!sisalto) return;
  tabit.forEach((t, i) => { const on = i === valittu;
    t.style.background = on ? V.valittu : 'transparent'; t.style.color = on ? V.korostus : V.himmea;
    t.style.borderBottom = on ? '2px solid ' + V.korostus : '2px solid transparent'; });
  sisalto.textContent = '';
  if (valittu === 0) {
    // sona 15:57 10 näkyvissä + vieritys · 16:15 otsikot "Suorittaneet ja epäonnistuneet" (<25p) · 16:15 "vaa yks scroll bar. NE jotka ei päässy läpi on alimmaisena"
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font:13px sans-serif';
    const otsRivi = document.createElement('tr');
    for (const [t, a] of [['#', 'left'], ['Pelaaja', 'left'], ['Pisteet', 'right']]) {   // sona 15:57 "otetaan aika pois"
      const th = document.createElement('th'); th.textContent = t;
      th.style.cssText = 'text-align:' + a + ';padding:3px 6px;color:' + V.himmea + ';font-weight:normal;border-bottom:1px solid ' + V.reuna + ';position:sticky;top:0;background:' + V.tausta;
      otsRivi.appendChild(th); }
    tbl.appendChild(otsRivi);
    const osio = (teksti, vari, ylä) => { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 3; td.textContent = teksti;
      td.style.cssText = 'padding:' + ylä + 'px 6px 3px;font-weight:bold;font-size:12px;letter-spacing:.5px;color:' + vari; tr.appendChild(td); tbl.appendChild(tr); };
    // sona 16:16 "heidän hahmonsa naamakuva siihen nimen viereen" -> hotellin oma imager, headonly
    const naama = (fig) => { const im = document.createElement('img'); im.alt = '';
      im.src = 'https://kupla.cc/avatarimage?figure=' + encodeURIComponent(fig) + '&headonly=1&direction=2&head_direction=2';
      im.style.cssText = 'width:28px;height:32px;object-fit:contain;object-position:center bottom;flex:none';
      let yritys = 0; im.onerror = () => { if (yritys++ < 3) setTimeout(() => { im.src = im.src.replace(/&r=\d+$|$/, '&r=' + yritys); }, 600 * yritys); };   // imager hylkää osan rinnakkaisista latauksista
      return im; };
    const rivi = (sija, nimi, p, tyyli, fig) => { const tr = document.createElement('tr');
      for (const [t, a] of [[sija, 'left'], [nimi, 'left'], [String(p), 'right']]) { const td = document.createElement('td');
        td.style.cssText = 'text-align:' + a + ';padding:3px 6px;vertical-align:middle;' + tyyli;
        if (t === nimi && fig) { const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;gap:6px';
          d.appendChild(naama(fig)); const s = document.createElement('span'); s.textContent = t; d.appendChild(s); td.appendChild(d); }
        else td.textContent = t;
        tr.appendChild(td); }
      tbl.appendChild(tr); };
    osio('SUORITTANEET', V.korostus, 6);
    MALLI_TULOKSET.forEach(([nimi, p, fig], i) => rivi(String(i + 1), nimi, p, i === 0 ? 'color:' + V.karki + ';font-weight:bold' : '', fig));
    osio('EPÄONNISTUNEET (<' + LAPI_RAJA + 'p)', V.himmea, 12);
    MALLI_EI_LAPI.forEach(([nimi, p, fig]) => rivi('–', nimi, p, 'color:' + V.himmea, fig));
    const rulla = document.createElement('div'); rulla.style.cssText = 'overflow-y:auto;overscroll-behavior:contain;scrollbar-color:rgba(255,255,255,.5) transparent';   // sona 16:03 valkoinen · 16:04 "opacity 50"
    rulla.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });   // rulla ei mene pelille (zoom)
    rulla.appendChild(tbl); sisalto.appendChild(rulla);
    const r = tbl.rows; let h = 0; for (let k = 0; k <= NAKYVAT + 1 && k < r.length; k++) h += r[k].getBoundingClientRect().height;   // otsikko + osio + 10 riviä
    rulla.style.maxHeight = Math.ceil(h || (NAKYVAT + 2) * 23) + 'px';
    const huom = document.createElement('div'); huom.textContent = 'Vain paras tuloksesi tallennetaan. Voit yrittää rataa niin monta kertaa kuin haluat.';   // sona 16:10 (korvasi mockup-huomautuksen)
    huom.style.cssText = 'margin-top:8px;font-size:11px;color:' + V.himmea + ';font-style:italic';
    sisalto.appendChild(huom);
  } else {
    // sona 15:50 "korostaa tota tavoite kohtaa" · 15:51 "vaikka se laatikkona alimmaiseksi"
    const tavoite = OHJEET.filter(r => /^(Tavoite|1 zombi|Rata on läpäisty)/.test(r));   // sona 15:59 'Siirrä tavoite laatikkoon teksti "Rata on läpäisty..."'
    for (const r of OHJEET) { if (tavoite.includes(r)) continue;
      const p = document.createElement('p'); p.textContent = r; p.style.cssText = 'margin:0 0 6px'; sisalto.appendChild(p); }
    sisalto.appendChild(ohjausKuva());
    // sona 15:57 '"Tavoite" otsikko ja siirrä leipäteksti sen alapuolelle. Ei boldia leipätekstillä.'
    if (tavoite.length) { const p = document.createElement('div');
      p.style.cssText = 'margin-top:10px;padding:8px 10px;color:#fff;background:' + V.valittu + ';border:1px solid ' + V.korostus + ';border-left:4px solid ' + V.korostus + ';border-radius:5px';
      const o = document.createElement('div'); o.textContent = 'TAVOITE'; o.style.cssText = 'font-weight:bold;font-size:14px;letter-spacing:.5px;color:' + V.korostus + ';margin-bottom:8px'; p.appendChild(o);   // sona 16:04 "padding ja all caps"
      for (const r of tavoite) { const t = document.createElement('div'); t.textContent = r.replace(/^Tavoite:\s*/, '').replace(/^./, c => c.toUpperCase()); t.style.cssText = 'font-weight:normal;font-size:13px;margin-top:' + (p.childElementCount > 1 ? 8 : 2) + 'px'; p.appendChild(t); }   // sona 16:02 "lisää paddingiä näiden tekstien väliin"
      sisalto.appendChild(p); }
  }
};

const pienenna = (on) => { pienennetty = on;
  if (rivi) rivi.style.display = on ? 'none' : 'flex'; if (sisalto) sisalto.style.display = on ? 'none' : '';
  if (pieni) { pieni.textContent = on ? '+' : '–'; pieni.title = on ? 'Suurenna' : 'Pienennä'; } };

// sona 16:38 "taustalle kuva jossa on verta pikselitaiteena. Ei mikää kuva esine. Vaa käyttöliittymää" -> SVG-pikselit (4 px ruutu),
//   valumat yläreunasta + roiskeet, siemennetty ettei kuva vaihdu latauksesta toiseen. Läpikuultava, teksti pysyy luettavana.
const VERI_TAUSTA = (() => {
  let s = 811; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const W = 75, H = 160, sav = ['#8a0f14', '#6d0b10', '#a5161c', '#4f070b'], px = [];
  const p = (x, y, c, a) => { if (x >= 0 && x < W && y >= 0 && y < H) px.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + c + '" opacity="' + a + '"/>'); };
  for (let x = 0; x < W; x++) { const h = 2 + Math.floor(r() * 3); for (let y = 0; y < h; y++) p(x, y, sav[1], .55); }   // yläreunan verinauha
  for (let i = 0; i < 16; i++) { const x = Math.floor(r() * (W - 2)), len = 6 + Math.floor(r() * (r() < .3 ? 60 : 24)), lev = r() < .4 ? 2 : 1, c = sav[Math.floor(r() * 3)];
    for (let y = 2; y < len; y++) for (let k = 0; k < lev; k++) p(x + k, y, c, .5);
    p(x - 1 + lev, len, c, .5); p(x, len, c, .55); p(x + lev - 1, len + 1, c, .45); p(x, len + 1, c, .45); }   // pisara valuman päässä
  for (let i = 0; i < 9; i++) { const cx = Math.floor(r() * W), cy = 20 + Math.floor(r() * (H - 25)), rr = 1 + r() * 2.5, c = sav[Math.floor(r() * 4)];   // roiskeet
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x, y); if (d <= rr || (d <= rr + 2 && r() < .18)) p(cx + x, cy + y, c, d <= rr ? .32 : .26); } }
  return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W * 4 + '" height="' + H * 4 + '" shape-rendering="crispEdges">' + px.join('') + '</svg>') + '")';
})();

const rakenna = () => {
  ikkuna = document.createElement('div'); ikkuna.className = 'h811-tulostaulu';
  ikkuna.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:' + Z + ';width:300px;max-width:92vw;box-sizing:border-box;'
    + 'background:' + VERI_TAUSTA + ' top left/300px auto no-repeat,' + V.tausta + ';border:1px solid ' + V.reuna + ';border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.6);font:13px sans-serif;color:' + V.teksti + ';user-select:none';
  const ots = document.createElement('div');
  ots.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-weight:bold;letter-spacing:.5px;color:' + V.korostus + ';cursor:move;touch-action:none';
  const ot = document.createElement('span'); ot.textContent = OTSIKKO;   // sona 16:04 poisti koristeet ("Ei ne sovikkaan")
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
  // Koristeet (sona 16:00): veripisarat otsikon alareunasta + kurpitsa ja pääkallo alakulmissa. pointer-events:none, eivät estä klikkauksia.
  const veri = document.createElement('div');
  veri.style.cssText = 'position:absolute;left:0;right:0;top:30px;height:22px;pointer-events:none;overflow:hidden';
  veri.innerHTML = '<svg width="100%" height="22" viewBox="0 0 300 22" preserveAspectRatio="none"><path fill="#8b0000" d="M0 0 H300 V3'
    + ' Q292 3 290 9 Q288 15 286 9 Q284 3 262 3 Q258 3 257 14 Q256 21 254 14 Q253 3 215 3 Q211 3 210 7 Q209 11 207 7 Q206 3 160 3'
    + ' Q156 3 155 16 Q154 22 152 16 Q151 3 98 3 Q94 3 93 8 Q92 12 90 8 Q89 3 48 3 Q44 3 43 12 Q42 18 40 12 Q39 3 14 3 Q10 3 9 6 Q8 9 6 6 Q5 3 0 3 Z"/></svg>';
  const kulma = (merkki, puoli) => { const k = document.createElement('div'); k.textContent = merkki;
    k.style.cssText = 'position:absolute;bottom:-9px;' + puoli + ':-8px;font-size:20px;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))'; return k; };
  if (KORISTEET) { ikkuna.appendChild(veri); ikkuna.appendChild(kulma('🎃', 'left')); ikkuna.appendChild(kulma('💀', 'right')); }
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
