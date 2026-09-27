/* =====================================================================
 * 換気・排煙：計算ロジック
 * ---------------------------------------------------------------------
 * 換気：境界距離や軒の出は関係ない。窓ごとに
 *   有効面積 = 窓面積（幅×高さ） × 窓種類ごとの有効開口比率
 * を求め、居室に属する開口を合算して、必要面積（床面積×割合）と比較する。
 *
 * 排煙：さらに「天井から800mm以内」の位置要件を考慮する。窓のうち、
 * 天井高さ(その階の天井高さ設定)から800mm下がったラインより上にかかる
 * 高さ部分だけを有効とみなし、その高さ×窓幅×有効開口比率を有効面積とする。
 *
 * ルール（rules/ventilation-rules.js・rules/smoke-rules.js）だけを差し替える
 * 共通の形として makeCalc() にまとめている。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const f = (n, d) => (isFinite(n) ? Number(n).toFixed(d) : '—');
  const mm = LC.calc.mm;
  const CEIL_ZONE_MM = 800;                                   // 排煙：天井からこの範囲内が有効

  function makeCalc(ruleKey, ratioField, opts) {
    const R = () => LC.rules[ruleKey];
    const clip = !!(opts && opts.clipToCeiling);

    function evalOpening(op, room, state) {
      const rw = LC.calc.resolveWindow(op);
      const type = LC.windows.find(op.winType);
      const out = { op, name: op.name || '開口', errors: [], warnings: [], steps: [], total: 0, effective: 0 };
      if (!rw) { out.errors.push('窓の幅・高さを入力してください'); return out; }
      const ratio = (R().openingRatio[op.winType] || { value: 0 }).value;
      out.total = rw.area;
      out.steps.push(`${type.label}：W${mm(rw.w)} × H${mm(rw.h)} = ${f(rw.area, 3)}㎡`);

      if (!clip) {
        out.effective = rw.area * ratio;
        out.steps.push(`有効面積 = ${f(rw.area, 3)}㎡ × 有効開口比率 ${f(ratio, 2)}（${type.label}） = ${f(out.effective, 3)}㎡`);
        return out;
      }

      /* 排煙：窓のある階の天井高さから、窓のうち天井-800mm〜天井の範囲にかかる高さだけを使う */
      const n = Math.min(3, Math.max(1, Math.round(Number(state.bld.storeys)) || 1));
      const floor = Math.min(n, Math.max(1, Math.round(Number(op.floor)) || 1));
      const group = LC.group(state.bld.floors[floor - 1].ceilingGroup);
      const ceilingLocal = group.ceiling;                      // その階のFLからの天井高さ(mm)
      const head = Number(op.headFL), sill = head - rw.h;
      const zoneTop = ceilingLocal, zoneBottom = ceilingLocal - CEIL_ZONE_MM;
      const overlap = Math.max(0, Math.min(head, zoneTop) - Math.max(sill, zoneBottom));
      out.steps.push(`${floor}階 天井高さ FL+${mm(ceilingLocal)}mm（天井高${group.ceiling}mm設定）／排煙上有効な範囲：天井から${CEIL_ZONE_MM}mm以内 = FL+${mm(zoneBottom)}〜${mm(zoneTop)}mm`);
      out.steps.push(`窓 FL+${mm(sill)}〜${mm(head)}mm のうち、有効範囲と重なる高さ = ${mm(overlap)}mm`);
      if (overlap <= 0) out.warnings.push('この窓は天井から800mm以内にないため、排煙上有効な部分がありません（窓上端を天井に近づけてください）');
      out.effective = (overlap / 1000) * (rw.w / 1000) * ratio;
      out.steps.push(`有効面積 = 重なり高さ ${f(overlap / 1000, 3)}m × 窓幅 ${f(rw.w / 1000, 3)}m × 有効開口比率 ${f(ratio, 2)}（${type.label}） = ${f(out.effective, 3)}㎡`);
      return out;
    }

    return function calc(state) {
      const room = state.room, rules = R();
      const area = Number(room.area);
      const res = {
        ok: false, verdict: 'invalid', verdictLabel: '入力確認',
        required: NaN, effective: 0, margin: NaN, marginPct: NaN, requiredBasis: '',
        openings: [], warnings: [], ruleVerified: rules.isVerified()
      };
      res.openings = state.openings.map(op => evalOpening(op, room, state));

      if (!(area > 0)) { res.warnings.push('居室床面積を入力してください'); return res; }
      const ratioKey = room[ratioField] || Object.keys(rules.requiredRatios)[0];
      const req = rules.requiredArea(area, ratioKey);
      res.required = req.value; res.requiredBasis = req.basis;

      const ok = res.openings.filter(o => !o.errors.length);
      res.effective = ok.reduce((s, o) => s + o.effective, 0);
      res.margin = res.effective - res.required;
      res.marginPct = res.required > 0 ? res.margin / res.required * 100 : NaN;

      if (!state.openings.length) res.warnings.push('開口がまだありません');
      if (res.openings.some(o => o.errors.length)) res.warnings.push('入力が不足している開口があります（結果には含めていません）');
      if (!ok.length) return res;

      const thr = Number(state.settings.cautionPct);
      const eps = 1e-9;
      res.ok = true;
      if (res.margin < -eps) { res.verdict = 'ng'; res.verdictLabel = '初期検討 NG'; }
      else if (isFinite(thr) && res.marginPct < thr) { res.verdict = 'caution'; res.verdictLabel = '初期検討 OK（余裕小）'; }
      else { res.verdict = 'ok'; res.verdictLabel = '初期検討 OK'; }
      return res;
    };
  }

  LC.calc.ventilation = makeCalc('ventilation', 'ventRatioKey');
  LC.calc.smoke = makeCalc('smoke', 'smokeRatioKey', { clipToCeiling: true });
})(window.LC = window.LC || {});
