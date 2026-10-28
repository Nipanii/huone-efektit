// ==UserScript==
// @name         kupla: Messenger: ääni, kuvat, linkit ja kopiointi
// @namespace    kupla
// @version      0.1.5
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
  // sama sääntö kuin chatImages.ts getKuplaChatImageUrl: vain kuplan omat kuvapalvelut esikatsellaan automaattisesti (ei IP:n vuotoa vieraille)
  const kuvaOk = u => {
    try {
      const x = new URL(u); const h = x.hostname.toLowerCase();
      if (x.protocol !== 'https:' || x.username || x.password || x.port || x.search || x.hash) return false;
      if ((h === location.hostname.toLowerCase() || h.endsWith('.kupla.cc') || h.endsWith('.workers.dev')) && /^\/i\/[a-f0-9]{32}\.(?:png|jpe?g|gif|webp)$/i.test(x.pathname)) return true;
      if (h === 'hokk.us' && /^\/gallery\/[A-Za-z0-9]{1,16}\/[0-9]{1,3}\.(?:png|jpe?g|gif|webp)$/i.test(x.pathname)) return true;
      if (h === 'gachi.gay' && /^\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp)$/i.test(x.pathname)) return true;
    } catch (_) {}
    return false;
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
      '.kmm-add .kmm-kuva{display:block;max-width:220px;max-height:170px;border-radius:6px;cursor:zoom-in}' +
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
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'block';
        const im = document.createElement('img'); im.className = 'kmm-kuva'; im.src = u; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.alt = 'kuva';
        im.onerror = () => a.remove(); a.appendChild(im); add.appendChild(a);
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
