// ==UserScript==
// @name         kupla: Messenger: avatarista ja nimestä profiili (yv)
// @namespace    kupla
// @version      0.1.0
// @description  Yksityisviestissä (yv) viestin avatarin tai nimen klikkaus avaa henkilön profiilin, kuten kanavissa ja ryhmissä jo natiivisti.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// kp 2026-10-28 14:03 "sun profiilikuvasta aukee sun profiili ja sun nimestä. yv ja group chat. ota mallia miten toteutettu muualla messengerissä".
// Lähde: MessengerChannelPane.tsx:156,158 (kanavat JA ryhmät, isGroup -> sama paneeli): avatar + .km-profile-link -> GetUserProfile(authorId).
//   Ryhmissä/kanavissa ei siis tehtävää. Yv (MessengerThreadPane.tsx:169) antoi MessengerAvatarille onClick=null eikä nimellä ollut kuuntelijaa.
//   Lähdekorjaus: worktree wt-dm-profiili (ei vielä mergattu). Tämä skripti = sama käytös userscriptinä.
// Reitti: GetUserProfile = SendMessageComposer(new UserProfileComposer(id)) = paketti 3265 (nitro/PROTOCOL.md:742). Sivun JS:llä ei ole bundlen
//   moduuleja, joten yhteys haetaan kuten asu.user.js / datajako.user.js: NitroDevTools.roomEngine._roomSessionManager -> olio jolla _cryptoState
//   (= yhteys), sen _messages._messageIdByComposer (Map composer->header) -> konstruktori jonka header on 3265 -> conn.send(new C(userId)).
// Kenen id: vastapuolen rivi = .km-main[data-friend-id]; oma rivi (.km-m.is-own) = NitroDevTools.roomEngine._sessionDataManager._userId.
// Kaksoisavauksen esto: jos natiivi lähdekorjaus on mukana, avatarin React-onClick on funktio -> skripti jättää väliin.
(() => {
  if (window.__kuplaMessengerProfiili) return;
  const dv = (o, k) => { const d = o && Object.getOwnPropertyDescriptor(o, k); return d && !d.get ? d.value : undefined; };
  const RE = () => window.NitroDevTools && window.NitroDevTools.roomEngine;
  let conn = null;
  function yhteys() {
    if (conn && dv(conn, '_messages')) return conn;
    const re = RE(); if (!re) return null;
    const seen = new Set(); let c = null;
    const scan = (o, d) => { if (!o || c || d > 4 || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { c = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) { const de = Object.getOwnPropertyDescriptor(o, k); if (de && !de.get && de.value && typeof de.value === 'object') scan(de.value, d + 1); } };
    scan(dv(re, '_roomSessionManager'), 0);
    return (conn = c);
  }
  function avaaProfiili(id) {
    const c = yhteys(); if (!c || !(id > 0)) return false;
    const map = dv(dv(c, '_messages'), '_messageIdByComposer'); let C = null;
    if (map) for (const [k, v] of map) if (v === 3265 && !C) C = k;   // USER_PROFILE
    if (!C) return false;
    c.send(new C(id)); return true;
  }
  const omaId = () => { const re = RE(); const sdm = re && dv(re, '_sessionDataManager'); const u = sdm && dv(sdm, '_userId'); return u > 0 ? u : 0; };
  const reactProps = el => { const k = Object.keys(el).find(x => x.startsWith('__reactProps')); return k ? el[k] : null; };
  const natiivi = el => { const p = reactProps(el); return !!(p && typeof p.onClick === 'function'); };
  // Palauttaa {id} kun klikattu elementti on yv-viestin avatar tai nimi, muuten null.
  function kohde(t) {
    if (!t || !t.closest) return null;
    const main = t.closest('.km-main[data-conversation-kind="private"][data-friend-id]'); if (!main) return null;
    const m = t.closest('.km-m'); if (!m || !main.contains(m)) return null;
    const el = t.closest('.km-av') || (t.closest('.km-who') && t.closest('.km-who > span:first-child'));
    if (!el || !m.contains(el)) return null;
    if (natiivi(el)) return null;
    const id = m.classList.contains('is-own') ? omaId() : parseInt(main.getAttribute('data-friend-id'), 10);
    return id > 0 ? { id, el } : null;
  }
  const klik = e => { if (e.button) return; const k = kohde(e.target); if (!k) return; if (avaaProfiili(k.id)) e.stopPropagation(); };
  document.addEventListener('click', klik, true);
  const tyyli = document.createElement('style'); tyyli.id = 'kmp-tyyli';
  tyyli.textContent = '.km-main[data-friend-id] .km-m .km-av,.km-main[data-friend-id] .km-m .km-who > span:first-child{cursor:pointer}' +
    '.km-main[data-friend-id] .km-m .km-who > span:first-child:hover{text-decoration:underline}';
  document.head.appendChild(tyyli);
  window.__kuplaMessengerProfiili = { versio: '0.1.0', avaa: avaaProfiili, kohde, pois() { document.removeEventListener('click', klik, true); tyyli.remove(); delete window.__kuplaMessengerProfiili; } };
})();
