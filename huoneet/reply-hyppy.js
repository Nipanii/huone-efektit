// Huoneskripti: reply-lainauksen klikkaus hyppää alkuperäiseen viestiin ja alkuperäinen välähtää (huone 424, kp 6.11. 12:05 "laitahan huonescriptinä toi reply hyppy päälle"
//   · "silleen et jos se tulee liveen niin se osaa mennä pois päältä" · "ja active kaikille huoneessa heti").
// Sama logiikka kuin Messenger-kortti userscriptit/reply-hyppy/reply-hyppy.user.js 0.3.4, käärittynä huoneskriptin muotoon: ei @-otsikoita, palauttaa siivousfunktion,
//   uudelleenajo siivoaa edellisen (window.__huoneReplyHyppy). Moottori (moottori.js:66-67) ajaa tämän new Function('kupla', koodi)(api):lla ja kutsuu paluuarvoa huoneesta lähtiessä.
//
// MITEN: lainaus kantaa vain replyToName + replyToExcerpt (ChatWidgetMessageView.tsx:232, ChatHistoryPulldownView.tsx:139, ChatHistoryView.tsx:159), ei viesti-id:tä.
//   Alkuperäinen = uusin aiempi rivi, jonka lähettäjä on replyToName ja jonka teksti alkaa excerptillä (40 merkkiä, "…" pois).
//   Järjestys: 1) livekupla 2) Viestihistoria-ikkuna (myös irrotettu ↗) 3) vetohistoria avataan samalla vedolla kuin käsin. Ei löydy -> toast.
//
// ITSESAMMUTUS (kp 12:05 "jos se tulee liveen niin se osaa mennä pois päältä"): kun natiivi reply-hyppy (kupla-cc PR #826, ChatReplyJump.ts) on clientissa, tämä ei tee mitään.
//   Merkki: natiivi lisää stylesheetiin säännön `.bubble-container .chat-bubble.chat-reply-jump { filter: drop-shadow(...) }` (ChatWidgetView.scss:1282, luokka
//   CHAT_REPLY_JUMP_CLASS ChatReplyJump.ts:29), jota millään muulla clientin osalla ei ole. Tämä skripti EI käytä sitä luokkaa (oma pulssi on inline-filter), joten se ei tunnista itseään.
//   Tarkistus (natiivi()): (a) laskettu tyyli: piilotettu .bubble-container > .chat-bubble.chat-reply-jump -koe, filter sisältää drop-shadow -> sääntö on olemassa
//   (toimii vaikka stylesheet olisi toisesta originista, eikä riipu tiedoston muodosta), TAI (b) kaikkien luettavien stylesheetien selectorText sisältää "chat-reply-jump".
//   Ajetaan 1) heti alussa ENNEN kuin koukkua asennetaan (natiivi -> palautetaan tyhjä siivous) ja 2) JOKAISELLA lainausklikkauksella ennen käsittelyä (natiivi React-onClick
//   hoitaa silloin klikkauksen, tämä ei pysäytä eikä tuplaa).
// Lisäksi: jos käyttäjällä on kortti-versio päällä (window.__kuplaReplyHyppy), huoneskripti ei käsittele klikkauksia (ei tuplapulssia).
// RAJA: ei testattu oikealla toisella pelaajalla eikä oikealla natiivibuildillä (PR #826 ei vielä livessä); vetohistoria sisältää vain 150 uusinta viestiä; kaksi samaa tekstiä
//   samalta lähettäjältä: uusin aiempi voittaa. Irrotettu popout joka avattiin ennen skriptin käynnistystä jää ilman kuuntelijaa (sulje ja avaa uudelleen).
if (window.__huoneReplyHyppy) { try { window.__huoneReplyHyppy.poistu(); } catch (e) {} }
const VW = window;
const NAT = 'chat-reply-jump';
const natiivi = () => {
    try {
        const p = document.createElement('div'), c = document.createElement('div');
        p.className = 'bubble-container'; c.className = 'chat-bubble ' + NAT; p.appendChild(c);
        p.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(p);
        let f = ''; try { f = getComputedStyle(c).filter || ''; } finally { p.remove(); }
        if (/drop-shadow/.test(f)) return true;
    } catch (e) {}
    const luku = rs => { for (const r of rs) { if (r.selectorText && r.selectorText.includes(NAT)) return true; if (r.cssRules && luku(r.cssRules)) return true; } return false; };
    try { for (const ss of document.styleSheets) { let rs = null; try { rs = ss.cssRules; } catch (e) { continue; } if (rs && luku(rs)) return true; } } catch (e) {}
    return false;
};
const tila = VW.__huoneReplyHyppy = { versio: 'huone-0.3.4', natiivi: natiivi, loki: [], poistu() {} };
const loki = s => { tila.loki.push(new Date().toTimeString().slice(0, 8) + ' ' + s); if (tila.loki.length > 50) tila.loki.shift(); };
if (natiivi()) {
    loki('natiivi reply-hyppy havaittu (' + NAT + '), ei asenneta');
    tila.poistu = () => { if (VW.__huoneReplyHyppy === tila) delete VW.__huoneReplyHyppy; };
    return tila.poistu;
}

const SEL = '.chat-reply-quote,.chat-history-reply-quote';
const HIST = '.nitro-chat-history,.chat-history-popout-root';
const pulssit = new WeakMap();
let elossa = true, ajastimet = [], palautukset = [], toastEl = null, popoutit = [];
const odota = ms => new Promise(r => { ajastimet.push(setTimeout(r, ms)); });
const norm = s => (s || '').replace(/\s+/g, ' ').trim();
const nimi = s => norm(s).replace(/^↩\s*/, '').replace(/:$/, '').trim().toLowerCase();
const rivit = (k, d = document) => k === 'h' ? [...d.querySelectorAll('.chat-history-entry')]
    : k === 'p' ? [...document.querySelectorAll('.nitro-chat-pulldown .bubble-container:not(.chat-pulldown-measure)')]
    : [...document.querySelectorAll('.nitro-chat-widget .bubble-container')].filter(b => !b.closest('.nitro-chat-pulldown'));
// kuvat (GIF, emoji) kuten clientin chatHtmlToPlainText: img -> alt
const teksti = m => { let s = ''; const k = n => { for (const c of n.childNodes) { if (c.nodeType === 3) s += c.nodeValue; else if (c.nodeName === 'IMG') s += c.alt || ''; else k(c); } }; if (m) k(m); return norm(s); };
const tiedot = r => { const u = r.querySelector('.username'), q = r.querySelector(SEL); return { n: nimi(u && u.textContent), t: teksti(r.querySelector('.message')), q: q ? lainaus(q) : null }; };
// vastaus vastaukseen -> lähettäjän client lainaa alkuperäisen RAAKATEKSTIN "↩ Nimi «lainaus» → teksti", joka katkeaa 40 merkissä ennen tekstiä.
//   Silloin alkuperäinen tunnistetaan sen OMASTA lainauksesta (s = sisäkkäinen nimi + lainaus).
const lainaus = q => { const e = norm(q.children[1] && q.children[1].textContent).replace(/…$/, ''), m = e.match(/^↩\s*(.+?)\s*«\s*(.*?)(?:».*)?$/);
    return { n: nimi(q.children[0] && q.children[0].textContent), e, s: m ? { n: nimi(m[1]), e: m[2].replace(/…$/, '') } : null }; };
// väljä vertailu: linkit/emojit/välimerkit renderöityvät kuplassa eri tavalla kuin excerptissä
const v = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const alkaa = (t, e) => t.startsWith(e) || (v(e).length >= 3 && v(t).startsWith(v(e)));
const osuu = (x, l) => x.n === l.n && (alkaa(x.t, l.e) || !!(l.s && x.q && x.q.n === l.s.n && (alkaa(x.q.e, l.s.e) || alkaa(l.s.e, x.q.e))));
const etsi = (L, loppu, l) => { for (let i = loppu - 1; i >= 0; i--) { if (osuu(tiedot(L[i]), l)) return L[i]; } return null; };
// a = rivin avain klikkaushetkellä (live-solmuja kierrätetään, joten rivi voi myöhemmin olla toinen viesti)
const raja = (L, rivi, a) => { const i = L.indexOf(rivi), y = i >= 0 && tiedot(rivi);
    if (y && y.n === a.n && y.t === a.t) return i;
    for (let j = L.length - 1; j >= 0; j--) { const x = tiedot(L[j]); if (x.n === a.n && x.t === a.t) return j; } return L.length; };

const toast = (d = document) => { if (toastEl) toastEl.remove(); toastEl = d.createElement('div'); toastEl.textContent = 'alkuperäistä ei löydy';
    toastEl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);background:#222;color:#fff;padding:6px 14px;border-radius:6px;z-index:99999;pointer-events:none;font:13px sans-serif';
    d.body.appendChild(toastEl); const t = toastEl; ajastimet.push(setTimeout(() => { t.remove(); if (toastEl === t) toastEl = null; }, 1800)); };

// live-kupla jää DOMiin vaikka on jo ruudun ulkopuolella -> yli puoliksi ulkona = ei kelpaa.
const naky = el => { const r = el.getBoundingClientRect(), w = el.ownerDocument.defaultView, A = r.width * r.height; if (!A) return false;
    const lx = Math.max(0, Math.min(r.right, w.innerWidth) - Math.max(r.left, 0)), ly = Math.max(0, Math.min(r.bottom, w.innerHeight) - Math.max(r.top, 0));
    return lx * ly * 2 >= A; };
const nayta = (el, sc) => {
    if (sc) sc.scrollTo({ top: sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - sc.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
    // sama hehku kuin hoverilla livechatissa (ChatWidgetView.scss, $blue #0d6efd); INLINE filter, EI luokkaa chat-reply-jump (se on natiivin itsesammutusmerkki)
    const z = el.querySelector('.chat-bubble') || el, s = z.style;
    const vanha = pulssit.get(z); if (vanha) { vanha.ajast.forEach(clearTimeout); vanha.pal(); }
    const vv = vanha ? vanha.v : s.filter;
    const H = 'drop-shadow(0 0 1px #0d6efd) drop-shadow(0 0 2px #0d6efd)';
    const ajast = [], pal = () => { s.filter = vv; palautukset = palautukset.filter(f => f !== pal); pulssit.delete(z); }; palautukset.push(pal); pulssit.set(z, { v: vv, ajast, pal });
    const T = (f, ms) => { const t = setTimeout(f, ms); ajast.push(t); ajastimet.push(t); };
    // alku vasta smooth-scrollin jälkeen, 5 välähdystä 400 ms, viimeinen jää palamaan ~0.8 s (yht. ~4.4 s)
    s.filter = H;
    for (let i = 1; i < 9; i++) T(() => { s.filter = i % 2 ? vv : H; }, 600 + i * 400);
    T(pal, 600 + 9 * 400 + 400);
};

const historiasta = async (rivi, l, a, d) => {
    const sc = d.querySelector('.chat-history-list .overflow-auto'); if (!sc) return null;
    if (!rivi.closest(HIST)) { sc.scrollTop = sc.scrollHeight; await odota(150); }
    for (let i = 0; i < 80 && elossa; i++) {
        const L = rivit('h', d), k = etsi(L, raja(L, rivi, a), l); if (k) return [k, sc];
        if (sc.scrollTop <= 0) return null;
        sc.scrollTop = Math.max(0, sc.scrollTop - sc.clientHeight * 0.8); await odota(100);
    }
    return null;
};
const vetohistoria = async rivi => {
    if (!rivit('p').length) {
        const r = rivi.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const o = (t, dy) => rivi.dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: y + dy, pointerId: 1, isPrimary: true }));
        o('pointerdown', 0); o('pointermove', 25); o('pointermove', 60); o('pointerup', 60);
        for (let i = 0; i < 60 && elossa && !rivit('p').length; i++) await odota(100);
        await odota(300);
    }
    return rivit('p');
};
const hyppaa = async q => {
    const l = lainaus(q), k = q.closest(HIST) ? 'h' : q.closest('.nitro-chat-pulldown') ? 'p' : 'l', d = k === 'h' ? q.ownerDocument : document;
    const rivi = q.closest(k === 'h' ? '.chat-history-entry' : '.bubble-container'); if (!rivi) return;
    const a = tiedot(rivi);
    const pd = () => document.querySelector('.nitro-chat-pulldown .chat-pulldown-list');
    let loyto = null, sc = null;
    if (k === 'l') { const L = rivit('l'); loyto = etsi(L, raja(L, rivi, a), l); if (loyto && !naky(loyto)) loyto = null; }
    if (!loyto && k !== 'p') { const h = await historiasta(rivi, l, a, d); if (h) { loyto = h[0]; sc = h[1]; } }
    if (!loyto && k === 'p') { const P = rivit('p'); loyto = etsi(P, raja(P, rivi, a), l); sc = pd(); }
    if (!loyto && k === 'l') { const P = await vetohistoria(rivi); loyto = etsi(P, raja(P, rivi, a), l); sc = pd(); }
    if (loyto && elossa) nayta(loyto, sc); else if (elossa) toast(d);
};

const klik = e => {
    const q = e.target && e.target.closest && e.target.closest(SEL); if (!q) return;
    // natiivi tai kortti-versio hoitaa klikkauksen: ei pysäytetä eikä tuplata
    if (VW.__kuplaReplyHyppy) return;
    if (natiivi()) { if (!tila.natiiviKlikissa) { tila.natiiviKlikissa = true; loki('natiivi havaittu klikatessa, tämä skripti ei käsittele'); } return; }
    e.stopPropagation(); e.preventDefault();
    hyppaa(q).catch(() => {});
};
document.addEventListener('click', klik, true);
// irrotettu historiaikkuna: oma document, jonka listenerit document.open() pyyhkii -> liitetään vasta kun portal on renderöinyt juuren
const open0 = VW.open;
const open1 = function (...a) { const w = open0.apply(this, a); try { if (a[1] === 'darkui-chat-history' && w) liita(w); } catch (e) {} return w; };
const liita = w => { const t = setInterval(() => { try { if (!elossa || w.closed) return clearInterval(t);
    if (w.document.querySelector('.chat-history-popout-root')) { clearInterval(t); w.document.addEventListener('click', klik, true); popoutit.push(w.document); } } catch (e) { clearInterval(t); } }, 250); ajastimet.push(t); };
VW.open = open1;
loki('asennettu');

tila.poistu = () => {
    elossa = false; document.removeEventListener('click', klik, true); if (VW.open === open1) VW.open = open0;
    popoutit.forEach(d => { try { d.removeEventListener('click', klik, true); } catch (e) {} }); popoutit = [];
    ajastimet.forEach(t => { clearTimeout(t); clearInterval(t); }); palautukset.forEach(f => f()); palautukset = [];
    if (toastEl) toastEl.remove(); if (VW.__huoneReplyHyppy === tila) delete VW.__huoneReplyHyppy;
};
return tila.poistu;
