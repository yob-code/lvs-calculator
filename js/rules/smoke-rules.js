/* =====================================================================
 * 排煙：法規ルール層（差し替え専用ファイル）
 * ---------------------------------------------------------------------
 * ・openingRatio（窓種類ごとの有効開口比率）はユーザー指定値として確定済み。
 *   掃き出し窓・腰窓＝0.5、タテスベリ窓・ヨコスベリ窓＝1.0、FIX窓＝0。
 *   ※排煙上有効な開口部の位置要件（天井から800mm以内）は js/core/simple-calc.js 側で
 *     窓の高さのうち天井-800mm〜天井の範囲と重なる部分だけを面積算入する形で計算しています。
 *     800mmという数値自体は一般的なものですが、暫定・未照合です。
 * ・requiredRatios（居室に必要な排煙上有効な開口部面積の割合）は【暫定・未照合】です。
 *   建築基準法施行令 第126条の2 等の原文と照合し、確定したら verified を true にしてください。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const rules = {
    meta: {
      id: 'smoke', title: '排煙', version: '0.2-provisional', verified: false,
      note: '必要排煙面積の割合は暫定です。位置要件は天井から800mm以内として計算していますが、この800mmという数値自体も暫定です。確認申請には使えません。'
    },

    openingRatio: {
      haridashi:   { value: 0.5, verified: true, sources: ['ユーザー指定'] },
      koshi:       { value: 0.5, verified: true, sources: ['ユーザー指定'] },
      'tate-suberi': { value: 1.0, verified: true, sources: ['ユーザー指定'] },
      'yoko-suberi': { value: 1.0, verified: true, sources: ['ユーザー指定'] },
      fix:         { value: 0,   verified: true, sources: ['ユーザー指定'] }
    },

    requiredRatios: {
      '1/50': { value: 1 / 50, label: '1/50（居室の排煙・標準）', verified: false, sources: [] }
    },

    requiredArea(floorArea, ratioKey) {
      const r = rules.requiredRatios[ratioKey] || rules.requiredRatios['1/50'];
      return {
        value: floorArea * r.value, ratio: r.value, label: r.label,
        basis: `居室床面積 ${fmt(floorArea, 2)}㎡ × ${ratioText(r.value)}`
      };
    },

    effectiveArea(winType, areaM2) {
      const r = rules.openingRatio[winType] || { value: 0, verified: false };
      return { value: areaM2 * r.value, ratio: r.value, verified: r.verified };
    },

    isVerified() {
      return Object.values(rules.requiredRatios).every(r => r.verified) &&
             Object.values(rules.openingRatio).every(r => r.verified);
    }
  };

  function fmt(n, d) { return isFinite(n) ? Number(n).toFixed(d) : '—'; }
  function ratioText(v) {
    const inv = Math.round(1 / v);
    return Math.abs(1 / inv - v) < 1e-9 ? `1/${inv}` : fmt(v, 3);
  }

  LC.rules = LC.rules || {};
  LC.rules.smoke = rules;
})(window.LC = window.LC || {});
