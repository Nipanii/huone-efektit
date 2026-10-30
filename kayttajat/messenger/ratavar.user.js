// ==UserScript==
// @name         kupla: :ratavar (ratojen tekijöille)
// @namespace    kupla
// @version      0.1.2
// @description  :ratavar <N> [nimi] kirjoittaa huoneen ratamuuttujan (ratoja_tehty) arvon itselle tai toiselle pelaajalle. Vaatii huoneen wired-muokkausoikeuden.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// kp 2026-10-28 18:06:53 "tarvitaan jakoon meille ratojen tekijöille vain toimiva :var<N> tai :var <n> joka kirjoittaa halutun ratoja_vedetty
//   variablen arvon itselleen" · 18:07:02 "ja nimi lisäparametrina yrittää kirjoittaa sen toiselle pelaajalle" · 18:07:20 "korjaus käytetään komentoa :ratavar".
// Luku: Wired Menun tarkastus 7012 [1 = käyttäjä, huoneindeksi] -> 7111 (values: id, value), sama kuin huoneet/681.js. Kirjoitus: 7016
//   [1, huoneindeksi, muuttujan id, arvo, 0] (sama paketti kuin supervoimat.user.js:232 internal-kentille). Mitattu robolla 682:ssa 28.10. 18:09:
//   room:442825 1 -> 2, luettu takaisin. Palvelin hyväksyy vain jos huoneen wired-modify-maski sallii kirjoittajan.
// Muuttuja valitaan kohteen omista 'room:*'-muuttujista: yksi = se, useampi = TUNNETUT-taulukon huonekohtainen, muuten virhe ja lista.
(() => {
  if (window.__kuplaRatavar) return;
  const VERSIO = '0.1.2';
  // 0.1.2 (kp 30.10. 22:09 "korjaa mun :ratavar komento jo asap"): 684:n viite on 453818 (nitro/data/684-tila.md:78), ei 453807.
  //   656 (aula) = alkuperäinen muuttuja room:439263 (luettu robon tarkastuksella 22:10).
  const TUNNETUT = { 656: 'room:439263', 681: 'room:442708', 682: 'room:442825', 683: 'room:446543', 684: 'room:453818' };
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };

  function ilmoita(teksti, virhe) {
    const k = window.kuplaKomennot; if (k && k.ilmoita) { k.ilmoita(teksti, virhe); return; }
    const d = document.createElement('div'); d.textContent = teksti;
    d.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483646;padding:5px 10px;border-radius:5px;' +
      'background:rgba(20,20,24,.92);color:#fff;font-size:12px;pointer-events:none;border:1px solid ' + (virhe ? '#ee5a49' : 'rgba(255,255,255,.2)');
    document.body.appendChild(d); setTimeout(() => d.remove(), virhe ? 7000 : 5000);
  }

  function huone() {
    const e = window.NitroDevTools && window.NitroDevTools.roomEngine; if (!e) return null;
    const sm = dv(e, '_roomSessionManager'), r = e.activeRoomId, s = sm && sm.getSession && sm.getSession(r);
    return s ? { e, sm, r, s } : null;
  }
  function yhteys(sm) {
    const seen = new Set(); let c = null;
    const sc = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) { const x = Object.getOwnPropertyDescriptor(o, k); if (x && !x.get && x.value && typeof x.value === 'object') sc(x.value, d + 1); } };
    sc(sm, 0); return c;
  }
  function indeksi(h, nimi) {
    if (!nimi) return { i: h.s.ownRoomIndex, nimi: 'itse' };
    const ud = h.s.userDataManager, n = nimi.toLowerCase();
    for (const o of h.e.getRoomObjects(h.r, 100) || []) { const u = ud && ud.getUserDataByIndex && ud.getUserDataByIndex(o.id);
      if (u && u.name && u.name.toLowerCase() === n && String(o.type) === 'user') return { i: o.id, nimi: u.name }; }
    return null;
  }
  function lue(c, i) {
    return new Promise(res => {
      const alk = c.handleMessages; let valmis = false;
      const pois = () => { if (c.handleMessages === oma) c.handleMessages = alk; };
      const oma = function (...v) {
        v = v.filter(m => { const p = m && m.parser;
          if (!valmis && p && p.type === 1 && p.objectId === i && Array.isArray(p.values) && Array.isArray(p.wiredIds)) { valmis = true; res(p.values); return false; }
          return true; });
        if (valmis) pois(); if (v.length) return alk.apply(this, v); };
      c.handleMessages = oma;
      c.sendRawPacket(7012, [1, i], 'ratavar');
      setTimeout(() => { if (!valmis) { pois(); res(null); } }, 4000);
    });
  }

  async function ratavar(teksti) {
    const m = /^(\d+)(?:\s+(.+))?$/.exec(String(teksti || '').trim());
    if (!m) throw new Error('käyttö: :ratavar <N> [nimi]');
    const arvo = +m[1], h = huone(); if (!h) throw new Error('et ole huoneessa');
    const c = yhteys(h.sm); if (!c || typeof c.sendRawPacket !== 'function') throw new Error('yhteyttä ei löytynyt');
    const k = indeksi(h, m[2] && m[2].trim()); if (!k || k.i == null || k.i < 0) throw new Error('"' + m[2] + '" ei ole tässä huoneessa');
    const ennen = await lue(c, k.i); if (!ennen) throw new Error('ei lukuoikeutta tai vastausta (wired-lukumaski)');
    const omat = ennen.filter(x => x && /^room:/.test(x.id));
    const tunnettu = TUNNETUT[h.r];
    let id = tunnettu && omat.some(x => x.id === tunnettu) ? tunnettu : (omat.length === 1 ? omat[0].id : null);
    if (!id) throw new Error(omat.length ? 'useita ratamuuttujia: ' + omat.map(x => x.id).join(', ') : 'tässä huoneessa ei ole ratamuuttujaa (room:*)');
    const vanha = (ennen.find(x => x && x.id === id) || {}).value;
    c.sendRawPacket(7016, [1, k.i, id, arvo, 0], 'ratavar');
    await new Promise(r => setTimeout(r, 1200));
    const jalkeen = await lue(c, k.i), uusi = jalkeen && (jalkeen.find(x => x && x.id === id) || {}).value;
    if (Number(uusi) !== arvo) throw new Error(k.nimi + ': ' + id + ' on ' + uusi + ' (ei muuttunut; puuttuuko wired-muokkausoikeus?)');
    return ':ratavar ' + k.nimi + ': ' + id + ' ' + (vanha == null ? '-' : vanha) + ' -> ' + uusi;
  }

  const aja = (rivi) => {
    const m = /^\s*:ratavar(?:\s+([\s\S]*))?$/i.exec(rivi || ''); if (!m) return false;
    ratavar(m[1]).then(t => ilmoita(t), e => ilmoita(':ratavar virhe: ' + ((e && e.message) || e), true));
    return true;
  };
  const nappain = e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    if (!aja(t.value)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    try { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
  };
  document.addEventListener('keydown', nappain, true);
  window.__kuplaRatavar = { versio: VERSIO, ratavar, pois() { document.removeEventListener('keydown', nappain, true); delete window.__kuplaRatavar; } };
})();
