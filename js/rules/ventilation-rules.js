/* =====================================================================
 * 換気：法規ルール層（差し替え専用ファイル）
 * ---------------------------------------------------------------------
 * ・openingRatio（窓種類ごとの有効開口比率）はユーザー指定値として確定済み。
 *   掃き出し窓・腰窓＝0.5、タテスベリ窓・ヨコスベリ窓＝1.0、FIX窓＝0。
 * ・requiredRatios（居室に必要な有効換気面積の割合）は【暫定・未照合】です。
 *   建築基準法施行令 第20条の2 等の原文と照合し、確定したら verified を true にしてください。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const rules = {
    meta: {
      id: 'ventilation', title: '換気', version: '0.1-provisional', verified: false,
      note: '必要換気面積の割合は暫定です。条文で照合するまで、確認申請には使えません。'
    },

    /* 窓種類ごとの有効開口比率。ユーザー指定により確定（sourcesにその旨を記録） */
    openingRatio: {
      haridashi:   { value: 0.5, verified: true, sources: ['ユーザー指定'] },
      koshi:       { value: 0.5, verified: true, sources: ['ユーザー指定'] },
      'tate-suberi': { value: 1.0, verified: true, sources: ['ユーザー指定'] },
      'yoko-suberi': { value: 1.0, verified: true, sources: ['ユーザー指定'] },
      fix:         { value: 0,   verified: true, sources: ['ユーザー指定'] }
    },

    requiredRatios: {
      '1/20': { value: 1 / 20, label: '1/20（居室の換気・標準）', verified: false, sources: [] }
    },

    requiredArea(floorArea, ratioKey) {
      const r = rules.requiredRatios[ratioKey] || rules.requiredRatios['1/20'];
      return {
        value: floorArea * r.value, ratio: r.value, label: r.label,
        basis: `居室床面積 ${fmt(floorArea, 2)}㎡ × ${ratioText(r.value)}`
      };
    },

    /* 窓1つぶんの有効換気面積 */
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
  LC.rules.ventilation = rules;
})(window.LC = window.LC || {});
