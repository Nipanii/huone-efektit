// Kupla :furnibeta / :chooserbeta (versio 0.2.0): DarkUI:n uuden :furni / :chooser -ikkunan (PR, ChooserWidgetView.tsx, CHOOSER_STYLE 'dark' = variantti B)
//   kopio pelkällä DOM:illa, koska skriptissä ei ole Reactia. Kokeiltavissa ennen PR:ää: kirjoita chattiin :furnibeta tai :chooserbeta
//   (samaan tapaan kuin :furni / :chooser). Uusi kirjoitus kun ikkuna on auki sulkee sen; X sulkee myös. Mitään ei muisteta uudelleenlatauksen yli.
// kp 2026-11-03 17:52 "komento näky kaikille ja ei tehny mitää kiitos vaa. moottorin kautta piti jakaa" · 18:16 "ei pitäny olla mitää
//   käyttäjäryhmiä vaa komento vaa mitä voi käyttää :furni ja :chooser tilalla jos haluu kokeilla beta versioo.... miks niin monimutkaista".
// LATAUS: huoneet.json "kaikki"-lista (moottori 0.6.2+, ajaKaikki): jokaiselle pelaajalle jokaisessa huoneessa, kerran; huoneen vaihto ei pysäytä;
//   uudelleenkäynnistys vain kun haettu koodi muuttuu; moottorin pysäytys/päivitys kutsuu palautettua pois()-funktiota. Moottori ajaa tämän
//   new Function('kupla', koodi):lla, joten tiedoston loppu palauttaa pois():n.
// KEVYT JA HILJAINEN KUNNES KOMENTO: käynnistyessä vain yksi keydown-kuuntelija (capture, ennen peliä, kuten kayttajaskriptit.js:n :<optin>-kaappaus).
//   Ei ikkunaa, ei ajastinta, ei tyyliä, ei hakua. Ikkuna, 500 ms lista-kysely ja tyyli syntyvät vasta komennolla ja poistuvat sulkiessa.
// KAAPPAUS: Enter chat-kentässä (input.nitro-chat-input-control) kun rivi on täsmälleen :furnibeta tai :chooserbeta -> preventDefault +
//   stopImmediatePropagation + kenttä tyhjäksi, rivi ei lähde palvelimelle. (Pelin kirjoitusindikaattoripaketit, 6 B alku ja loppu, lähtevät silti.)
// TEKSTIT: vain React-version varatekstit (suomi, samat kuin hotellin ExternalTexts), ei latausta. Julistenimi (wall poster*) näyttää
//   huoneolion raakatyypin, ei hotellin poster_N_name -tekstiä.
// DATA: window.NitroDevTools.roomEngine (getRoomObjects 10/20/100, model 'furniture_*', _sessionDataManager, _roomSessionManager). Pelin sisäinen
//   UI_EVENT_DISPATCHER ei ole saatavilla -> lista päivitetään 500 ms kyselyllä (lisäys/poisto kuten React-hookin tapahtumat).
// HOHTO: WiredSelectionFilter on bundlen sisäinen. Suodatin rakennetaan uudelleen: Filter ja GlProgram otetaan huoneen renderöintipuun jo olemassa
//   olevasta suodatinoliosta (useRoom.ts asettaa jokaiselle huoneelle NitroAdjustmentFilterin), shader = Nitro_Render_V3/.../WiredFilter.ts.
//   Jos suodatinta ei löydy, hohto jätetään pois mutta valinta toimii.
// RAJA: SelectFurnitureFromChooser (valintakiellon ohitus huonemainoksille) on bundlen sisäinen -> kiellettyä furnia ei voi valita tästä.
return (() => {
  'use strict';
  const W = window;
  const TUNNISTE = '__kuplaFurniBeta';
  try { if (W[TUNNISTE] && typeof W[TUNNISTE].pois === 'function') W[TUNNISTE].pois(); } catch (e) {}   // vanha instanssi pois (kuumapäivitys)
  const FLOOR = 10, WALL = 20, UNIT = 100;
  const re = () => W.NitroDevTools && W.NitroDevTools.roomEngine;
  const roomId = () => { try { const r = re().activeRoomId; return typeof r === 'number' ? r : -1; } catch (e) { return -1; } };
  const sdm = () => { try { return re()._sessionDataManager; } catch (e) { return null; } };
  const isMod = () => { try { return !!sdm().isModerator; } catch (e) { return false; } };
  const mv = (o, k) => { try { return o.model.getValue(k); } catch (e) { return undefined; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- tekstit: React-version varatekstit (localizeWithFallback ilman hotellin tekstejä); %nimi% korvataan ----
  const lokalisoi = (avain, varateksti, p) => { let t = varateksti; if (p) for (const k in p) t = t.split('%' + k + '%').join(p[k]); return t; };

  // ---- datan rakennus (React: useFurniChooserWidget / useUserChooserWidget) ----
  const mk = (id, category, name, ownerId, ownerName, userType, userTypeId) => ({ id, category, name, ownerId: ownerId || 0, ownerName: ownerName || '', userType, userTypeId });
  const buildWall = (o) => {
    if (o.id < 0) return null;
    let name = o.type;
    { const d = sdm().getWallItemData(mv(o, 'furniture_type_id')); if (d && d.name && d.name.length) name = d.name; }
    return mk(o.id, WALL, name, mv(o, 'furniture_owner_id') || 0, mv(o, 'furniture_owner_name') || '');
  };
  const buildFloor = (o) => {
    if (o.id < 0) return null;
    let name = o.type;
    const d = sdm().getFloorItemData(mv(o, 'furniture_type_id')); if (d && d.name && d.name.length) name = d.name;
    return mk(o.id, FLOOR, name, mv(o, 'furniture_owner_id') || 0, mv(o, 'furniture_owner_name') || '');
  };
  const userTyyppi = (t) => (t === 1 ? 'Habbo' : t === 2 ? 'Pet' : (t === 3 || t === 4) ? 'Bot' : 'Unknown');   // RoomObjectType.USER/PET/BOT/RENTABLE_BOT
  const buildUser = (idx) => {
    if (idx < 0) return null;
    let d = null; try { const s = re()._roomSessionManager.getSession(roomId()); d = s && s.userDataManager && s.userDataManager.getUserDataByIndex(idx); } catch (e) {}
    return d ? mk(d.roomIndex, UNIT, d.name, 0, '-', userTyyppi(d.type), d.type) : null;
  };
  const nimiJarjestys = (a, b) => ((a.name < b.name) ? -1 : 1);   // sama (epäjohdonmukainen) vertailija kuin Reactissa -> sama järjestys
  const avain = (it) => it.category + '_' + it.id;
  const objekteja = (cat) => { try { return re().getRoomObjects(roomId(), cat) || []; } catch (e) { return []; } };

  // ---- hohto (vihreä wired-valinta) ----
  let suodatin = null, glowTila = 'ei-vielä';
  const luoSuodatin = () => {
    if (suodatin) return suodatin;
    try {
      const E = re(), cv = E.getRoomInstanceRenderingCanvas(roomId(), 1), juuri = cv && (cv.master || cv._master);
      let esim = null;
      const kavele = (o, d) => { if (esim || !o || d > 9) return; if (o.filters && o.filters.length && o.filters[0].glProgram) esim = o.filters[0]; for (const c of (o.children || [])) kavele(c, d + 1); };
      kavele(juuri, 0);
      if (!esim) { glowTila = 'ei-suodatinta'; return null; }
      const GlProgram = esim.glProgram.constructor;
      let p = Object.getPrototypeOf(esim), Filter = null;
      while (p && p !== Object.prototype) { if (Object.getOwnPropertyNames(p.constructor).includes('defaultOptions') && Object.getOwnPropertyNames(p).includes('apply')) { Filter = p.constructor; break; } p = Object.getPrototypeOf(p); }
      if (!Filter || typeof GlProgram.from !== 'function') { glowTila = 'ei-luokkaa'; return null; }
      const glProgram = GlProgram.from({
        vertex: 'in vec2 aPosition;\nout vec2 vTextureCoord;\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n' +
          'vec4 filterVertexPosition( void ){ vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy; position.x = position.x * (2.0 / uOutputTexture.x) - 1.0; position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z; return vec4(position, 0.0, 1.0); }\n' +
          'vec2 filterTextureCoord( void ){ return aPosition * (uOutputFrame.zw * uInputSize.zw); }\nvoid main(void){ gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }',
        fragment: 'in vec2 vTextureCoord;\nout vec4 finalColor;\nuniform sampler2D uTexture;\nuniform vec3 uLineColor;\nuniform vec3 uColor;\n' +
          'void main(void) { vec4 currentColor = texture(uTexture, vTextureCoord); vec3 colorLine = uLineColor; vec3 colorOverlay = uColor;\n' +
          'if(currentColor.r == 0.0 && currentColor.g == 0.0 && currentColor.b == 0.0 && currentColor.a > 0.0) { finalColor = vec4(colorLine.r, colorLine.g, colorLine.b, currentColor.a); }\n' +
          'else if(currentColor.a > 0.0) { vec3 blendedOverlay = mix(currentColor.rgb, colorOverlay, 0.28); finalColor = vec4(blendedOverlay.r, blendedOverlay.g, blendedOverlay.b, currentColor.a); } }',
        name: 'fbeta-wired-filter'
      });
      const f = new Filter({ gpuProgram: null, glProgram, resources: { planeMaskUniforms: { uLineColor: { value: new Float32Array(3), type: 'vec3<f32>' }, uColor: { value: new Float32Array(3), type: 'vec3<f32>' } } } });
      const u = f.resources.planeMaskUniforms.uniforms;
      u.uLineColor.set([0.45, 0.95, 0.55]); u.uColor.set([0.18, 0.78, 0.3]);   // WiredSelectionVisualizer._selectionShader (Kuplan vihreä)
      glowTila = 'ok'; return (suodatin = f);
    } catch (e) { glowTila = 'virhe: ' + e; return null; }
  };
  const hohda = (paalle, it) => {
    if (!it) return;
    try {
      const f = paalle ? luoSuodatin() : suodatin; if (!f) return;
      const o = re().getRoomObject(roomId(), it.id, it.category), vis = o && o.visualization; if (!vis || !vis.sprites) return;
      for (const sp of vis.sprites) {
        if (paalle) { if (sp.blendMode === 'add') continue; const fl = sp.filters || []; if (fl.includes(f)) continue; sp.filters = [...fl, f]; sp.increaseUpdateCounter(); }
        else { if (!sp.filters) continue; if (sp.filters.indexOf(f) < 0) continue; sp.filters = sp.filters.filter((v) => v !== f); sp.increaseUpdateCounter(); }
      }
    } catch (e) {}
  };
  const valitse = (it) => { try { re().selectRoomObject(roomId(), it.id, it.category); } catch (e) { console.warn('[furnibeta] valinta', e); } };
  // ---- CSS (React: ChooserWidgetView.scss, jaettu rakenne + &.chooser-style-dark; $black #000, $white #fff, $muted #B6BEC5) ----
  const TYYLI_ID = 'fbeta-tyyli';
  const CSS = `
.fbeta-win{width:400px;min-width:400px;max-width:400px;height:380px;min-height:380px;resize:vertical;display:flex;flex-direction:column}
.fbeta-win.fbeta-furni{width:410px;min-width:410px;max-width:410px}
.fbeta-win .content-area{display:flex;flex-direction:column;flex:1;padding:8px;font-family:Ubuntu,system-ui,sans-serif;font-size:13.2px;font-weight:400;line-height:1.2222}
.fbeta-win .furni-search-container{display:flex;gap:8px;flex-shrink:0}
.fbeta-win .furni-search-container .search-input-container{flex:1}
.fbeta-win .furni-search-container .owner-select-container{width:120px}
.fbeta-win .furni-search-container .form-control{display:block;width:100%;min-height:0;height:auto;padding:4px 8px;font-family:inherit;font-size:12px;font-weight:400;line-height:1.5;color:#000;background-color:#fff;background-image:none;background-clip:padding-box;border:1px solid #ced4da;border-radius:4px;box-shadow:inset 0 0 0 2px #ffffff1a;appearance:auto!important;transition:none}
.fbeta-win .furni-search-container .form-control:focus{color:#000;background-color:#fff;border-color:#8fb9ca;outline:0;box-shadow:inset 0 0 0 2px #ffffff1a,0 0 0 0 #1e729540}
.fbeta-win .furni-search-container .form-control::placeholder{color:#6c757d;opacity:1}
.fbeta-win .furni-search-container select.form-control{line-height:1.2222}
.fbeta-win .table-container{flex:1;min-height:200px;overflow-y:auto;background-color:#fff;border-radius:4px;border:1px solid #dee2e6;display:flex;flex-direction:column}
.fbeta-win .furni-table{width:100%;table-layout:fixed;border-collapse:collapse;margin:0;color:#000}
.fbeta-win .furni-table th,.fbeta-win .furni-table td{padding:4px 8px;font-size:12px;text-align:left;line-height:1.2222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fbeta-win .furni-table thead th{position:sticky;top:0;background-color:#fff;z-index:1;border-bottom:1px solid #ced4da;height:24px;font-weight:700}
.fbeta-win .furni-table td span{line-height:inherit}
.fbeta-win .furni-table tr{cursor:pointer}
.fbeta-win .furni-table tr:hover{background-color:#ececec}
.fbeta-win .furni-table tr.selected{background-color:#b8e2fc!important}
.fbeta-win .furni-table .name-column{width:180px;max-width:180px}
.fbeta-win .furni-table .owner-column{width:90px;max-width:90px}
.fbeta-win .furni-table tbody tr.row-even{background-color:#f9f9f9}
.fbeta-win .furni-table tbody tr.row-odd{background-color:#eaeaea}
.fbeta-win.fbeta-furni .furni-table .name-column{width:160px;max-width:160px}
.fbeta-win.fbeta-furni .furni-table .owner-column,.fbeta-win.fbeta-furni .furni-table .id-column{width:110px;max-width:110px}
.fbeta-win.fbeta-furni .furni-table tbody tr.child-row.child-even{background-color:#f9f9f9cc}
.fbeta-win.fbeta-furni .furni-table tbody tr.child-row.child-odd{background-color:#eaeaeacc}
.fbeta-win.fbeta-furni .furni-table tbody tr.child-row:hover{background-color:#e0e0e0}
.fbeta-win.fbeta-furni .furni-table .group-row{font-weight:500}
.fbeta-win.fbeta-furni .furni-table .group-row .toggle-icon{display:inline-block;vertical-align:top;margin-left:6px;margin-top:4px;width:6px;height:7px;background:#6c757d;clip-path:polygon(0 0,100% 50%,0 100%)}
.fbeta-win.fbeta-furni .furni-table .group-row .toggle-icon.open{margin-top:4.5px;width:7px;height:6px;clip-path:polygon(0 0,100% 0,50% 100%)}
.fbeta-win.fbeta-furni .furni-table .child-row .child-name{padding-left:16px}
.fbeta-win.fbeta-furni .furni-table .child-row .child-name::before{content:"\\2514  ";color:#adb5bd}
.fbeta-win .furni-footer{font-size:12px;display:flex;align-items:center;flex-shrink:0}
.fbeta-win .furni-footer div{font-size:12px;color:#6c757d!important}
.fbeta-win ::-webkit-scrollbar{width:.5rem}
.fbeta-win ::-webkit-scrollbar-track:not(:horizontal){border-right:.25rem solid rgba(0,0,0,.1)}
.fbeta-win ::-webkit-scrollbar-thumb:not(:horizontal){border-right:.25rem solid rgba(30,114,149,.4)}
.fbeta-win ::-webkit-scrollbar-thumb:not(:horizontal):hover{border-right:.25rem solid rgba(30,114,149,.8)}
.fbeta-win ::-webkit-scrollbar-thumb:not(:horizontal):active{border-right:.25rem solid #185d79}
.fbeta-win .table-container{border:1px solid transparent;color:#000}
.fbeta-win .furni-table thead th{background:#fff;border-bottom:1px solid rgba(0,0,0,.15)}
.fbeta-win .furni-table tbody tr.row-even,.fbeta-win .furni-table tbody tr.child-row.child-even{background:rgba(0,0,0,.024)}
.fbeta-win .furni-table tbody tr.row-odd,.fbeta-win .furni-table tbody tr.child-row.child-odd{background:rgba(0,0,0,.082)}
.fbeta-win .furni-table tbody tr:hover,.fbeta-win .furni-table tbody tr.child-row:hover{background:rgba(0,0,0,.12)}
.fbeta-win .furni-table tbody tr.selected,.fbeta-win .furni-table tbody tr.child-row.selected{background-color:#B6BEC5!important}
`;

  // ---- ikkuna (sama DOM kuin NitroCardView theme="primary-slim" + NitroCardHeaderView + NitroCardContentView renderöi) ----
  const SVG_X = '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" class="fa-icon w-12 h-12" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"></path></svg>';
  // ================= yksi ikkuna (TYYPPI 'furni' tai 'user') =================
  const luo = (TYYPPI, suljettu) => {
  // ---- tila ----
  let items = [], huone = roomId(), valittu = null, haku = '', omistaja = '', tyyppi = '';
  const laajennetut = new Set();
  let kuollut = false;
  let raahausPura = null, styleEl = null, wrap = null, card = null, tbody = null, footer = null, ownerSel = null, searchInp = null, titleEl = null, tauko = null;
  const otsikko = () => lokalisoi(TYYPPI === 'furni' ? 'widget.chooser.furni.title' : 'widget.chooser.user.title', TYYPPI === 'furni' ? 'Tavarat' : 'Käyttäjät');

  const rakennaIkkuna = () => {
    styleEl = document.getElementById(TYYLI_ID);
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = TYYLI_ID; styleEl.textContent = CSS; document.head.appendChild(styleEl); }
    wrap = document.createElement('div');
    wrap.className = 'position-absolute draggable-window fbeta-wrap';
    wrap.dataset.fbeta = TYYPPI;
    const furni = TYYPPI === 'furni';
    wrap.innerHTML =
      '<div class="d-flex flex-column overflow-hidden position-relative nitro-card rounded animate__animated animate__fadeIn theme-primary-slim fbeta-win ' + (furni ? 'fbeta-furni' : 'fbeta-user') + '">' +
        '<div class="d-flex flex-column gap-2 align-items-center justify-content-center position-relative drag-handler container-fluid nitro-card-header">' +
          '<div class="d-flex w-100"><span class="nitro-card-header-text"></span>' +
          '<button type="button" aria-label="Sulje ikkuna" class="d-flex align-items-center justify-content-center position-absolute end-2 nitro-card-header-close">' + SVG_X + '</button></div></div>' +
        '<div class="d-flex flex-column gap-2 overflow-hidden container-fluid content-area">' +
          '<div class="furni-search-container"><div class="search-input-container"><input type="text" class="form-control"></div>' +
          '<div class="owner-select-container"><select class="form-control"></select></div></div>' +
          '<div class="table-container bg-white rounded"><table class="furni-table"><colgroup></colgroup><thead><tr></tr></thead><tbody></tbody></table></div>' +
          '<div class="furni-footer"><div class="d-inline text-black nitro-default-size-text"></div></div>' +
        '</div></div>';
    card = wrap.firstChild; titleEl = card.querySelector('.nitro-card-header-text'); tbody = card.querySelector('tbody');
    footer = card.querySelector('.furni-footer div'); ownerSel = card.querySelector('select'); searchInp = card.querySelector('input');
    const host = document.getElementById('draggable-windows-container') || document.body;
    host.appendChild(wrap);
    // keskitys (DraggableWindowPosition.CENTER) + näkyviin (.draggable-window on oletuksena visibility:hidden)
    wrap.style.top = 'calc(50vh - ' + (wrap.offsetHeight / 2) + 'px)'; wrap.style.left = 'calc(50vw - ' + (wrap.offsetWidth / 2) + 'px)'; wrap.style.visibility = 'visible';
    korkeimmalle();
    wrap.addEventListener('mousedown', korkeimmalle, true); wrap.addEventListener('touchstart', korkeimmalle, true);
    card.querySelector('.nitro-card-header-close').addEventListener('mousedown', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    card.querySelector('.nitro-card-header-close').addEventListener('click', sulje);
    // raahaus (DraggableWindow: transform translate, otsikko pysyy näkyvissä)
    const kahva = card.querySelector('.drag-handler'); let ox = 0, oy = 0, sx = 0, sy = 0, raahaa = false;
    const rajaa = (x, y) => { const r = wrap.getBoundingClientRect(), dx = x - ox, dy = y - oy, l = r.left + dx, t = r.top + dy; return { x: x + (l + r.width < 48 ? 48 - (l + r.width) : l > innerWidth - 48 ? innerWidth - 48 - l : 0), y: y + (t < 0 ? -t : t > innerHeight - 28 ? innerHeight - 28 - t : 0) }; };
    const liiku = (cx, cy) => { if (!raahaa) return; const b = rajaa(ox + cx - sx, oy + cy - sy); wrap.style.transform = 'translate(' + b.x + 'px, ' + b.y + 'px)'; wrap._off = b; };
    const mm = (e) => liiku(e.clientX, e.clientY), tm = (e) => liiku(e.touches[0].clientX, e.touches[0].clientY);
    const loppu = () => { if (!raahaa) return; raahaa = false; if (wrap._off) { ox = wrap._off.x; oy = wrap._off.y; } document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', loppu); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', loppu); };
    kahva.addEventListener('mousedown', (e) => { sx = e.clientX; sy = e.clientY; raahaa = true; document.addEventListener('mousemove', mm); document.addEventListener('mouseup', loppu); });
    kahva.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; raahaa = true; document.addEventListener('touchmove', tm); document.addEventListener('touchend', loppu); });
    raahausPura = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', loppu); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', loppu); };
    searchInp.addEventListener('input', () => { haku = searchInp.value; piirraRivit(); });
    ownerSel.addEventListener('change', () => { if (furni) omistaja = ownerSel.value; else tyyppi = ownerSel.value; piirraRivit(); });
    tbody.addEventListener('click', klikkaus);
  };
  const korkeimmalle = () => { let z = 400; for (const w of document.querySelectorAll('.draggable-window')) if (w !== wrap) z = Math.max(z, (parseInt(w.style.zIndex, 10) || 0)); wrap.style.zIndex = String(z + 1); };

  // ---- suodatus / ryhmittely (React: groups, totalItems, filteredItems) ----
  const ryhmat = () => {
    const q = haku.toLocaleLowerCase(), NIMETON = lokalisoi('widget.chooser.furni.name.unknown', 'Nimetön');
    let f = items.filter((it) => (it.name && it.name.toLocaleLowerCase().includes(q)) || (it.id != null && it.id.toString().includes(q)));
    if (omistaja) f = f.filter((it) => it.ownerName === omistaja);
    const map = {}, jarj = [];
    for (const it of f) {
      const name = it.name || NIMETON, owner = it.ownerName || DEFAULT_OWNER, k = name + '_' + owner;
      if (map[k]) map[k].ids.push(it.id); else { map[k] = { key: k, name, ownerName: owner, ids: [it.id], firstItem: it }; jarj.push(map[k]); }
    }
    return { groups: jarj.sort((a, b) => (a.ids[0] - b.ids[0])), NIMETON };
  };
  const kayttajat = () => {
    const q = haku.toLocaleLowerCase();
    let f = items.filter((it) => (it.name && it.name.toLocaleLowerCase().includes(q)) || (it.id != null && it.id.toString().includes(q)));
    if (tyyppi) f = f.filter((it) => it.userTypeId === parseInt(tyyppi));
    return f.sort((a, b) => (a.id - b.id));
  };
  const userTypeName = (t) => t === 1 ? lokalisoi('wiredfurni.params.usertype.1', 'Habbo') : t === 2 ? lokalisoi('wiredfurni.params.usertype.2', 'Lemmikki') : t === 3 ? lokalisoi('new_user_chooser.usertype.3', 'Legacy-botti') : t === 4 ? lokalisoi('wiredfurni.params.usertype.4', 'Botti') : lokalisoi('widget.chooser.user.type.unknown', 'Tuntematon');
  const piirraValinnat = () => {   // omistaja-/tyyppivalikon vaihtoehdot
    let opts, cur;
    if (TYYPPI === 'furni') { opts = [...new Set(items.map((i) => i.ownerName).filter(Boolean))].sort().map((o) => [o, o]); cur = omistaja; opts.unshift(['', lokalisoi('new_furni_chooser.owner_selector.default', 'Kaikki omistajat')]); }
    else { opts = [...new Set(items.map((i) => i.userTypeId))].filter((t) => t !== undefined).sort().map((t) => [String(t), userTypeName(t)]); cur = tyyppi; opts.unshift(['', lokalisoi('new_user_chooser.usertype.all', 'Kaikki tyypit')]); }
    const sig = JSON.stringify(opts) + '|' + cur;
    if (ownerSel._sig === sig) return; ownerSel._sig = sig;
    ownerSel.innerHTML = opts.map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + '</option>').join(''); ownerSel.value = cur;
  };
  const piirraRivit = () => {
    if (kuollut) return;
    const mod = isMod();
    if (TYYPPI === 'furni') {
      const { groups, NIMETON } = ryhmat(), total = groups.reduce((n, g) => n + g.ids.length, 0);
      let h = '';
      groups.forEach((g, i) => {
        const multi = g.ids.length > 1, exp = laajennetut.has(g.key), sel = valittu && valittu === g.firstItem;
        h += '<tr class="group-row ' + (i % 2 === 0 ? 'row-even' : 'row-odd') + (sel ? ' selected' : '') + '" data-g="' + i + '"><td title="' + esc(g.name) + '" class="name-column">' +
          (multi ? '<span>' + esc(g.name) + ' (x' + g.ids.length + ')<span class="toggle-icon' + (exp ? ' open' : '') + '"></span></span>' : esc(g.name)) + '</td><td title="' + esc(g.ownerName) + '" class="owner-column">' + esc(g.ownerName) + '</td>' +
          (mod ? '<td title="' + g.ids[0] + '" class="id-column">' + g.ids[0] + '</td>' : '') + '</tr>';
        if (multi && exp) {
          items.filter((it) => g.ids.includes(it.id) && ((it.name || NIMETON) === g.name) && ((it.ownerName || DEFAULT_OWNER) === g.ownerName)).sort((a, b) => (a.id - b.id)).forEach((it, ci) => {
            h += '<tr class="child-row ' + (ci % 2 === 0 ? 'child-even' : 'child-odd') + (valittu === it ? ' selected' : '') + '" data-c="' + avain(it) + '"><td title="' + esc(it.name || NIMETON) + '" class="child-name name-column">' + esc(it.name || NIMETON) + '</td><td title="' + esc(it.ownerName || DEFAULT_OWNER) + '" class="owner-column">' + esc(it.ownerName || DEFAULT_OWNER) + '</td>' + (mod ? '<td title="' + it.id + '" class="id-column">' + it.id + '</td>' : '') + '</tr>';
          });
        }
      });
      tbody.innerHTML = h; tbody._groups = groups;
      const itemsText = total === 1 ? lokalisoi('widget.chooser.furni.count.one', '1 tavara') : lokalisoi('widget.chooser.furni.count', total + ' tavaraa', { amount: String(total) });
      const groupsText = groups.length === 1 ? lokalisoi('widget.chooser.furni.groups.one', '1 ryhmä') : lokalisoi('widget.chooser.furni.groups', groups.length + ' ryhmää', { amount: String(groups.length) });
      footer.textContent = itemsText + ', ' + groupsText;
    } else {
      const f = kayttajat();
      tbody.innerHTML = f.map((it, i) => '<tr class="' + (i % 2 === 0 ? 'row-even' : 'row-odd') + (valittu === it ? ' selected' : '') + '" data-u="' + it.id + '"><td title="' + esc(it.name) + '" class="name-column">' + esc(it.name) + (mod ? ' (' + it.id + ')' : '') + '</td><td title="' + esc(userTypeName(it.userTypeId)) + '" class="owner-column">' + esc(userTypeName(it.userTypeId)) + '</td></tr>').join('');
      tbody._users = f;
      footer.textContent = f.length === 1 ? lokalisoi('widget.chooser.user.found.one', '1 käyttäjä') : lokalisoi('widget.chooser.user.found', f.length + ' käyttäjää', { amount: String(f.length) });
    }
    piirraValinnat();
  };
  const piirraKehys = () => {
    titleEl.textContent = otsikko(); searchInp.placeholder = lokalisoi('generic.search', 'Etsi');
    const nimi = lokalisoi('new_furni_chooser.col.name', 'Nimi'), mod = isMod();
    const cg = card.querySelector('colgroup'), tr = card.querySelector('thead tr');
    if (TYYPPI === 'furni') {
      cg.innerHTML = '<col style="width:160px"><col style="width:110px">' + (mod ? '<col style="width:110px">' : '');
      tr.innerHTML = '<th class="name-column">' + esc(nimi) + '</th><th class="owner-column">' + esc(lokalisoi('new_furni_chooser.col.owner', 'Omistaja')) + '</th>' + (mod ? '<th class="id-column">' + esc(lokalisoi('new_furni_chooser.col.id', 'Tunniste')) + '</th>' : '');
    } else {
      cg.innerHTML = '<col style="width:180px"><col style="width:90px">';
      tr.innerHTML = '<th class="name-column">' + esc(nimi) + '</th><th class="owner-column">' + esc(lokalisoi('new_user_chooser.col.type', 'Tyyppi')) + '</th>';
    }
    ownerSel._sig = null;
  };

  // ---- valinta (React: chooseItem + useEffect) ----
  const valitseRivi = (it) => {
    if (valittu) hohda(false, valittu);
    valittu = it;
    if (TYYPPI === 'furni') hohda(true, it);
    valitse(it);
    piirraRivit();
  };
  const klikkaus = (e) => {
    const tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
    if (tr.dataset.c !== undefined) { const it = items.find((x) => avain(x) === tr.dataset.c); if (it) valitseRivi(it); return; }
    if (tr.dataset.u !== undefined) { const it = items.find((x) => String(x.id) === tr.dataset.u); if (it) valitseRivi(it); return; }
    if (tr.dataset.g !== undefined) {
      const g = tbody._groups && tbody._groups[+tr.dataset.g]; if (!g) return;
      if (g.ids.length > 1) { if (laajennetut.has(g.key)) laajennetut.delete(g.key); else laajennetut.add(g.key); piirraRivit(); }
      else valitseRivi(g.firstItem);
    }
  };

  // ---- lista huoneesta + päivitys kyselyllä ----
  const koko = () => {
    if (TYYPPI === 'furni') return [...objekteja(WALL).map(buildWall).filter(Boolean), ...objekteja(FLOOR).map(buildFloor).filter(Boolean)].sort(nimiJarjestys);
    return objekteja(UNIT).map((o) => buildUser(o.id)).filter(Boolean).sort(nimiJarjestys);
  };
  const paivitaLista = () => {
    if (kuollut) return;
    const r = roomId();
    if (r !== huone) {   // huone vaihtui: vanha valinta/hohto on mennyt
      huone = r; valittu = null; laajennetut.clear(); items = koko(); piirraRivit(); return;
    }
    // lisäykset ja poistot (React: FURNI_ADDED/REMOVED, USER_ADDED/REMOVED)
    let muuttui = false;
    const nyt = TYYPPI === 'furni' ? [...objekteja(WALL).map((o) => [WALL, o]), ...objekteja(FLOOR).map((o) => [FLOOR, o])] : objekteja(UNIT).map((o) => [UNIT, o]);
    const elossa = new Set(nyt.filter(([, o]) => o.id >= 0).map(([c, o]) => c + '_' + o.id));
    const ennen = items.length;
    items = items.filter((it) => elossa.has(avain(it)));
    if (items.length !== ennen) { muuttui = true; if (valittu && !elossa.has(avain(valittu))) valittu = null; }
    const tunnetut = new Set(items.map(avain));
    for (const [c, o] of nyt) {
      if (o.id < 0 || tunnetut.has(c + '_' + o.id)) continue;
      const it = c === WALL ? buildWall(o) : c === FLOOR ? buildFloor(o) : buildUser(o.id);
      if (it) { items = [...items, it].sort(nimiJarjestys); tunnetut.add(avain(it)); muuttui = true; }
    }
    if (muuttui) piirraRivit();
  };

  // ---- pois(): kaikki takaisin (komento, X, moottorin pysäytys/päivitys) ----
  const pois = () => {
    if (kuollut) return; kuollut = true;
    clearInterval(tauko);
    if (valittu) hohda(false, valittu);
    valittu = null;
    try { if (raahausPura) raahausPura(); } catch (e) {}
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = card = tbody = footer = ownerSel = searchInp = titleEl = null;
    if (!document.querySelector('.fbeta-wrap')) { const st = document.getElementById(TYYLI_ID); if (st && st.parentNode) st.parentNode.removeChild(st); }
  };
  const sulje = () => { pois(); suljettu(); };   // X: sama kuin toinen komento
  const tila = () => ({ rivit: items.length, valittu: valittu && { id: valittu.id, category: valittu.category }, haku, omistaja, tyyppi, huone, glow: glowTila });

  rakennaIkkuna(); piirraKehys(); items = koko(); piirraRivit();
  tauko = setInterval(() => { try { paivitaLista(); } catch (e) { console.warn('[furnibeta]', e); } }, 500);
  return { pois, tila };
  };

  // ================= komennot (Enter-kaappaus) =================
  const KOMENNOT = { furnibeta: 'furni', chooserbeta: 'user' };
  const auki = {};
  const KENTTA = 'input.nitro-chat-input-control';
  const kuule = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'NumpadEnter') return;
    const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.matches(KENTTA)) return;
    const m = (el.value || '').trim().match(/^:(furnibeta|chooserbeta)$/i); if (!m) return;
    const tyyppi = KOMENNOT[m[1].toLowerCase()];
    ev.preventDefault(); ev.stopImmediatePropagation();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
    if (auki[tyyppi]) { const i = auki[tyyppi]; delete auki[tyyppi]; i.pois(); }
    else { try { auki[tyyppi] = luo(tyyppi, () => { delete auki[tyyppi]; }); } catch (e) { console.warn('[furnibeta] avaus kaatui', e); } }
  };
  addEventListener('keydown', kuule, true);
  const pois = () => { removeEventListener('keydown', kuule, true); for (const t of Object.keys(auki)) { try { auki[t].pois(); } catch (e) {} delete auki[t]; } try { delete W[TUNNISTE]; } catch (e) {} };
  W[TUNNISTE] = { versio: '0.2.0', pois, auki: () => Object.keys(auki), tila: (t) => auki[t] && auki[t].tila() };
  return pois;
})();
