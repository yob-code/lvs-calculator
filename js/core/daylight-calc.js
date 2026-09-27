/* =====================================================================
 * 採光：計算ロジック
 * ---------------------------------------------------------------------
 * 幾何（階のFL高さ・窓中心・d・h）はここで行い、係数や必要面積は
 * rules/daylight-rules.js に任せる。高さはすべて設計GLからの値(mm)で扱う。
 * 居室は1つ。居室に属する開口（＝窓1つずつ）をすべて合算して判定する。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const R = () => LC.rules.daylight;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : NaN);
  const f = (n, d) => (isFinite(n) ? Number(n).toFixed(d) : '—');
  const mm = n => (isFinite(n) ? Math.round(n).toLocaleString('ja-JP') : '—');

  /* 建物の各階FL(GLから)と軒高。階ごとに天井高さグループ（階高の候補・軒高）が異なってよい */
  function levels(bld) {
    const n = Math.min(3, Math.max(1, Math.round(num(bld.storeys)) || 1));
    const floors = bld.floors.slice(0, n);
    const fl = [num(bld.fl1)];
    for (let i = 0; i < n - 1; i++) fl.push(fl[i] + num(floors[i].h));
    const top = fl[n - 1];
    const topGroup = LC.group(floors[n - 1].ceilingGroup);
    return { n, fl, top, eaveH: top + topGroup.eaveOff, floors, topGroup };
  }

  /* 窓の寸法：幅×高さ(mm)を直接入力（種類選択で標準サイズが入り、そこから編集可）。採光可能面積 = 幅×高さ */
  function resolveWindow(op) {
    const type = LC.windows.find(op.winType);
    if (!type) return null;
    const w = num(op.w), h = num(op.h);
    if (!(w > 0 && h > 0)) return null;
    return { type, w, h, area: (w / 1000) * (h / 1000) };
  }

  /* 1つの開口（窓1つ）の形状計算。SVG も同じ結果を使う */
  function geometry(op, state) {
    const lv = levels(state.bld);
    const floor = Math.min(lv.n, Math.max(1, Math.round(num(op.floor)) || 1));
    const fl = lv.fl[floor - 1];                      // 窓のある階のFL(GLから)
    const rw = resolveWindow(op);
    const wh = rw ? rw.h : 0;
    const headFL = num(op.headFL);                    // 窓上端（FLから）
    const sill = headFL - wh;                         // 窓下端（FLから）
    const centerH = fl + headFL - wh / 2;             // 窓中心(GLから)
    const nextFL = floor < lv.n ? lv.fl[floor] : lv.eaveH;   // 上の階のFL（最上階は軒高）
    const parts = [];

    const drop = (num(op.roofPitch) || 0) / 10 * (num(op.eaveOut) || 0);
    parts.push({ key: 'eave', label: '軒先', out: num(op.eaveOut), tipH: lv.eaveH - drop, drop });
    if (op.canopyOn) {
      parts.push({ key: 'canopy', label: '庇・下屋', out: num(op.canopyOut), tipH: fl + num(op.canopyTip), drop: 0 });
    }
    parts.forEach(p => {
      p.d = num(op.distance) - p.out;               // 部分 → 境界の水平距離
      p.h = p.tipH - centerH;                       // 窓中心 → 部分の垂直距離
      p.valid = isFinite(p.d) && isFinite(p.h) && p.h > 0;
      p.ratio = p.valid ? p.d / p.h : NaN;
    });
    const valid = parts.filter(p => p.valid);
    const critical = valid.length ? valid.reduce((a, b) => (b.ratio < a.ratio ? b : a)) : null;
    return { lv, floor, rw, fl, headFL, sill, centerH, nextFL, parts, critical };
  }

  function evalOpening(op, state, room) {
    const g = geometry(op, state);
    const out = { op, g, name: op.name || '開口', warnings: [], errors: [], steps: [], coef: 0, total: 0, effective: 0 };
    const rw = g.rw;
    const type = LC.windows.find(op.winType);

    if (!rw) { out.errors.push('窓の幅・高さを入力してください'); return out; }
    if (![op.distance, op.headFL, op.eaveOut, g.fl, g.lv.eaveH].every(v => isFinite(num(v)))) {
      out.errors.push('境界距離・窓の高さ・軒・階高の入力が未入力です');
    }
    if (op.canopyOn && !(isFinite(num(op.canopyTip)) && isFinite(num(op.canopyOut)))) out.errors.push('庇・下屋の入力が未入力です');
    if (out.errors.length) return out;

    if (g.sill < 0) out.warnings.push(`窓下端が FL${mm(g.sill)} でFLより下です。窓上端または窓の高さを確認してください`);
    if (g.fl + g.headFL > g.nextFL) out.warnings.push(`窓上端（GL+${mm(g.fl + g.headFL)}）が上の階のFL／軒高（GL+${mm(g.nextFL)}）を超えています`);

    out.unitArea = rw.area;
    out.total = rw.area;
    out.steps.push(`${g.floor}階 窓 ${type.label}：W${mm(rw.w)} × H${mm(rw.h)} = ${f(rw.area, 3)}㎡`);
    out.steps.push(`窓中心の高さ = ${g.floor}FL(GL+${mm(g.fl)}) + 窓上端 ${mm(g.headFL)} − H/2 ${mm(rw.h / 2)} = GL+${mm(g.centerH)}`);

    g.parts.forEach(p => {
      if (!p.valid) {
        if (p.h <= 0) out.warnings.push(`${p.label}の先端が窓中心より低い（h ≦ 0）ため、この部分は「直上」とみなさず除外しました`);
        return;
      }
      const dTxt = p.d <= 0 ? `${mm(p.d)}（境界を越えています）` : mm(p.d);
      const tipNote = p.key === 'eave' ? `（軒高 GL+${mm(g.lv.eaveH)}${p.drop ? ` − 勾配分 ${mm(p.drop)}` : ''}）` : '';
      out.steps.push(`${p.label}：d = 境界 ${mm(op.distance)} − 出 ${mm(p.out)} = ${dTxt}／h = 先端 GL+${mm(p.tipH)}${tipNote} − 窓中心 ${mm(g.centerH)} = ${mm(p.h)}／d/h = ${f(p.ratio, 3)}`);
    });

    if (!g.critical) {
      out.errors.push('窓の直上に検討できる軒・庇がありません（軒高または窓の高さを確認）');
      return out;
    }
    if (g.parts.filter(p => p.valid).length > 1) {
      out.steps.push(`最小の d/h を採用 → ${g.critical.label}（${f(g.critical.ratio, 3)}）`);
    }
    if (g.critical.d <= 0) out.warnings.push('軒先または庇が境界線に達しています。配置の見直しが必要です');

    const c = R().coefficient({
      zone: room.zone, ratio: g.critical.ratio, dMm: g.critical.d, boundaryType: op.boundaryType
    });
    out.coef = c.value;
    c.steps.forEach(s => out.steps.push(s));
    out.effective = out.total * c.value;
    out.steps.push(`有効採光面積 = ${f(out.total, 3)}㎡ × 補正係数 ${f(c.value, 3)} = ${f(out.effective, 3)}㎡`);
    return out;
  }

  /* 居室ぶんの判定（居室に属する開口＝窓を合算） */
  function calc(state) {
    const room = state.room, rules = R();
    const area = num(room.area);
    const res = {
      ok: false, verdict: 'invalid', verdictLabel: '入力確認',
      required: NaN, effective: 0, margin: NaN, marginPct: NaN, neededCoef: NaN, totalOpening: 0,
      requiredBasis: '', openings: [], warnings: [], ruleVerified: rules.isVerified()
    };
    res.openings = state.openings.map(op => evalOpening(op, state, room));

    if (!(area > 0)) { res.warnings.push('居室床面積を入力してください'); return res; }
    const req = rules.requiredArea(area, room.ratioKey);
    res.required = req.value; res.requiredBasis = req.basis;

    const okOpenings = res.openings.filter(o => !o.errors.length);
    res.effective = okOpenings.reduce((s, o) => s + o.effective, 0);
    res.totalOpening = okOpenings.reduce((s, o) => s + o.total, 0);
    res.margin = res.effective - res.required;
    res.marginPct = res.required > 0 ? res.margin / res.required * 100 : NaN;
    res.neededCoef = res.totalOpening > 0 ? res.required / res.totalOpening : NaN;

    if (res.openings.some(o => o.errors.length)) res.warnings.push('入力が不足している開口があります（結果には含めていません）');
    if (!okOpenings.length) return res;

    const thr = num(state.settings.cautionPct);
    const eps = 1e-9;
    res.ok = true;
    if (res.margin < -eps) { res.verdict = 'ng'; res.verdictLabel = '初期検討 NG'; }
    else if (isFinite(thr) && res.marginPct < thr) { res.verdict = 'caution'; res.verdictLabel = '初期検討 OK（余裕小）'; }
    else { res.verdict = 'ok'; res.verdictLabel = '初期検討 OK'; }
    return res;
  }

  /* 指定した開口の境界距離だけを動かして、余裕がちょうど0以上になる最小距離(mm)を求める。
   * 他の条件は固定。効果面積は距離に対して単調増加なので二分探索で足りる。 */
  function solveDistance(state, opId) {
    const probe = dist => {
      const s = JSON.parse(JSON.stringify(state));
      s.openings.find(o => o.id === opId).distance = dist;
      return calc(s);
    };
    const MAX = 20000;
    const base = probe(num(state.openings.find(o => o.id === opId).distance));
    if (!base.ok) return { status: 'unavailable' };
    if (probe(MAX).margin < -1e-9) return { status: 'never' };
    if (probe(0).margin >= -1e-9) return { status: 'found', mm: 0 };
    let lo = 0, hi = MAX;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (probe(mid).margin >= -1e-9) hi = mid; else lo = mid;
    }
    return { status: 'found', mm: Math.ceil(hi / 10) * 10 };
  }

  LC.calc = { daylight: calc, geometry, levels, resolveWindow, solveDistance, fmt: f, mm };
})(window.LC = window.LC || {});
