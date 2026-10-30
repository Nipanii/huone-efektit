// ==UserScript==
// @name         Sona Teleport
// @namespace    https://re-lab.local/kupla
// @match        https://kupla.cc/*
// @run-at       document-idle
// @grant        none
// @version      1.0.0
// @description  Ctrl+Alt+vasen klikkaus -teleport Sonalle moottorin kautta
// @author       re-lab
// ==/UserScript==

(() => {
  'use strict';

  const VERSIO = '1.0.0';

  // Jos aiempi instanssi on käynnissä, puretaan se ensin
  if (window.__kuplaSonaTeleport && typeof window.__kuplaSonaTeleport.pois === 'function') {
    try { window.__kuplaSonaTeleport.pois(); } catch (e) {}
  }

  const dv = (o, k) => {
    const d = o && Object.getOwnPropertyDescriptor(o, k);
    return d && !d.get ? d.value : undefined;
  };

  function getConn() {
    const T = window.NitroDevTools, RE = T && T.roomEngine;
    if (!RE) return null;
    const seen = new Set();
    let conn = null;
    const scan = (o, d) => {
      if (!o || conn || d > 4 || typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      if (Object.getOwnPropertyDescriptor(o, '_cryptoState')) { conn = o; return; }
      for (const k of Object.getOwnPropertyNames(o)) {
        const de = Object.getOwnPropertyDescriptor(o, k);
        if (de && !de.get && de.value && typeof de.value === 'object') scan(de.value, d + 1);
      }
    };
    scan(dv(RE, '_roomSessionManager'), 0);
    return conn;
  }

  function getOwn() {
    const T = window.NitroDevTools, RE = T && T.roomEngine;
    const room = dv(RE, '_activeRoomId');
    const rsm = dv(RE, '_roomSessionManager'), ss = rsm && dv(rsm, '_sessions');
    let own = null;
    if (ss instanceof Map) {
      for (const [, v] of ss) {
        const r = dv(v, '_roomId');
        if (r === room || own === null) own = dv(v, '_ownRoomIndex');
      }
    }
    return own;
  }

  function broaden() {
    const T = window.NitroDevTools, RE = T && T.roomEngine;
    const room = dv(RE, '_activeRoomId');
    const conn = getConn();
    if (!conn || room == null) return false;
    conn.sendRawPacket(7099, [1, 524287, room], 'sona-tp-broaden');
    return true;
  }

  function writeInternal(fieldName, value, skipBroaden, vid) {
    const conn = getConn();
    if (!conn) return { ok: false, e: 'no conn' };
    if (!skipBroaden) broaden();
    const useVid = (typeof vid === 'number') ? vid : getOwn();
    conn.sendRawPacket(7016, [1, useVid, 'internal:1:@' + fieldName, value, 0], 'sona-tp-write');
    return { ok: true, vid: useVid, fieldName, value };
  }

  function tpReitti(ox, oy, x, y) {
    const T = window.NitroDevTools, RE = T && T.roomEngine, room = dv(RE, '_activeRoomId');
    const sm = RE && RE.getFurnitureStackingHeightMap(room);
    const ok = (a, b) => !!sm && a >= 0 && b >= 0 && a < sm.width && b < sm.height && sm.getTileHeight(a, b) < 60;
    if (!ok(x, y)) return null;
    const W = sm.width, key = (a, b) => b * W + a, prev = new Map([[key(ox, oy), null]]), q = [[ox, oy]];
    while (q.length) {
      const [cx, cy] = q.shift();
      if (cx === x && cy === y) break;
      const nb = [];
      for (let a = 0; a < W; a++) nb.push([a, cy, 'x', a]);
      for (let b2 = 0; b2 < sm.height; b2++) nb.push([cx, b2, 'y', b2]);
      for (const [nx, ny, ak, v] of nb) {
        const k = key(nx, ny);
        if (prev.has(k) || !ok(nx, ny)) continue;
        prev.set(k, [cx, cy, ak, v]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(x, y))) return null;
    const steps = [];
    let c = [x, y];
    while (!(c[0] === ox && c[1] === oy)) {
      const pv = prev.get(key(c[0], c[1]));
      steps.unshift([pv[2], pv[3]]);
      c = [pv[0], pv[1]];
    }
    return steps;
  }

  let aktiivisetAjastimet = new Set();
  function turvallinenTimeout(fn, ms) {
    const id = setTimeout(() => {
      aktiivisetAjastimet.delete(id);
      fn();
    }, ms);
    aktiivisetAjastimet.add(id);
    return id;
  }

  function teleport(x, y, forceVid) {
    const useVid = (typeof forceVid === 'number') ? forceVid : getOwn();
    const T = window.NitroDevTools, RE = T && T.roomEngine;
    if (!RE) return;
    const room = dv(RE, '_activeRoomId');
    const o0 = RE.getRoomObjectUser(room, useVid), l0 = o0 && o0.getLocation && o0.getLocation();

    let reitti = l0 ? tpReitti(Math.round(l0.x), Math.round(l0.y), x, y) : null;
    let suora = !reitti, kaannetty = false;
    if (suora) reitti = [['x', x], ['y', y]];
    broaden();

    let i = 0;
    const seuraava = function() {
      if (i < reitti.length) {
        const [ak, v] = reitti[i++];
        writeInternal('position.' + ak, v, true, useVid);
        turvallinenTimeout(seuraava, 180);
        return;
      }
      turvallinenTimeout(function() {
        try {
          const o = RE.getRoomObjectUser(room, useVid);
          const l = o && o.getLocation && o.getLocation();
          const ok = l && Math.round(l.x) === x && Math.round(l.y) === y;
          if (!ok && suora && !kaannetty) {
            kaannetty = true;
            reitti = [['y', y], ['x', x]];
            i = 0;
            turvallinenTimeout(seuraava, 60);
          }
        } catch (e) {}
      }, 220);
    };
    turvallinenTimeout(seuraava, 60);
  }

  function teleportMulti(x, y) {
    const own = getOwn();
    if (own != null) teleport(x, y, own);
    return { ok: true };
  }

  let ctrlAltKlikki = 0;
  function onPointerDown(e) {
    ctrlAltKlikki = (e.ctrlKey && e.altKey && e.button === 0) ? Date.now() : 0;
  }

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('mousedown', onPointerDown, true);

  let viimeksiPatchedHandler = null;

  function asennaKääreet() {
    try {
      const T = window.NitroDevTools, RE = T && T.roomEngine;
      if (!RE) return;
      const h = RE.objectEventHandler;
      if (!h) return;

      viimeksiPatchedHandler = h;

      // 1. isPointerPassingThroughUnit
      if (!h.__sonaOrigPassThrough && typeof h.isPointerPassingThroughUnit === 'function') {
        h.__sonaOrigPassThrough = h.isPointerPassingThroughUnit;
      }
      const origPass = h.__sonaOrigPassThrough;
      if (typeof origPass === 'function') {
        h.isPointerPassingThroughUnit = function(object) {
          try {
            if (Date.now() - ctrlAltKlikki < 1500) {
              if (object) {
                const t = object.type;
                if (t === 'user' || t === 'bot' || t === 'rentable_bot') return true;
              }
            }
          } catch (e) {}
          return origPass.apply(this, arguments);
        };
      }

      // 2. sendWalkUpdate
      if (!h.__sonaOrigWalk && typeof h.sendWalkUpdate === 'function') {
        h.__sonaOrigWalk = h.sendWalkUpdate.bind(h);
      }
      const origWalk = h.__sonaOrigWalk;
      if (typeof origWalk === 'function') {
        h.sendWalkUpdate = function(x, y) {
          if (Date.now() - ctrlAltKlikki < 1500) {
            ctrlAltKlikki = 0;
            teleportMulti(x, y);
            return;
          }
          return origWalk(x, y);
        };
      }

      // 3. handleMoveTargetFurni
      if (!h.__sonaOrigMoveFurni && typeof h.handleMoveTargetFurni === 'function') {
        h.__sonaOrigMoveFurni = h.handleMoveTargetFurni;
      }
      const origMoveFurni = h.__sonaOrigMoveFurni;
      if (typeof origMoveFurni === 'function') {
        h.handleMoveTargetFurni = function(roomId, event) {
          try {
            if (Date.now() - ctrlAltKlikki < 1500) {
              const obj = RE.getRoomObject(roomId, event.objectId, 10);
              let p = null;
              try { p = this.getActiveSurfaceLocation(obj, event); } catch (e) {}
              if (!p) try { p = this.getRaisedSurfaceLocation(roomId, obj, event); } catch (e) {}
              if (!p && obj) p = obj.getLocation();
              if (p) {
                ctrlAltKlikki = 0;
                teleportMulti(Math.round(p.x), Math.round(p.y));
                return true;
              }
            }
          } catch (e) {}
          return origMoveFurni.apply(this, arguments);
        };
      }

      h.__sonaPatched = true;
    } catch (e) {}
  }

  function puraKääreet(h) {
    if (!h) return;
    try {
      if (h.__sonaOrigPassThrough) {
        h.isPointerPassingThroughUnit = h.__sonaOrigPassThrough;
        delete h.__sonaOrigPassThrough;
      }
      if (h.__sonaOrigWalk) {
        h.sendWalkUpdate = h.__sonaOrigWalk;
        delete h.__sonaOrigWalk;
      }
      if (h.__sonaOrigMoveFurni) {
        h.handleMoveTargetFurni = h.__sonaOrigMoveFurni;
        delete h.__sonaOrigMoveFurni;
      }
      delete h.__sonaPatched;
    } catch (e) {}
  }

  asennaKääreet();

  const vahtiVali = setInterval(() => {
    try {
      const T = window.NitroDevTools, RE = T && T.roomEngine;
      const h = RE && RE.objectEventHandler;
      if (h) {
        if (h !== viimeksiPatchedHandler && viimeksiPatchedHandler) {
          puraKääreet(viimeksiPatchedHandler);
        }
        if (!h.__sonaPatched) {
          asennaKääreet();
        }
      }
    } catch (e) {}
  }, 2000);

  function pois() {
    clearInterval(vahtiVali);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('mousedown', onPointerDown, true);

    for (const t of aktiivisetAjastimet) {
      clearTimeout(t);
    }
    aktiivisetAjastimet.clear();

    const T = window.NitroDevTools, RE = T && T.roomEngine;
    const h = RE && RE.objectEventHandler;
    if (h) puraKääreet(h);
    if (viimeksiPatchedHandler && viimeksiPatchedHandler !== h) {
      puraKääreet(viimeksiPatchedHandler);
    }

    if (window.__kuplaSonaTeleport && window.__kuplaSonaTeleport.pois === pois) {
      try { delete window.__kuplaSonaTeleport; } catch (e) { window.__kuplaSonaTeleport = undefined; }
    }
  }

  const API = {
    versio: VERSIO,
    pois: pois
  };

  window.__kuplaSonaTeleport = API;
})();
