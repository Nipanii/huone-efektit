// ==UserScript==
// @name         kupla: Messenger-viestitoiminnot A/B-esikatselu (Vastaa, Kopioi, Piilota)
// @namespace    kupla
// @version      0.1.6
// @description  ESIKATSELU: viestirivin hoverilla yksi palkki: Vastaa, Kopioi, Piilota/Palauta. 1 = ikonipilleri (SVG-ikonit), 2 = tekstilinkit. Valinta localStorage 'toiminnot-testi' = 1 | 2 (oletus 1). Vastaa näyttää vain lainausnauhan, lähetys ei muutu.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// kp 2026-10-28 13:02 "mietitään miten saadaan piilotus ja esiin takas tuonti nappi, kopioi nappi ja reply nappi"
// + 12:30 "pitäskö olla joku - symboli viestin piilotukseen ja + et tulee takas esii" + 13:04 Kopioi ei ollut keskellä kuplaa pystysuunnassa.
// Piilota/Palauta klikkaa natiivia .km-mod-linkkiä (palvelinlogiikka ennallaan; natiivisti vain kanavat/ryhmät, omat tai moderaattori).
// Kopioi klikkaa messenger-median .kmm-kopioi-nappia, muuten leikepöytä suoraan. Nimet ::before-sisältönä, ei tekstisolmuina (innerText puhdas).
// 0.1.4 kp 2026-10-28 14:13 "emojeiden käyttöä pitäs välttää koska device kohtasta miltä näyttää": ikonit (reply, kopioi, -, +, X, check) SVG-maskeina
//   (IKONIT, currentColor), ei unicode-glyfejä. Variantti 2 (tekstilinkit) ennallaan; teksti- ja title-nimet ennallaan.
(() => {
  if (window.__kuplaToiminnotTesti) return; window.__kuplaToiminnotTesti = true;
  // 0.1.3 kp 13:54 "kopioi ja vastaa napit puutuu nyt, on vaa tekstinapit": oletus 1 = ikonit, 2 vain jos valittu.
  let v = '1'; try { v = localStorage.getItem('toiminnot-testi') === '2' ? '2' : '1'; } catch (_) {}
  const ikoni = v === '1';
  // 0.1.4: ikonit SVG-maskina (kp 14:13). viewBox 16, stroke 2, väri = currentColor. Avain = data-l ikonitilassa (kopioitu = onnistunut kopiointi).
  const IKONIT = { vastaa: '<path d="M6 4L2 8l4 4"/><path d="M2 8h7a5 5 0 0 1 5 5v1"/>', kopioi: '<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1"/>', piilota: '<path d="M3 8h10"/>', palauta: '<path d="M8 3v10M3 8h10"/>', kopioitu: '<path d="M3 8.5l3 3 7-7"/>', sulje: '<path d="M4 4l8 8M12 4l-8 8"/>' };
  const maski = k => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IKONIT[k] + '</svg>') + '")';
  const maskiTyyli = k => '-webkit-mask-image:' + maski(k) + ';mask-image:' + maski(k);
  const NAPIT = { vastaa: ['vastaa', 'Vastaa'], kopioi: ['kopioi', 'Kopioi'], piilota: ['piilota', 'Piilota'], palauta: ['palauta', 'Palauta'] };
  const ikonispan = k => { const sp = document.createElement('span'); sp.className = 'kmt-ik kmt-ik-' + k; return sp; };
  const s = document.getElementById('kmt-tyyli') || document.createElement('style'); s.id = 'kmt-tyyli'; s.dataset.v = v;
  s.textContent = '.km-txt{position:relative}' +
    // 0.1.6: hover-korostus per kuplarivi, ei koko ryhmälle (kp 15:15 "per bubble rivi, eikä per koko viesti ryhmäke").
    // Natiivi .km-m:hover rgba(255,255,255,.025) (MessengerView.scss:664) pois; sama sävy vain hoveroidun kuplan rivillä.
    // Varjo + clip-path = listan levyinen kaista ilman vaakavieritystä (varjo ei kasvata scroll-aluetta); background täyttää kuplan oman kohdan.
    '.km-msgs .km-m:hover{background:none}' +
    '.km-txt[data-kmt-rivi]::after{content:"";position:absolute;top:-3px;bottom:-3px;left:0;right:0;background:rgba(255,255,255,.025);box-shadow:0 0 0 100vmax rgba(255,255,255,.025);clip-path:inset(0 -100vmax);pointer-events:none}' +
    // Natiivit ja messenger-median napit pois näkyvistä vain riveillä joilla palkki on (palkki klikkaa niitä).
    '.km-txt[data-kmt] > .km-mod,.km-txt[data-kmt] .kmm-kopioi{display:none!important}' +
    '.kmt-bar{position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;white-space:nowrap;z-index:3;visibility:hidden}' +
    '.km-m:not(.is-own) .kmt-bar{left:100%;margin-left:6px}.km-m.is-own .kmt-bar{right:100%;margin-right:6px}' +
    // 0.1.2 kp 13:32 "reply nappi on aina lähimpänä kuplaa eli kopioi ja reply nappi vaihtaa päittäin omien viestejen kohdalla" + "mirrored reply nappi".
    '.km-m.is-own .kmt-bar{flex-direction:row-reverse}' +
    '.km-m.is-own .km-txt[data-kmt-yla] > .kmt-bar{top:auto;bottom:100%;right:0;transform:none;margin:0 0 2px}' +
    '.km-m:not(.is-own) .km-txt[data-kmt-yla] > .kmt-bar{top:auto;bottom:100%;left:auto;right:0;transform:none;margin:0 0 2px}' +
    '.km-txt[data-kmt-rivi] > .kmt-bar,.kmt-bar:focus-within{visibility:visible}' +
    '.kmt-bar button{border:0;cursor:pointer;color:#dce6f2;font:inherit}.kmt-bar button::before{content:attr(data-l)}' +
    (ikoni
      ? '.kmt-bar{background:#30363f;border-radius:7px;padding:2px;gap:1px;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
        '.kmt-bar button{background:none;width:24px;height:22px;border-radius:5px;font-size:14px;line-height:22px;padding:0}' +
        '.kmt-bar button:hover{background:rgba(255,255,255,.14)}' +
        '.km-m.is-own .kmt-bar button[data-a=vastaa]::before{display:inline-block;transform:scaleX(-1)}' +
        '.kmt-bar button::before{content:"";display:inline-block;width:14px;height:14px;vertical-align:middle;background-color:currentColor;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}' +
        Object.keys(IKONIT).map(k => '.kmt-bar button[data-l=' + k + ']::before{' + maskiTyyli(k) + '}').join('') +
        '.kmt-ik{display:inline-block;width:14px;height:14px;vertical-align:-2px;background-color:currentColor;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}' +
        Object.keys(IKONIT).map(k => '.kmt-ik-' + k + '{' + maskiTyyli(k) + '}').join('')
      : '.kmt-bar{gap:8px;font-size:11px}' +
        '.kmt-bar button{background:none;padding:0;color:#9aa6b4;text-decoration:underline;font-size:11px}' +
        '.kmt-bar button:hover{color:#dce6f2}') +
    '.kmt-lainaus{display:flex;align-items:center;gap:8px;margin:0 16px;padding:5px 10px;border-left:3px solid #62c1d6;background:rgba(255,255,255,.05);color:#b9c4d0;font-size:12px}' +
    '.kmt-lainaus b{color:#dce6f2}.kmt-lainaus span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.kmt-lainaus button{border:0;background:none;color:#9aa6b4;cursor:pointer;font-size:14px}';
  document.head.appendChild(s);

  const teksti = el => { let t = ''; (function k(n) { for (const c of n.childNodes) { if (c.nodeType === 3) t += c.nodeValue; else if (c.nodeType === 1 && !c.matches('.kmm-add,.km-mod,.kmt-bar')) k(c); } })(el); return t.trim(); };
  const nappi = (avain, nimi) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.a = avain;
    b.dataset.l = ikoni ? NAPIT[nimi][0] : NAPIT[nimi][1]; b.title = NAPIT[nimi][1]; b.setAttribute('aria-label', NAPIT[nimi][1]); return b; };

  const rakenna = t => {
    if (t.closest('#km2')) return;
    let bar = t.querySelector(':scope > .kmt-bar');
    const mod = t.querySelector(':scope > .km-mod');
    const tila = mod ? (/Palauta/.test(mod.textContent) ? 'palauta' : 'piilota') : '';
    if (bar && bar.dataset.tila === tila) return;
    if (bar) bar.remove();
    bar = document.createElement('span'); bar.className = 'kmt-bar'; bar.dataset.tila = tila;
    bar.appendChild(nappi('vastaa', 'vastaa')); bar.appendChild(nappi('kopioi', 'kopioi'));
    if (tila) bar.appendChild(nappi('mod', tila));
    t.appendChild(bar); t.setAttribute('data-kmt', '');
  };

  const lainaa = t => {
    const inp = document.querySelector('.km-inp'); if (!inp) return;
    let n = inp.parentNode.querySelector(':scope > .kmt-lainaus');
    if (!n) { n = document.createElement('div'); n.className = 'kmt-lainaus'; inp.parentNode.insertBefore(n, inp); }
    const who = t.closest('.km-m') && t.closest('.km-m').querySelector('.km-who > span');
    n.textContent = '';
    const nimi = document.createElement('b');
    if (ikoni) nimi.append(ikonispan('vastaa'), ' ' + (who ? who.textContent : '') + ':'); else nimi.textContent = '↩ ' + (who ? who.textContent : '') + ':';
    const sn = document.createElement('span'); sn.textContent = teksti(t).slice(0, 80);
    const x = document.createElement('button'); x.type = 'button'; x.title = 'Peru vastaus'; x.onclick = () => n.remove();
    if (ikoni) x.appendChild(ikonispan('sulje')); else x.textContent = '✕';
    n.append(nimi, sn, x);
    const kentta = inp.querySelector('input'); kentta && kentta.focus();
  };

  document.addEventListener('click', async ev => {
    const b = ev.target.closest && ev.target.closest('.kmt-bar button'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const t = b.closest('.km-txt');
    if (b.dataset.a === 'vastaa') lainaa(t);
    else if (b.dataset.a === 'kopioi') { const k = t.querySelector('.kmm-kopioi'); if (k) k.click(); else try { await navigator.clipboard.writeText(teksti(t)); } catch (_) {}
      b.dataset.l = ikoni ? 'kopioitu' : 'Kopioitu'; setTimeout(() => { b.dataset.l = ikoni ? NAPIT.kopioi[0] : NAPIT.kopioi[1]; }, 1200); }
    else if (b.dataset.a === 'mod') { const m = t.querySelector(':scope > .km-mod'); m && m.click(); }
  }, true);

  // Sama rivihover kuin messenger-media 0.1.3: koko viestirivi, ei vain kupla. Paikka lasketaan hoverilla.
  let rivi = null;
  const asetaRivi = t => {
    if (t === rivi) return; if (rivi) rivi.removeAttribute('data-kmt-rivi'); rivi = t; if (!t) return;
    const r = t.getBoundingClientRect(), l = t.closest('.km-msgs');
    // 0.1.1: monirivisessäkin keskellä pystysuunnassa (kp 13:21), ei enää top:0 korkeille.
    // 0.1.5: sama yläkulma myös muiden viesteille, kun oikealla ei ole tilaa (mitattu robolla: tarvitaan 59 px, oli 31, palkki leikkautui kortin reunaan).
    if (l) { const lb = l.getBoundingClientRect(), tila = t.closest('.km-m.is-own') ? r.left - lb.left : lb.right - r.right; t.toggleAttribute('data-kmt-yla', tila < (ikoni ? 90 : 130)); }
    t.setAttribute('data-kmt-rivi', '');
  };
  document.addEventListener('mousemove', ev => {
    const e = ev.target && ev.target.closest ? ev.target : null;
    const suora = e && e.closest('.km-msgs .km-txt'); if (suora) { asetaRivi(suora); return; }
    const m = e && e.closest('.km-msgs .km-m'); if (!m) { asetaRivi(null); return; }
    let paras = null, d = Infinity;
    for (const t of m.querySelectorAll('.km-txt')) { const r = t.getBoundingClientRect(), y = ev.clientY;
      const et = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (et < d) { d = et; paras = t; } }
    asetaRivi(paras);
  }, true);

  let ajastettu = false;
  const kaikki = () => { ajastettu = false; document.querySelectorAll('.km-msgs .km-txt').forEach(rakenna); };
  new MutationObserver(() => { if (!ajastettu) { ajastettu = true; setTimeout(kaikki, 120); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  kaikki();
})();
