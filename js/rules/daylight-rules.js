/* =====================================================================
 * 採光：法規ルール層（差し替え専用ファイル）
 * ---------------------------------------------------------------------
 * ★ このファイルの数値・式はすべて【暫定・未照合】です。
 *   建築基準法 第28条／施行令 第19条・第20条／関連告示の原文と照合し、
 *   確定したら各項目の verified を true にし、sources に根拠条文を記入してください。
 *   計算ロジック（daylight-calc.js）は、このファイルの関数だけを呼びます。
 *   → 法規が変わっても、このファイルだけ差し替えれば済む構造です。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const rules = {
    meta: {
      id: 'daylight',
      title: '採光',
      version: '0.1-provisional',
      // 全体の照合状態。項目ごとの verified がすべて true になったら true にする
      verified: false,
      note: '法規値は暫定です。条文・告示で照合するまで、確認申請には使えません。'
    },

    /* 用途地域区分ごとの係数式： 係数 = k × (d/h) + c
     *   farDistanceM：この距離(m)以上で「算定値が1.0未満なら1.0」とする境界距離 */
    zones: {
      residential: { label: '住居系地域', k: 6.0, c: -1.4, farDistanceM: 7.0, verified: false, sources: [] },
      industrial:  { label: '工業系地域', k: 8.0, c: -1.0, farDistanceM: 5.0, verified: false, sources: [] },
      commercial:  { label: '商業系地域', k: 10.0, c: -1.0, farDistanceM: 4.0, verified: false, sources: [] },
      unzoned:     { label: '用途地域の指定なし', k: 10.0, c: -1.0, farDistanceM: 4.0, verified: false, sources: [] }
    },

    /* 採光補正係数の上限 */
    maxCoefficient: { value: 3.0, verified: false, sources: [] },

    /* 居室の床面積に対する必要な採光面積の割合 */
    requiredRatios: {
      '1/7':  { value: 1 / 7,  label: '1/7（住宅の居室・標準）', verified: false, sources: [] },
      '1/10': { value: 1 / 10, label: '1/10（照明設備等の緩和・要確認）', verified: false, sources: [], needsCheck: true }
    },

    /* 境界の種別（道に面する場合の下限処理などに使う） */
    boundaryTypes: {
      neighbor: { label: '隣地境界線', facesRoad: false },
      road:     { label: '道路（反対側境界線）', facesRoad: true },
      open:     { label: '公園・水面等', facesRoad: true }
    },

    /* ---------------------------------------------------------------
     * 必要採光面積
     * --------------------------------------------------------------- */
    requiredArea(floorArea, ratioKey) {
      const r = rules.requiredRatios[ratioKey] || rules.requiredRatios['1/7'];
      return {
        value: floorArea * r.value,
        ratio: r.value,
        label: r.label,
        basis: `居室床面積 ${fmt(floorArea, 2)}㎡ × ${ratioText(r.value)}`
      };
    },

    /* ---------------------------------------------------------------
     * 採光補正係数
     *   input:  { zone, ratio (=d/h), dMm (水平距離mm), boundaryType }
     *   return: { value, raw, steps[] (根拠の文字列), verified }
     * --------------------------------------------------------------- */
    coefficient({ zone, ratio, dMm, boundaryType }) {
      const z = rules.zones[zone] || rules.zones.residential;
      const bt = rules.boundaryTypes[boundaryType] || rules.boundaryTypes.neighbor;
      const steps = [];
      const raw = z.k * ratio + z.c;
      steps.push(`${z.label}：係数 = ${fmt(z.k, 1)} × d/h ${z.c < 0 ? '−' : '+'} ${fmt(Math.abs(z.c), 1)} = ${fmt(raw, 3)}`);

      let v = raw;
      const dM = dMm / 1000;

      if (v > rules.maxCoefficient.value) {
        v = rules.maxCoefficient.value;
        steps.push(`上限 ${fmt(rules.maxCoefficient.value, 1)} を適用 → ${fmt(v, 3)}`);
      } else if (v < 1.0) {
        if (bt.facesRoad) {
          v = 1.0;
          steps.push(`道に面する場合、算定値が1.0未満 → 1.0 として扱う`);
        } else if (dM >= z.farDistanceM) {
          v = 1.0;
          steps.push(`水平距離 ${fmt(dM, 2)}m ≧ ${fmt(z.farDistanceM, 1)}m のため、算定値が1.0未満 → 1.0`);
        } else if (v < 0) {
          v = 0;
          steps.push(`水平距離 ${fmt(dM, 2)}m ＜ ${fmt(z.farDistanceM, 1)}m で算定値がマイナス → 0`);
        }
      }
      return { value: v, raw, steps, verified: z.verified && rules.maxCoefficient.verified };
    },

    /* 未照合の項目があるか（UIのバッジ表示用） */
    isVerified() {
      if (!rules.maxCoefficient.verified) return false;
      return Object.values(rules.zones).every(z => z.verified) &&
             Object.values(rules.requiredRatios).every(r => r.verified);
    }
  };

  function fmt(n, d) {
    if (!isFinite(n)) return '—';
    return Number(n).toFixed(d);
  }
  function ratioText(v) {
    const inv = Math.round(1 / v);
    return Math.abs(1 / inv - v) < 1e-9 ? `1/${inv}` : fmt(v, 3);
  }

  LC.rules = LC.rules || {};
  LC.rules.daylight = rules;
})(window.LC = window.LC || {});
