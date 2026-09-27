/* =====================================================================
 * 窓の種類（ツーバイフォー用・5種類）
 * ---------------------------------------------------------------------
 * メーカー・防火の分類はしない。種類ごとに「標準サイズ（幅・高さ mm）」を持ち、
 * 選択するとその数値が幅・高さ欄に入る。そこから幅・高さを直接編集して変更する。
 * 採光可能面積・換気/排煙の元面積は 幅 × 高さ そのまま（開口率などの補正はしない）。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const TYPES = [
    { id: 'haridashi',   label: '掃き出し窓',   w: 1600, h: 2000 },
    { id: 'koshi',       label: '腰窓',         w: 1600, h: 1100 },
    { id: 'tate-suberi', label: 'タテスベリ窓', w: 360,  h: 1100 },
    { id: 'yoko-suberi', label: 'ヨコスベリ窓', w: 690,  h: 300 },
    { id: 'fix',         label: 'FIX窓',        w: 690,  h: 300 }
  ];

  LC.windows = {
    types: () => TYPES,
    find: id => TYPES.find(t => t.id === id) || null,

    /* 窓の縦横比だけを表す簡易アイコン */
    icon(w, h, box) {
      const B = box || 44;
      const a = w > 0 && h > 0 ? w / h : 1;
      let iw = B, ih = B;
      if (a >= 1) ih = B / a; else iw = B * a;
      iw = Math.max(iw, 10); ih = Math.max(ih, 10);
      const x = (B - iw) / 2, y = (B - ih) / 2, m = x + iw / 2;
      return `<svg viewBox="0 0 ${B} ${B}" width="${B}" height="${B}" aria-hidden="true">` +
        `<rect x="${x}" y="${y}" width="${iw}" height="${ih}" rx="1.5" fill="rgba(90,200,230,.10)" stroke="#5ac8e6" stroke-width="1.6"/>` +
        `<path d="M${m} ${y + 2}V${y + ih - 2}" stroke="#5ac8e6" stroke-width="1.2" opacity=".8"/></svg>`;
    }
  };
})(window.LC = window.LC || {});
