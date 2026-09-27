/* =====================================================================
 * 状態管理
 * ---------------------------------------------------------------------
 * - 入力値は localStorage に自動保存（オフライン・再起動後も復元）
 * - 居室(room)は1つ。開口(opening)は複数持て、居室に属する開口をすべて
 *   合算して判定する（開口1＝窓1つ。同じ窓を増やす場合は開口を追加する）
 * - 建物（ツーバイフォー）は階ごとに天井高さ（2400/2600mm）を選べる
 * - 機能モジュール（採光／換気／排煙）の登録表。換気・排煙は今後ここに追加する
 * ===================================================================== */
(function (LC) {
  'use strict';

  const KEY = 'lc.state.v4';

  LC.modules = [
    { id: 'daylight',    label: '採光', enabled: true },
    { id: 'ventilation', label: '換気', enabled: true },
    { id: 'smoke',       label: '排煙', enabled: true }
  ];

  /* ツーバイフォーの階高・軒高・天井高さのプリセット(mm)。階ごとに選べる。
   * 「天井高2,400mm：階高2,747/2,798mm・軒高+2,643mm」「天井高2,600mm：階高2,947/2,998mm・軒高+2,843mm」 */
  LC.presets = {
    fl1: 550,
    groups: {
      c2400: { id: 'c2400', ceiling: 2400, label: '天井高 2,400mm', storeyOptions: [2747, 2798], eaveOff: 2643 },
      c2600: { id: 'c2600', ceiling: 2600, label: '天井高 2,600mm', storeyOptions: [2947, 2998], eaveOff: 2843 }
    }
  };
  LC.group = key => LC.presets.groups[key] || LC.presets.groups.c2400;

  let seq = 1;
  const newId = p => `${p}${Date.now().toString(36)}${seq++}`;

  function defaultFloor() {
    const g = LC.presets.groups.c2400;
    return { ceilingGroup: g.id, h: g.storeyOptions[0] };
  }
  function defaultBuilding() {
    return { storeys: 2, fl1: LC.presets.fl1, floors: [defaultFloor(), defaultFloor(), defaultFloor()] };
  }

  function defaultRoom() {
    return { name: '居室', area: 10, dimX: null, dimY: null, zone: 'residential', ratioKey: '1/7', ventRatioKey: '1/20', smokeRatioKey: '1/50' };
  }

  function defaultOpening(name, winTypeId) {
    const t = LC.windows.find(winTypeId || 'haridashi');
    return {
      id: newId('op'), name: name || '開口1',
      floor: 1,                                        // 窓のある階
      winType: t.id, w: t.w, h: t.h,                    // 窓の種類・幅・高さ（開口1つ＝窓1つ）
      headFL: 2000,                                     // 窓上端（その階のFLから）基本 FL+2000
      boundaryType: 'neighbor', distance: 2000,         // 外壁面から境界まで(mm)
      eaveOut: 600, roofPitch: 0,                        // 軒の出 / 屋根勾配(寸)
      canopyOn: false, canopyTip: 2300, canopyOut: 900   // 庇・下屋（任意。先端高さは窓の階のFLから）
    };
  }
  /* 旧バージョン（呼称5桁の code / ovW / ovH 方式）からの寸法復元用 */
  function legacySize(code) {
    const s = String(code == null ? '' : code).trim();
    if (!/^\d{5}$/.test(s)) return null;
    return { w: parseInt(s.slice(0, 3), 10) * 10, h: parseInt(s.slice(3), 10) * 100 };
  }

  function defaults() {
    const op = defaultOpening('開口1');
    return {
      v: 4,
      mode: 'daylight',
      bld: defaultBuilding(),
      room: defaultRoom(),
      openings: [op],
      active: op.id,
      settings: { cautionPct: 10 }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      if (!s || s.v !== 4 || !Array.isArray(s.openings) || !s.openings.length) return defaults();
      const base = defaults();
      if (!LC.modules.some(m => m.id === s.mode && m.enabled)) s.mode = 'daylight';
      s.bld = Object.assign(base.bld, s.bld);
      if (!Array.isArray(s.bld.floors) || s.bld.floors.length < 3) s.bld.floors = base.bld.floors;
      s.bld.floors = s.bld.floors.map(f => Object.assign(defaultFloor(), f));
      s.room = Object.assign(base.room, s.room);
      s.settings = Object.assign(base.settings, s.settings);
      s.openings = s.openings.map(o => {
        const merged = Object.assign(defaultOpening(null, o.winType), o);
        /* 呼称サイズ方式（旧版）で保存されたデータの寸法を復元する */
        if (!(Number(merged.w) > 0) || !(Number(merged.h) > 0)) {
          const t = LC.windows.find(merged.winType) || LC.windows.find('haridashi');
          const legacy = legacySize(o.code);
          merged.w = (Number(o.ovW) > 0 ? o.ovW : null) || (legacy && legacy.w) || t.w;
          merged.h = (Number(o.ovH) > 0 ? o.ovH : null) || (legacy && legacy.h) || t.h;
        }
        delete merged.code; delete merged.ovW; delete merged.ovH;
        return merged;
      });
      if (!s.openings.some(o => o.id === s.active)) s.active = s.openings[0].id;
      return s;
    } catch (e) { return defaults(); }
  }

  let timer = null;
  function save(state) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 容量超過などは無視 */ }
    }, 250);
  }

  LC.store = { load, save, defaults, defaultOpening, KEY };
})(window.LC = window.LC || {});
