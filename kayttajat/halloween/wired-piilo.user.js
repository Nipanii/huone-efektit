// Wired-piilo — :wpiilo piilottaa huoneen wiredit VAIN omasta clientistäsi (toinen :wpiilo tuo ne takaisin).
// kp 2026-10-29 21:55-21:56: "tee halloween rata ryhmäläisille oma komento togglee wiredit vaikka on white listil" ·
//   "piilottaa vaan iteltä jos on whitelisted. ettei rendaa. muut whitelistil näkee. whitelistittömät ei näe." ·
//   "userscript ... moottorin kautta jakelet sitten meille."
// MIKSI: :hidewireds on palvelimen asetus koko huoneelle (Habbo-Daybreak RoomManager.java:1027 `isHideWired() && instanceof
//   InteractionWired` -> ei lähetetä). Whitelistatuille palvelin lähettää wiredit silti; tällä ne saa pois omasta näkymästä.
// MITEN: ei pakettia palvelimelle. Jokaiselle wired-objektille asetetaan mallin arvot furniture_alpha_multiplier=0 ja
//   furniture_wired_click_through=1 (Nitro FurnitureVisualization.updateModel lukee molemmat: alpha 0 = ei piirretä,
//   click-through = klikki menee läpi lattialle). Mitattu robolla 29.10. objektilla 438310: piirretyt spritet alpha 0,
//   alphaTolerance 256 (MATCH_NOTHING); palautus 1/0 -> alpha 255, tolerance 128. 500 ms välein uudet/uudelleen tulleet
//   wiredit (huoneen vaihto, uusi wired, :hidewireds-vaihto) saavat saman käsittelyn.
// KOMENTO: :wpiilo (myös :wiredpiilo). Siepataan ennen chattia: rekisteröityy Komennot-lisäosaan jos se on, muuten oma
//   Enter-sieppaus document-capturessa (sama tapa kuin komennot.user.js). Teksti ei lähde palvelimelle.
// TILA: localStorage 'wiredPiilo.<käyttäjä-id>' (tämä selain + tämä käyttäjä), säilyy sivun latauksen yli.
// RAJAT: wired tunnistetaan luokkanimestä (wf_trg_/act_/cnd_/cond_/xtra_/slc_/var_/cstm_/exe_/test_), EI palvelimen
//   interaction-tyypistä, jota client ei tiedä. Pelifurnit wf_arrowplate, wf_blob, wf_colortile, tokenit yms. jäävät näkyviin
//   (ne eivät ole InteractionWired eikä :hidewireds piilota niitä). wf_cstm_*/wf_exe_*/wf_test_*: oletettu wirediksi nimen
//   perusteella, EI todennettu. Jos huoneen wired-läpinäkyvyysefekti kirjoittaa click_throughin, se voi ohittaa tämän.
// Konsoli: wiredPiilo.tila() · .piiloon() · .nakyviin() · .vaihda() · .lopeta()
(() => {
  const W = window;
  if (W.wiredPiilo && W.wiredPiilo.lopeta) W.wiredPiilo.lopeta();
  const VERSIO = '1.0.0', NIMET = ['wpiilo', 'wiredpiilo'];
  const RE = () => W.NitroDevTools && W.NitroDevTools.roomEngine;
  const API = { versio: VERSIO, malli: /^wf_(trg|act|cnd|cond|xtra|slc|var|cstm|exe|test)_/i };

  const kayttaja = () => { try { const s = RE()._sessionDataManager; return s && s.userId; } catch (e) { return null; } };
  const avain = () => 'wiredPiilo.' + (kayttaja() || 'x');
  const lueTila = () => { try { return localStorage.getItem(avain()) === '1'; } catch (e) { return false; } };
  const tallenna = v => { try { localStorage.setItem(avain(), v ? '1' : '0'); } catch (e) {} };

  let piilossa = false, tilaLuettu = false, huone = null;
  const piilotetut = new Set();   // objektit, joille tämä skripti asetti alpha 0

  function wiredit(e, r) {
    const out = [];
    for (const kat of [10, 20]) for (const o of (e.getRoomObjects(r, kat) || [])) if (o && o.model && API.malli.test(o.type || '')) out.push(o);
    return out;
  }
  function piilota(o) {
    if (o.model.getValue('furniture_alpha_multiplier') !== 0) o.model.setValue('furniture_alpha_multiplier', 0);
    if (o.model.getValue('furniture_wired_click_through') !== 1) o.model.setValue('furniture_wired_click_through', 1);
    piilotetut.add(o);
  }
  function palauta() {
    for (const o of piilotetut) try { if (o.model) { o.model.setValue('furniture_alpha_multiplier', 1); o.model.setValue('furniture_wired_click_through', 0); } } catch (x) {}
    piilotetut.clear();
  }

  function tick() {
    const e = RE(); if (!e) return;
    if (!tilaLuettu && kayttaja()) { piilossa = lueTila(); tilaLuettu = true; }
    const r = e.activeRoomId;
    if (r !== huone) { piilotetut.clear(); huone = r; }
    if (!(r > 0) || !piilossa) return;
    for (const o of wiredit(e, r)) try { piilota(o); } catch (x) {}
  }

  function aseta(v) {
    piilossa = !!v; tilaLuettu = true; tallenna(piilossa);
    if (piilossa) tick(); else palauta();
    return piilossa ? 'Wiredit piilossa' : 'Wiredit näkyvissä';
  }

  // Oma pieni ilmoitus, kun Komennot-lisäosaa ei ole (sama tyyli: nitro-context-menu, ei ajatusviivoja: fontti piirtää nuotin).
  let laatikko = null, ajastin = 0;
  function ilmoita(t) {
    if (W.kuplaKomennot && W.kuplaKomennot.ilmoita) return W.kuplaKomennot.ilmoita(t);
    if (!laatikko || !laatikko.isConnected) {
      laatikko = document.createElement('div'); laatikko.className = 'nitro-context-menu';
      Object.assign(laatikko.style, { position: 'fixed', left: '50%', bottom: '64px', transform: 'translateX(-50%)', zIndex: 2147483646,
        padding: '5px 10px', fontSize: '12px', color: '#fff', pointerEvents: 'none', transition: 'opacity .3s' });
      document.body.appendChild(laatikko);
    }
    laatikko.textContent = t; laatikko.style.opacity = '1';
    clearTimeout(ajastin); ajastin = setTimeout(() => { if (laatikko) laatikko.style.opacity = '0'; }, 4000);
  }

  const komento = () => aseta(!piilossa);
  // Komennot-lisäosan jono (toimii latausjärjestyksestä riippumatta). Jos se on mukana, se sieppaa ja näyttää paluuarvon.
  (W.kuplaKomennotJono = W.kuplaKomennotJono || []).push([NIMET, () => (W.wiredPiilo ? W.wiredPiilo.vaihda() : 'Wired-piilo ei ole päällä'),'piilota/näytä wiredit vain itseltä', 'Wired-piilo']);
  const komennotHoitaa = n => { try { return !!(W.kuplaKomennot && W.kuplaKomennot.lista().some(k => k.nimet.includes(n))); } catch (e) { return false; } };

  function nappain(ev) {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    const t = ev.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    const m = /^\s*:(\S+)\s*$/.exec(t.value || ''); if (!m) return;
    const n = m[1].toLowerCase(); if (!NIMET.includes(n) || komennotHoitaa(n)) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    try { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set;
      setter.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { t.value = ''; }
    ilmoita(komento());
  }
  document.addEventListener('keydown', nappain, true);
  const vali = setInterval(tick, 500);
  tick();

  Object.assign(API, {
    tila: () => ({ versio: VERSIO, piilossa, huone, piilotettu: piilotetut.size, avain: avain() }),
    piiloon: () => aseta(true), nakyviin: () => aseta(false), vaihda: komento,
    lopeta: () => { clearInterval(vali); document.removeEventListener('keydown', nappain, true); palauta(); },
  });
  W.wiredPiilo = API;
  console.info('[wired-piilo] ' + VERSIO + ' ladattu, komento :wpiilo');
})();
