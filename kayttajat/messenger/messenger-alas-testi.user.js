// ==UserScript==
// @name         kupla: Messenger alas-nappi + leveämpi scrollbar (testi)
// @namespace    kupla
// @version      0.2.4
// @description  TESTI: kun selaat vanhoja viestejä, listan alalaitaan keskelle tulee V-nuoli ilman taustaa, joka vie loppuun. Uusia tullut: vari = oranssi, valo = kirkkaampi turkoosi , vilkku = hidas hengitys (localStorage alas-testi = vari | valo | vilkku). Viestilistan scrollbar 8px -> 14px.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// I150, kp app 2026-10-28 13:10 "sit ois joku scroll down nappi jos lukee vanhoja ettei olis pakko tota scrollbar käyttää aina.
// scrollbar on kans niin kapea et siihen on vaikee osua." Natiivi leveys main-live MessengerView.scss:605 (.km-msgs 8px).
// Oletus on (kp 13:51 "vaihdetaan päittäin: mun client on testausta varten ja sun on vertailu natiivilla"); 13:09-13:51 oli off.
(() => {
  if (window.__kuplaAlasTesti) return; window.__kuplaAlasTesti = true;
  const RAJA = 150; // px loppuun asti: tätä kauempana nappi näkyy
  const s = document.getElementById('kma-tyyli') || document.createElement('style'); s.id = 'kma-tyyli';
  s.textContent = '.km-main{position:relative}' +
    // 0.2.4: globaali assets/styles/scrollbars.scss antaa radalle 0.25rem tumman border-rightin ja kahvalle sinertävän (:not(:horizontal),
    // sama tarkkuus kuin .km-msgs-sääntö) -> näkyi "2 palkkia" (kp 13:19). :vertical nostaa tarkkuuden ohi.
    '.km-msgs::-webkit-scrollbar,.km-msgs::-webkit-scrollbar:vertical{width:14px}' +
    '.km-msgs::-webkit-scrollbar-track,.km-msgs::-webkit-scrollbar-track:vertical{background:transparent;border:0}' +
    '.km-msgs::-webkit-scrollbar-thumb,.km-msgs::-webkit-scrollbar-thumb:vertical{background:#4a525d;border-radius:7px;border:3px solid transparent;background-clip:padding-box;min-height:40px}' +
    '.km-msgs::-webkit-scrollbar-thumb:vertical:hover{background:#6b7480;background-clip:padding-box;border:3px solid transparent}' +
    // 0.2.0 kp 13:12 "V arrow keskelle ruutuu alas ilman mitää taustaa, värillä mikä erottuu harmaasta taustasta"
    '.kma-alas{position:absolute;transform:translateX(-50%);z-index:5;display:none;flex-direction:column;align-items:center;padding:0;border:0;background:none;' +
      'color:#62c1d6;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}' +
    '.kma-alas svg{width:22px;height:13px;display:block}.kma-alas:hover{color:#8fdcec}.kma-alas.is-nakyva{display:flex}' +
    '.kma-alas::after{content:attr(data-l);font-size:11px;font-weight:700;line-height:12px}' +
    // kp 13:12 "2 eri väriä sille riippuen onko tullu uus viesti vai ei": turkoosi = ei uutta, oranssi = uusia tullut.
    'html[data-kma=vari] .kma-alas.is-uusia{color:#f5a623}html[data-kma=vari] .kma-alas.is-uusia:hover{color:#ffc35c}' +
    // "tai eri valotaso": sama turkoosi, himmeä kun ei uutta, kirkas kun uusia.
    'html[data-kma=valo] .kma-alas{color:rgba(98,193,214,.45)}html[data-kma=valo] .kma-alas:hover{color:rgba(98,193,214,.8)}' +
    'html[data-kma=valo] .kma-alas.is-uusia{color:#a8ecfa;filter:drop-shadow(0 0 5px rgba(98,193,214,.9))}' +
    // "tai joku rauhallinen vilkku efekti": sama turkoosi, uusia tullut = hidas hengitys 2.4 s.
    '@keyframes kma-hengitys{0%,100%{opacity:1}50%{opacity:.35}}' +
    'html[data-kma=vilkku] .kma-alas.is-uusia{animation:kma-hengitys 2.4s ease-in-out infinite}' +
    '@media (prefers-reduced-motion:reduce){html[data-kma=vilkku] .kma-alas.is-uusia{animation:none;color:#a8ecfa}}';
  document.head.appendChild(s);
  try { const a = localStorage.getItem('alas-testi'); document.documentElement.dataset.kma = (a === 'valo' || a === 'vilkku') ? a : 'vari'; } catch (_) {}

  const tila = new WeakMap(); // .km-msgs -> { nappi, viimeinen }
  const paivita = l => {
    const main = l.closest('.km-main'); if (!main) return;
    let t = tila.get(l);
    if (!t || !t.nappi.isConnected) {
      const n = document.createElement('button'); n.type = 'button'; n.className = 'kma-alas'; n.title = 'Uusimpiin viesteihin'; n.setAttribute('aria-label', 'Uusimpiin viesteihin');
      n.innerHTML = '<svg viewBox="0 0 34 20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4 L17 16 L30 4"/></svg>';
      n.addEventListener('click', () => l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }));
      main.appendChild(n); t = { nappi: n, viimeinen: null }; tila.set(l, t);
    }
    const kaukana = l.scrollHeight - l.scrollTop - l.clientHeight > RAJA;
    // 0.2.2: lasketaan viimeisen NÄHDYN viestin JÄLKEEN tulleet. Pelkkä määrä laski ylös selatessa ladatun vanhan historian uusiksi (42 uutta).
    const txt = l.querySelectorAll('.km-txt');
    if (!kaukana || !t.viimeinen || !t.viimeinen.isConnected) t.viimeinen = txt[txt.length - 1] || null;
    let uusia = 0; for (let i = txt.length - 1; i >= 0 && txt[i] !== t.viimeinen; i--) uusia++;
    t.nappi.dataset.l = uusia ? uusia + ' uutta' : ''; t.nappi.classList.toggle('is-uusia', uusia > 0);
    const mr = main.getBoundingClientRect(), lr = l.getBoundingClientRect();
    t.nappi.style.bottom = Math.round(mr.bottom - lr.bottom + 10) + 'px';
    t.nappi.style.left = Math.round(lr.left - mr.left + l.clientWidth / 2) + 'px';
    t.nappi.classList.toggle('is-nakyva', kaukana);
  };
  document.addEventListener('scroll', ev => { const l = ev.target; if (l && l.classList && l.classList.contains('km-msgs')) paivita(l); }, true);
  let ajastettu = false;
  new MutationObserver(() => { if (ajastettu) return; ajastettu = true;
    setTimeout(() => { ajastettu = false; document.querySelectorAll('.km-msgs').forEach(paivita); }, 150); })
    .observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.km-msgs').forEach(paivita);
})();
