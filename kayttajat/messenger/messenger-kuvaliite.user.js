// ==UserScript==
// @name         kupla: Messenger-kuvaliite
// @namespace    kupla
// @version      0.2.0
// @description  Messenger: kuvan liittäminen (paste) viestikenttään -> vahvistus -> lataus -> kuvan URL kenttään. Lataus vain vahvistuksesta.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// Speksi: D:/re-lab/tmp/messenger-kuvaliite/TEHTAVA-2.md (kp 2026-10-28 16:58-16:59).
// Lataus = clientin uploadChatImage-sopimus; URL-tarkistus = getKuplaChatImageUrl sellaisenaan.
// 0.2.0 kp 2026-10-28 17:41:33 "lähetetäänkö tämä kuva juttu voidaa kyl tehä eri näköseks messengeriin sopivammaks" · 17:49:01 "preview puuttuu
//   pokli uploadista": vahvistuspalkissa pikkukuva (objectURL, vapautetaan kun palkki sulkeutuu) + Messengerin kortin näköinen palkki.
// Reactin solmuihin ei kosketa muuten: palkki lisätään .km-inp-divin ENNEN-sisaruksena, arvo asetetaan native-setterillä + input-tapahtumalla.
(() => {
  if (window.__kuplaKuvaliite) return;

  const VERSIO = '0.2.0';
  const SEL = '.kupla-messenger .km-inp > input';
  const MAX_TAVU = 10 * 1024 * 1024;
  const MIME = new Map([
    ['image/png', 'image/png'],
    ['image/jpeg', 'image/jpeg'],
    ['image/gif', 'image/gif'],
    ['image/webp', 'image/webp'],
  ]);
  const PAATE = new Map([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp'],
  ]);

  let palkki = null;      // avoin div.kmk-bar
  let ajastin = null;     // virhepalkin 4 s sulkeminen
  let kiireinen = false;  // lataus kesken

  if (!document.getElementById('kmk-tyyli')) {
    const st = document.createElement('style');
    st.id = 'kmk-tyyli';
    st.textContent =
      '.kmk-bar{display:flex;align-items:center;gap:10px;margin:0 10px 6px;padding:6px 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:#d5dde6;font-size:12px}' +
      '.kmk-bar .kmk-pikku{flex:0 0 auto;width:48px;height:48px;border-radius:5px;object-fit:cover;background:rgba(0,0,0,.25)}' +
      '.kmk-bar .kmk-txt{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;line-height:15px}' +
      '.kmk-bar .kmk-txt small{display:block;opacity:.65}' +
      '.kmk-bar .kmk-nappi{font:inherit;color:#fff;background:#0d6efd;border:0;border-radius:5px;padding:3px 10px;cursor:pointer}' +
      '.kmk-bar .kmk-nappi.kmk-toissij{background:rgba(255,255,255,.12)}';
    document.head.appendChild(st);
  }

  function kuvaMime(f) {
    if (MIME.has(f.type)) return MIME.get(f.type);
    const m = /\.([a-z0-9]+)$/i.exec(f.name || '');
    return m ? (PAATE.get(m[1].toLowerCase()) || null) : null;
  }

  function tekstiSpan(t) {
    const s = document.createElement('span');
    s.className = 'kmk-txt';
    s.textContent = t;
    return s;
  }

  function nappi(t) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kmk-nappi';
    b.textContent = t;
    return b;
  }

  let pikkuUrl = null;
  function poistaPalkki() {
    if (ajastin) { clearTimeout(ajastin); ajastin = null; }
    if (palkki) { palkki.remove(); palkki = null; }
    if (pikkuUrl) { URL.revokeObjectURL(pikkuUrl); pikkuUrl = null; }
  }

  function avaaPalkki(kmInp, sisalto) {
    poistaPalkki();
    const bar = document.createElement('div');
    bar.className = 'kmk-bar';
    bar.append(...sisalto);
    kmInp.parentNode.insertBefore(bar, kmInp);
    palkki = bar;
    return bar;
  }

  function virhePalkkiin(bar, teksti) {
    if (palkki !== bar) return;
    if (ajastin) { clearTimeout(ajastin); ajastin = null; }
    bar.replaceChildren(tekstiSpan(teksti));
    ajastin = setTimeout(poistaPalkki, 4000);
  }

  // Sama kuin clientin getKuplaChatImageUrl (chatImages.ts:104-129).
  function ok(raw) {
    let u;
    try { u = new URL(String(raw)); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return null;
    const h = u.hostname.toLowerCase();
    const p = u.pathname;
    let sallittu = false;
    if (h === location.hostname.toLowerCase() || h === 'kupla.cc' || h.endsWith('.kupla.cc') || h.endsWith('.workers.dev')) {
      sallittu = /^\/i\/[a-f0-9]{32}\.(?:png|jpe?g|gif|webp)$/i.test(p);
    } else if (h === 'hokk.us') {
      sallittu = /^\/gallery\/[A-Za-z0-9]{1,16}\/[0-9]{1,3}\.(?:png|jpe?g|gif|webp)$/i.test(p);
    } else if (h === 'gachi.gay') {
      sallittu = /^\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp)$/i.test(p);
    }
    return sallittu ? u.href : null;
  }

  // Sama sopimus kuin clientin uploadChatImage (chatImages.ts:146-202).
  async function lataaKuva(file) {
    const mime = kuvaMime(file);
    if (!mime) throw new Error('Käytä PNG-, JPG-, GIF- tai WebP-kuvaa.');
    if (file.size === 0) throw new Error('Kuvatiedosto on tyhjä.');
    if (file.size > MAX_TAVU) throw new Error('Kuvan pitää olla enintään 10 Mt.');

    let s = null;
    try { s = JSON.parse(localStorage.getItem('darkui.daybreak.session.v1')); } catch (e) { s = null; }
    s = s || {};
    if (!s.ssoTicket && !s.rememberToken) throw new Error('Kirjaudu sisään ennen kuvan lataamista.');

    const headers = {
      'X-Requested-With': 'DarkUI',
      Accept: 'application/json',
      'Content-Type': mime,
      'X-Image-Size': String(file.size),
    };
    if (s.ssoTicket) headers.Authorization = 'Bearer ' + s.ssoTicket;
    if (s.rememberToken) headers['X-DarkUI-Remember-Token'] = s.rememberToken;
    if (s.userId) headers['X-DarkUI-User-Id'] = String(s.userId);

    const ac = new AbortController();
    const aika = setTimeout(() => ac.abort(), 120000);
    let res;
    let data = null;
    try {
      res = await fetch(location.origin + '/api/chat-images/upload', {
        method: 'POST',
        headers,
        body: file,
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: ac.signal,
      });
      data = await res.json().catch(() => null);
    } finally {
      clearTimeout(aika);
    }
    if (!res.ok) {
      throw new Error((data && typeof data.error === 'string' && data.error) || `Lataus epäonnistui (${res.status}).`);
    }
    const url = ok(data && data.url);
    if (!url) throw new Error('Kuvalataus palautti virheellisen kuvaviitteen.');
    return url;
  }

  // Liittää URL kenttään. Yli maxLength -> heittää, arvoa ei muuteta.
  function lisaa(kentta, url) {
    const vanha = kentta.value.trimEnd();
    const uusi = vanha + (vanha ? ' ' : '') + url;
    if (kentta.maxLength > 0 && uusi.length > kentta.maxLength) {
      throw new Error('Viesti on liian pitkä kuvalinkille.');
    }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(kentta, uusi);
    kentta.dispatchEvent(new Event('input', { bubbles: true }));
    kentta.focus();
  }

  function naytaVahvistus(kmInp, input, file) {
    const kt = Math.max(1, Math.round(file.size / 1024));
    const teksti = tekstiSpan('Lataa kuva?');
    const pieni = document.createElement('small'); pieni.textContent = `${file.name}, ${kt} kt`; teksti.appendChild(pieni);
    const lataaN = nappi('Lataa');
    const peruN = nappi('Peru'); peruN.classList.add('kmk-toissij');
    const kuva = document.createElement('img'); kuva.className = 'kmk-pikku'; kuva.alt = '';
    const bar = avaaPalkki(kmInp, [kuva, teksti, lataaN, peruN]);
    try { pikkuUrl = URL.createObjectURL(file); kuva.src = pikkuUrl; } catch (e) { kuva.remove(); }
    peruN.addEventListener('click', () => {
      if (!kiireinen && palkki === bar) poistaPalkki();
    });
    lataaN.addEventListener('click', async () => {
      if (kiireinen || palkki !== bar) return;
      kiireinen = true;
      teksti.textContent = 'Ladataan…';
      lataaN.remove();
      peruN.remove();
      try {
        const url = await lataaKuva(file);
        lisaa(input, url);
        if (palkki === bar) poistaPalkki();
      } catch (e) {
        virhePalkkiin(bar, (e && e.message) || String(e));
      } finally {
        kiireinen = false;
      }
    });
  }

  function onPaste(ev) {
    const t = ev.target;
    if (!t || !t.matches || !t.matches(SEL)) return;
    const kuvat = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter((f) => kuvaMime(f));
    if (kuvat.length === 0) return;
    ev.preventDefault();
    if (kiireinen) return;
    const kmInp = t.parentElement;
    if (kuvat.length > 1) {
      virhePalkkiin(avaaPalkki(kmInp, []), 'Vain yksi kuva kerrallaan.');
      return;
    }
    naytaVahvistus(kmInp, t, kuvat[0]);
  }

  function onKey(ev) {
    if (ev.key !== 'Escape' || !palkki || kiireinen) return;
    const t = ev.target;
    if (t && t.matches && t.matches(SEL)) poistaPalkki();
  }

  function pois() {
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('keydown', onKey, true);
    poistaPalkki();
    const st = document.getElementById('kmk-tyyli');
    if (st) st.remove();
    delete window.__kuplaKuvaliite;
  }

  document.addEventListener('paste', onPaste, true);
  document.addEventListener('keydown', onKey, true);

  window.__kuplaKuvaliite = { versio: VERSIO, pois, lataa: lataaKuva, lisaa, ok };
})();
