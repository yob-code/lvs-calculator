/* =====================================================================
 * SVG 断面図（簡易）
 * ---------------------------------------------------------------------
 * 座標系：x = 外壁面からの水平距離(mm・境界側が＋)、y = 地盤面(GL)からの高さ(mm)
 * CAD の精密作図ではなく、入力条件の位置関係を確認するための図。
 * 入力値が変わるたびに丸ごと再生成する。
 * ドラッグできる部分（data-drag）：境界線 / 軒先 / 窓（上下）。
 * ドラッグ処理は app.js。ここでは変換に必要な値を <svg> の data-* に出す。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const C = {
    line: '#cfd8e3', wall: 'rgba(207,216,227,.16)', win: '#5ac8e6', bound: '#ff7d7d',
    dim: '#e8c66a', light: '#7fdc95', muted: '#7d8896', ground: '#8b8271', bg: '#12181f'
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mm = n => Math.round(n).toLocaleString('ja-JP');

  /* opts.lockXMax：ドラッグ中は横方向の表示範囲を固定（図が伸縮して指とずれるのを防ぐ） */
  function render(op, room, state, opts = {}) {
    const g = LC.calc.geometry(op, state);
    const lv = g.lv;
    const rw = g.rw;
    const D = Number(op.distance), FL = g.fl, sill = g.sill;
    const eaveH = lv.eaveH, out = Number(op.eaveOut) || 0;
    const pitch = (Number(op.roofPitch) || 0) / 10;
    const wh = rw ? rw.h : 0;

    if (![D, FL, sill, eaveH].every(isFinite)) {
      return `<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg"><text x="400" y="150" fill="${C.muted}" font-size="24" text-anchor="middle">数値を入力すると断面図が表示されます</text></svg>`;
    }

    const Bd = 3500;                                   // 表示用の建物奥行（実寸ではない）
    const tipH = eaveH - pitch * out;
    const roofLeft = eaveH + pitch * Bd;
    const canopy = op.canopyOn && isFinite(Number(op.canopyTip)) ? { tip: FL + Number(op.canopyTip), out: Number(op.canopyOut) || 0 } : null;

    const xMin = -(Bd + 1900);
    const xMax = opts.lockXMax || Math.max(7000, D + 1500, out + 1500);
    const yMin = -450;
    const yMax = Math.max(6500, roofLeft + 900, eaveH + 900);

    const W = 800, H = 560 + (lv.n - 1) * 70, pad = 20;
    const s = Math.min((W - 2 * pad) / (xMax - xMin), (H - 2 * pad) / (yMax - yMin));
    const X = x => pad + (x - xMin) * s;
    const Y = y => H - pad - (y - yMin) * s;

    const o = [];
    /* 文字は「背景色の縁取り」→「本体」の2枚重ねにする（paint-order に依存しない） */
    const T = (x, y, str, opt = {}) => {
      const { c = C.line, a = 'middle', z = 22, w = 500, rot } = opt;
      const tr = rot ? ` transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : '';
      const base = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${z}" font-weight="${w}" text-anchor="${a}"${tr}`;
      return `<text ${base} fill="${C.bg}" stroke="${C.bg}" stroke-width="6" stroke-linejoin="round" pointer-events="none">${esc(str)}</text>` +
             `<text ${base} fill="${c}" pointer-events="none">${esc(str)}</text>`;
    };
    const L = (x1, y1, x2, y2, c, w = 1.5, dash) =>
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" pointer-events="none"/>`;
    const dimH = (x1, x2, y, label, c, below) => {
      const a = X(x1), b = X(x2), yy = Y(y);
      return L(a, yy, b, yy, c, 1.6) + L(a, yy - 7, a, yy + 7, c, 1.6) + L(b, yy - 7, b, yy + 7, c, 1.6) +
        T((a + b) / 2, yy + (below ? 26 : -9), label, { c, z: 22, w: 600 });
    };
    const dimV = (x, y1, y2, label, c, side = -1) => {
      const xx = X(x), a = Y(y1), b = Y(y2);
      return L(xx, a, xx, b, c, 1.6) + L(xx - 7, a, xx + 7, a, c, 1.6) + L(xx - 7, b, xx + 7, b, c, 1.6) +
        T(xx + side * 12, (a + b) / 2, label, { c, z: 22, w: 600, rot: -90 });
    };

    /* --- 地盤 --- */
    o.push(`<defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="${C.ground}" stroke-width="1" opacity=".55"/></pattern></defs>`);
    o.push(`<rect x="${X(xMin)}" y="${Y(0)}" width="${X(xMax) - X(xMin)}" height="${Y(yMin) - Y(0)}" fill="url(#hatch)"/>`);
    o.push(L(X(xMin), Y(0), X(xMax), Y(0), C.ground, 2.5));
    o.push(T(X(xMin) + 6, Y(0) - 8, 'GL', { c: C.ground, a: 'start', z: 22, w: 700 }));

    /* --- 隣地 --- */
    const bt = LC.rules.daylight.boundaryTypes[op.boundaryType] || LC.rules.daylight.boundaryTypes.neighbor;
    o.push(`<rect x="${X(D)}" y="${Y(yMax)}" width="${Math.max(0, X(xMax) - X(D))}" height="${Y(0) - Y(yMax)}" fill="${C.bound}" opacity=".06" pointer-events="none"/>`);
    o.push(L(X(D), Y(yMax) + 4, X(D), Y(yMin), C.bound, 2.2, '10 7'));
    o.push(T(X(D) + 8, Y(yMax) + 30, bt.label, { c: C.bound, a: 'start', z: 22, w: 700 }));
    /* 境界線のラベルをダブルクリック／ダブルタップ → 境界の種類の欄にカーソルを合わせる */
    o.push(`<rect data-editboundary="1" x="${X(D) + 2}" y="${Y(yMax) + 10}" width="180" height="34" fill="transparent" style="cursor:pointer;touch-action:manipulation"/>`);

    /* --- 建物 --- */
    const fl1 = lv.fl[0];
    o.push(`<rect x="${X(-Bd)}" y="${Y(fl1)}" width="${X(0) - X(-Bd)}" height="${Y(0) - Y(fl1)}" fill="${C.wall}" stroke="${C.line}" stroke-width="1.5" pointer-events="none"/>`);
    o.push(`<polygon points="${X(-Bd)},${Y(fl1)} ${X(0)},${Y(fl1)} ${X(0)},${Y(eaveH)} ${X(-Bd)},${Y(roofLeft)}" fill="rgba(255,255,255,.035)" stroke="${C.line}" stroke-width="1.5" pointer-events="none"/>`);
    lv.fl.forEach((y, i) => {
      o.push(`<rect x="${X(-Bd)}" y="${Y(y)}" width="${X(0) - X(-Bd)}" height="${Math.max(3, 120 * s)}" fill="${C.line}" opacity=".55" pointer-events="none"/>`);
      o.push(T(X(-Bd) - 8, Y(y) + 6, `${i + 1}FL`, { c: i + 1 === g.floor ? C.win : C.muted, a: 'end', z: 20, w: 700 }));
    });
    o.push(`<rect x="${X(-150)}" y="${Y(eaveH)}" width="${150 * s}" height="${Y(fl1) - Y(eaveH)}" fill="${C.wall}" stroke="${C.line}" stroke-width="1.5" pointer-events="none"/>`);
    o.push(`<polyline points="${X(-Bd)},${Y(roofLeft)} ${X(0)},${Y(eaveH)} ${X(out)},${Y(tipH)}" fill="none" stroke="${C.line}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`);
    if (canopy) {
      o.push(L(X(-150), Y(canopy.tip), X(canopy.out), Y(canopy.tip), C.line, 4));
      o.push(T(X(canopy.out) + 8, Y(canopy.tip) + 26, '庇・下屋', { c: C.line, a: 'start', z: 20 }));
    }

    /* --- 窓 --- */
    if (rw) {
      const y1 = FL + sill, y2 = FL + g.headFL;
      o.push(`<rect x="${X(-150)}" y="${Y(y2)}" width="${150 * s}" height="${Y(y1) - Y(y2)}" fill="${C.win}" fill-opacity=".55" stroke="${C.win}" stroke-width="2" pointer-events="none"/>`);
      /* 上端〜下端は常に1行（FL+2000〜2600）でまとめて表示 */
      o.push(T(X(-250), Y(y2) - 8, `FL+${mm(sill)} 〜 +${mm(g.headFL)}`, { c: C.win, a: 'end', z: 19 }));
    }
    o.push(T(X(-Bd) + 10, Y(FL) - 14, room.name || '居室', { c: C.muted, a: 'start', z: 20 }));
    /* どの開口の窓かを、直上のFL+表示とまとめて窓の上端側に表示する。
     * ここをダブルクリック／ダブルタップすると「窓の種類」の欄にカーソルを合わせる（data-editwintype）。 */
    if (rw) {
      const y2 = FL + g.headFL;
      const type = LC.windows.find(op.winType);
      const infoY = Y(y2) - 26;
      o.push(T(X(-250), infoY, `${op.name || '開口'}／${type ? type.label : '窓'}`, { c: C.win, a: 'end', z: 20, w: 700 }));
      o.push(`<rect data-editwintype="1" x="${X(-250) - 200}" y="${infoY - 20}" width="200" height="32" fill="transparent" style="cursor:pointer;touch-action:manipulation"/>`);
    }

    /* --- 採光の検討線（採光モードのみ。換気・排煙では不要な情報のため非表示） --- */
    if (rw && state.mode === 'daylight') {
      const cx = X(0), cy = Y(g.centerH);
      g.parts.forEach(p => {
        if (!p.valid) return;
        const crit = g.critical === p;
        o.push(L(cx, cy, X(p.out), Y(p.tipH), C.light, crit ? 2.4 : 1.4, crit ? undefined : '6 6'));
        o.push(`<circle cx="${X(p.out)}" cy="${Y(p.tipH)}" r="${crit ? 5.5 : 4}" fill="${C.light}" pointer-events="none"/>`);
      });
      o.push(`<circle cx="${cx}" cy="${cy}" r="5.5" fill="${C.win}" stroke="${C.bg}" stroke-width="2" pointer-events="none"/>`);
      const p = g.critical;
      if (p) {
        o.push(L(X(p.out), Y(g.centerH), X(p.out), Y(p.tipH), C.light, 1.6, '5 5'));
        o.push(L(X(0), Y(g.centerH), X(p.out), Y(g.centerH), C.light, 1.2, '3 5'));
        o.push(T(X(p.out) + 10, (Y(g.centerH) + Y(p.tipH)) / 2 + 6, `h ${mm(p.h)}`, { c: C.light, a: 'start', z: 22, w: 700 }));
        if (p.d > 0) o.push(dimH(p.out, D, p.tipH, `d ${mm(p.d)}`, C.light, true));
        else o.push(T(X(p.out) + 12, Y(p.tipH) + 30, `d ${mm(p.d)}（境界超え）`, { c: C.bound, a: 'start', z: 22, w: 700 }));
      }
    }

    /* --- 排煙：天井から800mm有効範囲（排煙モードのみ） ---
     * 部屋の中に文字を詰め込むと他のラベルと重なるため、
     * 天井ライン・800mmの寸法は左の余白（軒高寸法と同じ列）に出す。線は横の点線2本のみ。 */
    if (rw && state.mode === 'smoke') {
      const group = LC.group(g.lv.floors[g.floor - 1].ceilingGroup);
      const ceilingLocal = group.ceiling;                    // FL基準の天井高さ(mm)
      const zoneTop = ceilingLocal, zoneBottom = ceilingLocal - 800;
      const zTopGL = FL + zoneTop, zBotGL = FL + zoneBottom;
      const lx1 = X(-Bd), lx2 = X(0);
      o.push(L(lx1, Y(zTopGL), lx2, Y(zTopGL), C.dim, 1.3, '2 3'));
      o.push(L(lx1, Y(zBotGL), lx2, Y(zBotGL), C.dim, 1.3, '2 3'));
      o.push(dimV(-Bd - 700, zBotGL, zTopGL, '800', C.dim, -1));

      const ovTop = Math.min(g.headFL, zoneTop), ovBottom = Math.max(sill, zoneBottom);
      if (ovTop > ovBottom) {
        const yOvTop = Y(FL + ovTop), yOvBottom = Y(FL + ovBottom);
        o.push(`<rect x="${X(-150)}" y="${yOvTop}" width="${150 * s}" height="${yOvBottom - yOvTop}" fill="${C.light}" fill-opacity=".6" pointer-events="none"/>`);
        o.push(T(X(0) + 14, (yOvTop + yOvBottom) / 2 + 5, `排煙有効高 ${mm(ovTop - ovBottom)}㎜`, { c: C.light, a: 'start', z: 20, w: 700 }));
      } else {
        o.push(T(X(0) + 14, Y(FL + g.headFL) + 18, '有効範囲外（窓が天井-800㎜より下）', { c: C.bound, a: 'start', z: 17, w: 700 }));
      }
    }

    /* --- 寸法（採光モードのみ。境界距離・軒の出・軒高は換気・排煙の計算に関与しないため非表示） --- */
    if (state.mode === 'daylight') {
      o.push(dimH(0, D, 250, `境界まで ${mm(D)}`, C.dim, false));
      if (out > 0) o.push(dimH(0, out, Math.max(eaveH, tipH) + 330, `軒の出 ${mm(out)}`, C.dim, false));
      o.push(dimV(-Bd - 1050, 0, eaveH, `軒高 GL+${mm(eaveH)}`, C.dim, -1));
    }

    /* --- ドラッグ用ハンドル（見える目印＋広い当たり判定） --- */
    const hit = 'fill="transparent"';
    if (state.mode === 'daylight') {
      // 境界線：左右
      const gy = Y(900), gx = X(D);
      o.push(`<rect data-drag="distance" x="${gx - 20}" y="${Y(yMax)}" width="40" height="${Y(yMin) - Y(yMax)}" ${hit} style="cursor:ew-resize;touch-action:none"/>`);
      o.push(`<g pointer-events="none"><rect x="${gx - 15}" y="${gy - 15}" width="30" height="30" rx="8" fill="${C.bg}" stroke="${C.bound}" stroke-width="2"/>` +
        `<path d="M${gx - 9} ${gy}h18M${gx - 9} ${gy}l5 -5M${gx - 9} ${gy}l5 5M${gx + 9} ${gy}l-5 -5M${gx + 9} ${gy}l-5 5" stroke="${C.bound}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`);
      // 軒先：左右
      if (isFinite(tipH)) {
        const tx = X(out), ty = Y(tipH);
        o.push(`<circle data-drag="eaveOut" cx="${tx}" cy="${ty}" r="26" ${hit} style="cursor:ew-resize;touch-action:none"/>`);
        o.push(`<circle cx="${tx}" cy="${ty}" r="13" fill="none" stroke="${C.light}" stroke-width="2" opacity=".8" pointer-events="none"/>`);
      }
    }
    // 窓：上下（採光・換気・排煙いずれも窓寸法・位置の確認に使うため常時表示）
    if (rw) {
      const y1 = FL + sill, y2 = FL + g.headFL;
      o.push(`<rect data-drag="head" x="${X(-150) - 14}" y="${Y(y2) - 8}" width="${150 * s + 60}" height="${Y(y1) - Y(y2) + 16}" ${hit} style="cursor:ns-resize;touch-action:none"/>`);
      const ax = X(0) + 22, ay = Y((y1 + y2) / 2);
      o.push(`<g pointer-events="none" fill="${C.win}"><polygon points="${ax},${ay - 22} ${ax - 8},${ay - 10} ${ax + 8},${ay - 10}"/><polygon points="${ax},${ay + 22} ${ax - 8},${ay + 10} ${ax + 8},${ay + 10}"/></g>`);
    }

    const meta = `data-s="${s}" data-xmin="${xMin}" data-ymin="${yMin}" data-xmax="${xMax}" data-w="${W}" data-h="${H}" data-pad="${pad}"`;
    return `<svg viewBox="0 0 ${W} ${H}" ${meta} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="採光検討の断面イメージ" font-family="'Hiragino Sans','BIZ UDPGothic','Yu Gothic UI',Meiryo,sans-serif">${o.join('')}</svg>`;
  }

  LC.ui = LC.ui || {};
  LC.ui.sectionSVG = render;
})(window.LC = window.LC || {});
