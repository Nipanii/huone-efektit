// ==UserScript==
// @name         kupla: Messenger-viestitoiminnot A/B-esikatselu (Vastaa, Kopioi, Piilota)
// @namespace    kupla
// @version      0.1.7
// @description  ESIKATSELU: viestirivin hoverilla yksi palkki: Vastaa, Kopioi, Piilota/Palauta. 1 = ikonipilleri (SVG-ikonit), 2 = tekstilinkit. Valinta localStorage 'toiminnot-testi' = 1 | 2 (oletus 1). Vastaa: lainaus lähtee viestin alussa ([nimi: "lainaus"] vastaus) ja näkyy kortina skriptin käyttäjille; Esc peruu.
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
  // 0.1.7 kp 17:44 "reply nuoli ei oo centered sen taustan kanssa eikä oo aligned copy napin kaa": polku y 4..14 -> 3..13 (keskikohta 8 kuten kopioi).
  const IKONIT = { vastaa: '<path d="M6 3L2 7l4 4"/><path d="M2 7h7a5 5 0 0 1 5 5v1"/>', kopioi: '<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1"/>', piilota: '<path d="M3 8h10"/>', palauta: '<path d="M8 3v10M3 8h10"/>', kopioitu: '<path d="M3 8.5l3 3 7-7"/>', sulje: '<path d="M4 4l8 8M12 4l-8 8"/>' };
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
        '.kmt-bar button{background:none;width:24px;height:22px;border-radius:5px;font-size:14px;line-height:0;padding:0;display:inline-flex;align-items:center;justify-content:center}' +
        '.kmt-bar button:hover{background:rgba(255,255,255,.14)}' +
        '.km-m.is-own .kmt-bar button[data-a=vastaa]::before{transform:scaleX(-1)}' +
        '.kmt-bar button::before{content:"";display:block;flex:0 0 14px;width:14px;height:14px;background-color:currentColor;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}' +
        Object.keys(IKONIT).map(k => '.kmt-bar button[data-l=' + k + ']::before{' + maskiTyyli(k) + '}').join('') +
        '.kmt-ik{display:inline-block;width:14px;height:14px;vertical-align:-2px;background-color:currentColor;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}' +
        Object.keys(IKONIT).map(k => '.kmt-ik-' + k + '{' + maskiTyyli(k) + '}').join('')
      : '.kmt-bar{gap:8px;font-size:11px}' +
        '.kmt-bar button{background:none;padding:0;color:#9aa6b4;text-decoration:underline;font-size:11px}' +
        '.kmt-bar button:hover{color:#dce6f2}') +
    '.kmt-lainaus{display:flex;align-items:center;gap:8px;margin:0 16px;padding:5px 10px;border-left:3px solid #62c1d6;background:rgba(255,255,255,.05);color:#b9c4d0;font-size:12px}' +
    '.kmt-lainaus b{color:#dce6f2}.kmt-lainaus span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.kmt-lainaus button{border:0;background:none;color:#9aa6b4;cursor:pointer;font-size:14px}' +
    // 0.1.7: vastausviesti. Reactin teksti jää DOMiin koskematta (font-size 0), näkyvä sisältö on omat solmut --kmt-fs-koossa.
    '.km-txt[data-kmt-v]{font-size:0!important}' +
    '.km-txt[data-kmt-v] > .kmt-vk,.km-txt[data-kmt-v] > .kmt-vr,.km-txt[data-kmt-v] > .kmt-bar{font-size:var(--kmt-fs,13px)}' +
    // Sama ulkoasu kuin live chatin vastauslainaus (DarkUI ChatWidgetView.scss .chat-reply-quote): yksi rivi, '↩ nimi' lihavoituna, lainaus katkeaa ellipsiin.
    '.kmt-vk{display:flex;gap:4px;max-width:100%;margin-bottom:3px;padding-left:5px;border-left:2px solid #0d6efd;font-size:12px!important;line-height:14px;white-space:nowrap;overflow:hidden;opacity:.75}' +
    '.kmt-vk b{flex:0 0 auto;font-weight:700}.kmt-vk .kmt-vq{min-width:0;overflow:hidden;text-overflow:ellipsis}.kmt-vr{white-space:pre-wrap}';
  document.head.appendChild(s);

  const teksti = el => { let t = ''; (function k(n) { for (const c of n.childNodes) { if (c.nodeType === 3) t += c.nodeValue; else if (c.nodeType === 1 && !c.matches('.kmm-add,.km-mod,.kmt-bar,.kmt-vk,.kmt-vr')) k(c); } })(el); return t.trim(); };
  // 0.1.7 vastausmuoto (kp 17:08-17:28 "reply test" · "replyt ei vielkää näy mitenkää"). Luettava ilman skriptiäkin. Max 255 (MESSENGER_MAX_LENGTH
  //   ja CHANNEL_MESSAGE_MAX_LENGTH, MessengerViewModel.ts:32 / MessengerChannels.ts:31), lainaus lyhenee ensin.
  //   kp 17:35 "näkyy mut näkyy outoja merkkejä" (↩ ja «» ilman skriptiä): muoto on nyt pelkkää ASCIIa, [nimi: "lainaus"] vastaus.
  //   Vanha ↩-muoto luetaan yhä (robon testiviesti 17:34).
  const MAX = 255, VASTAUS = /^(?:\[([^:\[\]"\n]{1,40}): "([^"]*)"\]|↩ ([^:«»\n]{1,40}): «([^»]*)») ?([\s\S]*)$/;
  const osat = x => { const m = VASTAUS.exec(x); return m && { nimi: m[1] || m[3], lainaus: m[1] ? m[2] : m[4], vastaus: m[5] }; };
  const runko = t => { const x = teksti(t), o = osat(x); return o ? o.vastaus : x; };
  const kokoa = (nimi, lainaus, vastaus) => {
    const tila = MAX - vastaus.length - nimi.length - 6;   // "[" + ': "' + '"] '
    const q = lainaus.replace(/\s+/g, ' ').replace(/"/g, "'");
    return ('[' + nimi + ': "' + (q.length <= tila ? q : (tila > 3 ? q.slice(0, tila - 3) + '...' : '...')) + '"] ' + vastaus).slice(0, MAX);
  };
  const kortti = t => {
    if (t.hasAttribute('data-kmt-v') || t.closest('#km2')) return;
    const o = osat(teksti(t)); if (!o) return;
    t.style.setProperty('--kmt-fs', getComputedStyle(t).fontSize);
    const k = document.createElement('span'); k.className = 'kmt-vk';
    const b = document.createElement('b'); b.textContent = '↩ ' + o.nimi;
    const q = document.createElement('span'); q.className = 'kmt-vq'; q.textContent = o.lainaus; q.title = o.lainaus;
    k.append(b, q);
    // Runko kloonataan Reactin solmuista (linkit säilyvät), etuliite leikataan kloonista merkki kerrallaan.
    const r = document.createElement('span'); r.className = 'kmt-vr';
    for (const c of t.childNodes) if (!(c.nodeType === 1 && c.matches('.kmm-add,.km-mod,.kmt-bar,.kmt-vk,.kmt-vr,.kmm-kopioi'))) r.appendChild(c.cloneNode(true));
    let pois = teksti(t).length - o.vastaus.length, eka = true;   // teksti() trimmaa alun, joten vain ensimmäisen tekstisolmun alkutyhjä ei kuulu laskuun
    (function leikkaa(n) { for (const c of [...n.childNodes]) { if (pois <= 0) return;
      if (c.nodeType === 3) { const v = eka ? c.nodeValue.replace(/^\s+/, '') : c.nodeValue; if (v) eka = false; const d = Math.min(pois, v.length); c.nodeValue = v.slice(d); pois -= d; }
      else if (c.nodeType === 1) leikkaa(c);
      if (!c.textContent && !(c.nodeType === 1 && c.querySelector('img,video'))) c.remove(); } })(r);
    t.insertBefore(r, t.firstChild); t.insertBefore(k, r); t.setAttribute('data-kmt-v', '');
  };
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

  // 0.1.7 kp 17:36 "esc ei peru replyy eikä chatin vaihto": lainaus sidotaan keskusteluun (km-main: MessengerThreadPane.tsx:192 /
  //   MessengerChannelPane.tsx:111) ja poistetaan kun keskustelu vaihtuu tai sulkeutuu.
  const ketju = () => { const k = document.querySelector('.kupla-messenger .km-main');
    return k ? k.getAttribute('data-conversation-kind') + ':' + (k.getAttribute('data-friend-id') || k.getAttribute('data-channel-id')) : ''; };
  //   kp 17:36:53 "mut minimize peruu mitä en fanita": minimointi purkaa paneelin (nauha katoaa sen mukana), joten odottava lainaus
  //   pidetään muistissa (odottava) ja nauha piirretään uudelleen kun sama keskustelu on taas auki. Peruu: Esc, X, lähetys, toinen keskustelu.
  let odottava = null;
  const peru = () => { odottava = null; document.querySelectorAll('.kmt-lainaus').forEach(n => n.remove()); };
  const nayta = (fokus) => {
    const inp = document.querySelector('.kupla-messenger .km-inp'); if (!inp || !odottava) return;
    let n = inp.parentNode.querySelector(':scope > .kmt-lainaus');
    if (!n) { n = document.createElement('div'); n.className = 'kmt-lainaus'; inp.parentNode.insertBefore(n, inp); }
    n.textContent = ''; n.dataset.nimi = odottava.nimi; n.dataset.lainaus = odottava.lainaus; n.dataset.ketju = odottava.ketju;
    const nimi = document.createElement('b');
    if (ikoni) nimi.append(ikonispan('vastaa'), ' ' + odottava.nimi + ':'); else nimi.textContent = '↩ ' + odottava.nimi + ':';
    const sn = document.createElement('span'); sn.textContent = odottava.lainaus.slice(0, 80);
    const x = document.createElement('button'); x.type = 'button'; x.title = 'Peru vastaus'; x.onclick = peru;
    if (ikoni) x.appendChild(ikonispan('sulje')); else x.textContent = '✕';
    n.append(nimi, sn, x);
    const kentta = fokus && inp.querySelector('input'); kentta && kentta.focus();
  };
  const lainaa = t => {
    const who = t.closest('.km-m') && t.closest('.km-m').querySelector('.km-who > span');
    odottava = { nimi: (who ? who.textContent : '').trim().slice(0, 40), lainaus: runko(t), ketju: ketju() };
    nayta(true);
  };

  // 0.1.7 lähetys: Enter tai Lähetä kun lainaus on auki -> kentän arvo = kokoa(...) Reactin omalla setterillä + input-tapahtuma, sitten
  //   natiivi Lähetä-klikkaus seuraavalla tikillä (send() lukee messageText-tilan, joka päivittyy vasta renderissä). document-capture
  //   ehtii ennen Reactin juurikuuntelijaa, joten alkuperäinen Enter ei lähetä mitään.
  let ohita = false;
  const lahetaLainauksella = inp => {
    const n = inp && inp.parentNode && inp.parentNode.querySelector(':scope > .kmt-lainaus'); if (!n) return false;
    const kentta = inp.querySelector('input'), vastaus = kentta ? kentta.value.trim() : ''; if (!vastaus) return false;
    const arvo = kokoa(n.dataset.nimi || '', n.dataset.lainaus || '', vastaus);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(kentta, arvo);
    kentta.dispatchEvent(new Event('input', { bubbles: true }));
    peru();
    setTimeout(() => { const b = inp.querySelector('.km-btn.is-primary'); ohita = true; try { b && b.click(); } finally { ohita = false; } }, 0);
    return true;
  };
  document.addEventListener('keydown', ev => {
    const k = ev.target; if (!k || !k.matches || !k.matches('.km-inp > input')) return;
    const inp = k.closest('.km-inp');
    if (ev.key === 'Escape') { const n = inp.parentNode.querySelector(':scope > .kmt-lainaus'); if (n) { peru(); ev.preventDefault(); ev.stopImmediatePropagation(); } return; }   // I167
    if (ev.key !== 'Enter' || ev.isComposing) return;
    if (lahetaLainauksella(inp)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', ev => {
    if (ohita) return; const b = ev.target.closest && ev.target.closest('.km-inp > .km-btn.is-primary'); if (!b) return;
    if (lahetaLainauksella(b.closest('.km-inp'))) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);

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
  // B145 kp 17:42 "kun resizee chat pienemmäks niin uusimmat viestit putoo pois ruudulta eikä vanhimmat": pohjassa ollut lista pysyy pohjassa
  //   kun sen koko muuttuu (scrollTop ei muutu kutistuessa, joten ilman tätä alin rivi valuu näkyvistä).
  const pohjassa = new WeakMap(), seurattu = new WeakSet();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => { const m = e.target; if (pohjassa.get(m) !== false) m.scrollTop = m.scrollHeight; })) : null;
  const seuraa = () => { if (ro) document.querySelectorAll('.kupla-messenger .km-msgs').forEach(m => { if (seurattu.has(m)) return; seurattu.add(m); ro.observe(m);
    m.addEventListener('scroll', () => pohjassa.set(m, m.scrollHeight - m.scrollTop - m.clientHeight < 40), { passive: true }); }); };
  const kaikki = () => { ajastettu = false; seuraa(); document.querySelectorAll('.km-msgs .km-txt').forEach(t => { kortti(t); rakenna(t); });
    const k = ketju(); if (!odottava || !k) return;   // k tyhjä = minimoitu/suljettu: lainaus odottaa
    if (odottava.ketju !== k) peru(); else if (!document.querySelector('.kupla-messenger .kmt-lainaus')) nayta(false); };
  new MutationObserver(() => { if (!ajastettu) { ajastettu = true; setTimeout(kaikki, 120); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  kaikki();
})();
