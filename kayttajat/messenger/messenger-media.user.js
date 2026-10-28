// ==UserScript==
// @name         kupla: Messenger: ääni, kuvat, linkit ja kopiointi
// @namespace    kupla
// @version      0.1.6
// @description  Messengerin viesteihin: [voice:..] -toistonappi, kuvalinkeistä esikatselu (vain kuplan omat kuvapalvelut), toimivat linkit ja tekstin valinta + Kopioi-nappi.
// @match        https://kupla.cc/*
// @grant        none
// @run-at       document-idle
// @kupla-oletus on
// @kupla-ryhma  Testattavat
// ==/UserScript==
// B130 + I143 (kp 2026-10-28 11:27). Toimii sekä livekientin Messengerissä (.km-txt, React) että userscript-Messengerissä (#km2, tavallinen DOM).
// Syyt: (1) index.scss:18 html,body{user-select:none} -> .km-txt perii none -> valinta/kopiointi mahdotonta.
//   (2) MessengerThreadPane.tsx:184 / MessengerChannelPane.tsx:191 antavat vain linkifyText(text); [voice:] ja kuvat jäävät raakatekstiksi
//       (ääni/kuva renderöidään vain huonechatissa). (3) userscriptit/kupla-messenger piirtää viestin el(..).textContent:lla = ei linkkejä lainkaan.
// React-turva: mikään Reactin omistama solmu ei siirry eikä poistu (messenger-numero 0.1.0 -> NotFoundError). Lisäys on AINA yksi
//   .kmm-add-span .km-txt:n LOPPUUN; Reactin tekstiä ei kosketa (paitsi #km2:ssa, jossa ei ole Reactia).
// 0.1.5 kp 2026-10-28 14:13 "emojeiden käyttöä pitäs välttää koska device kohtasta miltä näyttää": äänisoiton ▶ ja ⏸ SVG-maskeina
//   (IKONIT, currentColor), ei unicode-glyfejä. Kuuntele-aria-label ja toiminta ennallaan; "…" latauksessa ja "Kopioi"-teksti ennallaan.
// 0.1.6 kp 2026-10-28 17:40-17:49 "samanlailla edellee ku live chat embed" · "puuttuu live chatin click upotus to expand" · 17:49:52 "Hide for me.
//   käytetään vaan tekstiä hide": kuvan esikatselu = live chatin KuplaFixChatImagePreview.tsx: sumennettu + Reveal image -> klikkaus suurentaa
//   (Esc/klikkaus sulkee) + hide (localStorage kuplafix.chatImagePreviews.hidden, sama avain kuin live chatissa, 250 viimeisintä).
//   Kuvasääntö = live chatin getChatImageUrls (chatImages.ts:57-88): mikä tahansa https-kuva paitsi youtube/tiktok. Klipy-gifit jätetään
//   pois kuten live chatissa (sen isSafeKlipyGifUrl ei ole luettu; tässä hostin nimi sisältää "klipy" = ARVIO).
(() => {
  if (window.__kuplaMessengerMedia) return; window.__kuplaMessengerMedia = true;
  const DEF = 'https://kuplafix-voice-worker.kuplafix.workers.dev/upload';
  const base = () => {
    let u = DEF;
    try { const r = localStorage.getItem('kuplafix.voiceMessageUploadUrl'); if (r) { try { u = JSON.parse(r); } catch (_) { u = r; } } } catch (_) {}
    if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) u = DEF;
    return u.replace(/\/upload.*$/i, '').replace(/\/$/, '');
  };
  const voiceUrl = p => {
    p = (p || '').trim(); let m;
    if ((m = p.match(/^(?:ref\||id\||id:|token:)(.+)$/))) return base() + '/v/' + m[1].trim();
    if ((m = p.match(/^url:(https?:\/\/.+)$/i))) return m[1].trim();
    if (/^https?:\/\//i.test(p)) return p;
    return null;
  };
  // = live chatin getChatImageUrls (chatImages.ts:57-88). Ennen 0.1.6 vain kuplan omat kuvapalvelut.
  const kuvaOk = u => {
    try {
      const x = new URL(u); const h = x.hostname.toLowerCase();
      if (x.protocol !== 'https:') return false;
      if (h.includes('klipy')) return false;
      if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be') return false;
      if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return false;
      return /.(?:png|jpe?g|gif|webp)$/i.test(x.pathname);
    } catch (_) { return false; }
  };
  const PIILO = 'kuplafix.chatImagePreviews.hidden';
  const piilossa = u => { try { const a = JSON.parse(localStorage.getItem(PIILO) || '[]'); return Array.isArray(a) && a.includes(u); } catch (_) { return false; } };
  const piilota = (u, on) => { try { const a = JSON.parse(localStorage.getItem(PIILO) || '[]'); const s = new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : []);
    if (on) s.add(u); else s.delete(u); localStorage.setItem(PIILO, JSON.stringify([...s].slice(-250))); } catch (_) {} };
  const suurenna = u => {
    const d = document.createElement('div'); d.className = 'kmm-suuri'; d.setAttribute('role', 'dialog');
    const im = document.createElement('img'); im.src = u; im.alt = ''; im.referrerPolicy = 'no-referrer'; d.appendChild(im);
    const kiinni = () => { d.remove(); document.removeEventListener('keydown', esc, true); };
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); kiinni(); } };
    d.addEventListener('click', e => { e.stopPropagation(); kiinni(); });
    for (const k of ['mousedown', 'mouseup', 'pointerdown', 'wheel']) d.addEventListener(k, e => e.stopPropagation());
    document.addEventListener('keydown', esc, true); document.body.appendChild(d);
  };
  const esikatselu = u => {
    const w = document.createElement('span'); w.className = 'kmm-kuvalaatikko';
    const pys = e => { e.stopPropagation(); e.preventDefault(); };
    const piirra = () => {
      w.replaceChildren();
      if (piilossa(u)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'kmm-kuva-nayta'; b.textContent = 'show';
        b.addEventListener('click', e => { pys(e); piilota(u, false); piirra(); }); w.appendChild(b); return;
      }
      const box = document.createElement('span'); box.className = 'kmm-esik';
      const im = document.createElement('img'); im.src = u; im.alt = 'kuva'; im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
      im.onerror = () => { const s = document.createElement('span'); s.className = 'kmm-kuva-nayta'; s.textContent = 'Image preview unavailable'; w.replaceChildren(s); };
      const rev = document.createElement('button'); rev.type = 'button'; rev.className = 'kmm-esik-rev'; rev.textContent = 'Reveal image';
      rev.addEventListener('click', e => { pys(e); box.classList.add('auki'); rev.remove();
        const h = document.createElement('button'); h.type = 'button'; h.className = 'kmm-esik-hide'; h.textContent = 'hide';
        h.addEventListener('click', e2 => { pys(e2); piilota(u, true); piirra(); }); box.appendChild(h); });
      im.addEventListener('click', e => { if (!box.classList.contains('auki')) return; pys(e); suurenna(u); });
      box.append(im, rev); w.appendChild(box);
    };
    piirra(); return w;
  };
  // 0.1.5: ▶ ja ⏸ SVG-maskina (kp 14:13). viewBox 16, stroke 2, väri = currentColor.
  const IKONIT = { play: '<path d="M5 3l8 5-8 5z" fill="#000" stroke="none"/>', pause: '<path d="M5 3v10M11 3v10"/>' };
  const maski = k => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IKONIT[k] + '</svg>') + '")';
  const ikoni = k => { const sp = document.createElement('span'); sp.className = 'kmm-ik kmm-ik-' + k; return sp; };
  if (!document.getElementById('kmm-tyyli')) {
    const s = document.createElement('style'); s.id = 'kmm-tyyli';
    // 0.1.4 kp 14:03 "saisko sit siniset linkit" + "linkin kanssa mallia live chatista": huonechatin ChatWidgetView.scss:78 .message a {color:$blue} = #0d6efd.
    s.textContent = '.km-txt,.km-txt *,#km2 .km-txt,#km2 .km-txt *{-webkit-user-select:text!important;user-select:text!important}' +
      '.km-txt a.km-link,#km2 .km-txt a.km-link{color:#0d6efd!important;text-decoration:underline;cursor:pointer}' +
      '.km-txt{position:relative}.kmm-add{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;vertical-align:middle;margin-left:6px;font-size:12px}' +
      // 0.1.6 = KuplaFixChatImagePreview.scss (live chat)
      '.kmm-kuvalaatikko{display:block;width:100%}.kmm-esik{position:relative;display:block;width:min(240px,100%);height:150px;margin-top:5px;overflow:hidden;border:1px solid rgba(255,255,255,.24);border-radius:5px;background:rgba(0,0,0,.2)}' +
      '.kmm-esik img{display:block;width:100%;height:100%;object-fit:contain;filter:blur(14px);transform:scale(1.04);transition:filter .16s ease,transform .16s ease}' +
      '.kmm-esik.auki img{filter:none;transform:none;cursor:zoom-in}' +
      '.kmm-esik-rev,.kmm-esik-hide{position:absolute;z-index:1;border:1px solid rgba(255,255,255,.55);border-radius:4px;color:#fff;background:rgba(0,0,0,.72);font:inherit;cursor:pointer}' +
      '.kmm-esik-rev{inset:0;width:100%;font-weight:600}.kmm-esik-hide{top:5px;right:5px;padding:2px 6px;font-size:11px}' +
      '.kmm-kuva-nayta{display:inline-block;margin-top:5px;padding:3px 7px;border:0;border-radius:4px;color:inherit;background:rgba(0,0,0,.2);font:inherit;font-size:12px;cursor:pointer}' +
      '.kmm-suuri{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);cursor:zoom-out}' +
      '.kmm-suuri img{max-width:95vw;max-height:95vh;object-fit:contain;box-shadow:0 0 24px #000}' +
      '.kmm-add .kmm-kopioi{opacity:0;cursor:pointer;border:0;border-radius:4px;padding:0 5px;font-size:11px;line-height:16px;background:rgba(255,255,255,.14);color:inherit}' +
      '.km-txt:hover .kmm-kopioi,.kmm-kopioi:focus{opacity:1}.kmm-kopioi::before{content:attr(data-l)}' +
      // Omissa viesteissä nappi pois tekstivirrasta (kp 28.10. 12:30 "kopioi nappi estää tekstiä menemästä oikeelle"): vasemmalle tekstistä,
      // tai pitkässä viestissä yläkulmaan (data-kmm-yla, ks. mouseover alla). visibility eikä opacity: piilotettu nappi ei saa ottaa klikkejä.
      '.km-m.is-own .kmm-add .kmm-kopioi{position:absolute;top:0;right:100%;margin-right:6px;white-space:nowrap;visibility:hidden;background:#30363f;z-index:2}' +
      '.km-m.is-own .km-txt[data-kmm-yla] .kmm-kopioi{top:auto;bottom:100%;right:0;margin:0 0 1px}' +
      '.km-m.is-own .km-txt:hover .kmm-kopioi,.km-m.is-own .kmm-kopioi:focus{visibility:visible}' +
      '.km-txt[data-kmm-rivi] .kmm-kopioi{visibility:visible!important;opacity:1}' +
      '.km-m.is-own .kmm-add:has(> .kmm-kopioi:only-child){margin-left:0}' +
      '.km-txt.kmm-vainaani{font-size:0}.km-txt.kmm-vainaani .kmm-add{font-size:12px;margin-left:0}' +
      '.kmm-ik{display:inline-block;width:14px;height:14px;vertical-align:-2px;background-color:currentColor;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}' +
      '.kmm-ik-play{-webkit-mask-image:' + maski('play') + ';mask-image:' + maski('play') + '}' +
      '.kmm-ik-pause{-webkit-mask-image:' + maski('pause') + ';mask-image:' + maski('pause') + '}';
    document.head.appendChild(s);
  }
  const kopioi = async t => {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (_) {
      try { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;left:-999px'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; }
      catch (e) { return false; }
    }
  };
  const chip = url => {
    const w = document.createElement('span'); w.className = 'kuplafix-voice-chip kmm-chip';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'kuplafix-voice-play'; b.replaceChildren(ikoni('play')); b.setAttribute('aria-label', 'Kuuntele ääniviesti');
    const st = document.createElement('span'); st.className = 'kuplafix-voice-status';
    w.appendChild(b); w.appendChild(st);
    let audio = null, obj = null, busy = false;
    b.addEventListener('click', async ev => {
      ev.stopPropagation(); ev.preventDefault(); if (busy) return;
      if (audio) { if (audio.paused) { if (audio.ended) audio.currentTime = 0; audio.play().catch(() => { st.textContent = '!'; }); } else audio.pause(); return; }
      busy = true; b.textContent = '…'; st.textContent = '';
      try {
        let blob = null, err;
        for (const d of [0, 250, 500, 1000]) {
          if (d) await new Promise(r => setTimeout(r, d));
          try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); blob = await r.blob(); break; } catch (e) { err = e; }
        }
        if (!blob) throw err;
        obj = URL.createObjectURL(blob); audio = new Audio(obj);
        audio.onplay = () => { b.replaceChildren(ikoni('pause')); }; audio.onpause = () => { b.replaceChildren(ikoni('play')); };
        audio.onended = () => { b.replaceChildren(ikoni('play')); audio.currentTime = 0; };
        audio.onerror = () => { b.replaceChildren(ikoni('play')); st.textContent = '!'; };
        await audio.play();
      } catch (e) { st.textContent = '!'; b.replaceChildren(ikoni('play')); audio = null; if (obj) URL.revokeObjectURL(obj); obj = null; }
      finally { busy = false; }
    });
    return w;
  };
  const ownText = el => {
    let t = '';
    (function k(n) { for (const c of n.childNodes) { if (c.nodeType === 3) t += c.nodeValue; else if (c.nodeType === 1 && !c.classList.contains('kmm-add') && !c.classList.contains('km-mod')) k(c); } })(el);
    return t;
  };
  const URL_RE = /https?:\/\/[^\s<>"']+/gi, VOICE_RE = /\[voice:([^\]]+)\]/g;
  const siisti = u => u.replace(/[.,;:!?)\]}»]+$/, '');
  const kasittele = () => {
    for (const el of document.querySelectorAll('.km-txt')) {
      const t = ownText(el);
      const lisa = el.querySelector(':scope > .kmm-add');
      if (lisa && lisa.dataset.avain === t) continue;
      if (lisa) lisa.remove();
      const add = document.createElement('span'); add.className = 'kmm-add'; add.dataset.avain = t;
      const aanet = [...t.matchAll(VOICE_RE)];
      for (const m of aanet) { const u = voiceUrl(m[1]); if (u) add.appendChild(chip(u)); }
      const kuvat = [];
      for (const m of t.matchAll(URL_RE)) { const u = siisti(m[0]); if (kuvaOk(u) && !kuvat.includes(u)) kuvat.push(u); }
      for (const u of kuvat.slice(0, 3)) {
        add.appendChild(esikatselu(u));
      }
      if (t.trim()) {
        // Nimi CSS:n ::before-sisältönä, ei tekstisolmuna: muuten "Kopioi" tulee .km-txt:n innerTextiin (koko ketjun kopiointi, osoitus-overlay).
        const k = document.createElement('button'); k.type = 'button'; k.className = 'kmm-kopioi'; k.dataset.l = 'Kopioi'; k.title = 'Kopioi viesti leikepöydälle'; k.setAttribute('aria-label', 'Kopioi viesti');
        k.addEventListener('click', async ev => {
          ev.stopPropagation(); ev.preventDefault();
          const ok = await kopioi(t.replace(VOICE_RE, '').trim() || t.trim());
          k.dataset.l = ok ? 'Kopioitu' : 'Ei onnistunut'; setTimeout(() => { k.dataset.l = 'Kopioi'; }, 1500);
        });
        add.appendChild(k);
      }
      // #km2 (ei Reactia): linkitä raaka teksti. Livekientissä <a> tekee jo linkifyText.
      if (el.closest('#km2') && !el.querySelector('a') && el.childNodes.length === 1 && el.firstChild.nodeType === 3 && /https?:\/\//i.test(t)) {
        const frag = document.createDocumentFragment(); let last = 0;
        for (const m of t.matchAll(URL_RE)) {
          const u = siisti(m[0]);
          if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
          const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'km-link'; a.textContent = u;
          frag.appendChild(a); last = m.index + u.length;
        }
        if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
        el.textContent = ''; el.appendChild(frag);
      }
      el.appendChild(add);
      el.classList.toggle('kmm-vainaani', aanet.length > 0 && !t.replace(VOICE_RE, '').trim());
    }
  };
  // 0.1.4 kp 14:01 "linkki ei aukee klikkaamal": tämän kohdan document-tason capture-käsittelijä (preventDefault +
  //   stopImmediatePropagation + window.open) POISTETTU. Natiivi linkifyText (linkify.tsx:48) antaa jo <a target=_blank>, ja robon
  //   natiivissa clientissä elementFromPoint osui linkkiin joka rivillä (28.10. 14:05) = selaimen oma avaus toimii. Kaappaus on TODENNÄKÖISIN syy kp:n clientissä (9222 ei vastaa, ei mitattu siellä).
  // Oma viesti: mahtuuko Kopioi tekstin vasemmalle puolelle? Pitkä (täysleveä) viesti -> nappi yläkulmaan, muuten se leikkautuisi
  // .km-msgs:n overflow-x:hidden-reunaan (mitattu robolla 28.10.: täysleveän viestin nappi alkoi 26 px listan ulkopuolelta).
  const paikka = t => {
    const l = t.closest('.km-m.is-own') && (t.closest('.km-msgs') || t.closest('.km-m'));
    if (l) t.toggleAttribute('data-kmm-yla', t.getBoundingClientRect().left - l.getBoundingClientRect().left < 56);
  };
  // Kopioi näkyy koko viestirivin hoverilla, ei vain tekstin päällä (kp 28.10. ~13:00 "kopio nappi karkaa kuplan gapin ja kopio
  // tekstinapin väliin ... pitäs pysyä esillä jos hiiri on siinä rowilla"): hiiren rivi = .km-txt jonka päällä hiiri on, muuten
  // saman viestiryhmän (.km-m) pystysuunnassa lähin .km-txt. data-kmm-rivi näyttää sen napin (CSS ylhäällä).
  let rivi = null;
  const asetaRivi = t => {
    if (t === rivi) return;
    if (rivi) rivi.removeAttribute('data-kmm-rivi');
    rivi = t;
    if (t) { paikka(t); t.setAttribute('data-kmm-rivi', ''); }
  };
  document.addEventListener('mousemove', ev => {
    const e = ev.target && ev.target.closest ? ev.target : null;
    const suora = e && e.closest('.km-txt');
    if (suora) { asetaRivi(suora); return; }
    const m = e && e.closest('.km-m');
    if (!m) { asetaRivi(null); return; }
    let paras = null, d = Infinity;
    for (const t of m.querySelectorAll('.km-txt')) {
      const r = t.getBoundingClientRect(), y = ev.clientY;
      const etaisyys = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (etaisyys < d) { d = etaisyys; paras = t; }
    }
    asetaRivi(paras);
  }, true);
  let ajastettu = false;
  // setTimeout, ei requestAnimationFrame: rAF ei laukea piilossa olevassa välilehdessä (mitattu robolla 28.10., chat-historia-aani 0.1.0).
  const ajasta = () => { if (ajastettu) return; ajastettu = true; setTimeout(() => { ajastettu = false; try { kasittele(); } catch (e) { console.warn('[messenger-media]', e); } }, 50); };
  new MutationObserver(ajasta).observe(document.body, { childList: true, subtree: true, characterData: true });
  ajasta();
})();
