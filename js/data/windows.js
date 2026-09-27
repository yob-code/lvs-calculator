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

    /* 窓の種類ごとの簡易アイコン：
     * ・引違い（掃き出し／腰窓）＝2枚建具の召合せを表す中央の実線
     * ・すべり出し（タテ／ヨコ）＝ヒンジ側の辺を実線、反対側の辺が開くことを示す点線（軸側の1点に収束）
     * ・FIX＝開閉しないため線なし（ただの窓枠） */
    icon(w, h, box, typeId) {
      const B = box || 44;
      const a = w > 0 && h > 0 ? w / h : 1;
      let iw = B, ih = B;
      if (a >= 1) ih = B / a; else iw = B * a;
      iw = Math.max(iw, 10); ih = Math.max(ih, 10);
      const x = (B - iw) / 2, y = (B - ih) / 2;
      const cx = x + iw / 2, cy = y + ih / 2;
      const frame = `<rect x="${x}" y="${y}" width="${iw}" height="${ih}" rx="1.5" fill="rgba(90,200,230,.10)" stroke="#5ac8e6" stroke-width="1.6"/>`;
      let inner = '';
      if (typeId === 'tate-suberi') {
        /* 縦すべり出し窓：ヒンジは片方の縦辺（実線）、反対側の辺が開く（点線が軸側の1点に収束） */
        inner = `<path d="M${x + 2} ${y + 2}V${y + ih - 2}" stroke="#5ac8e6" stroke-width="1.6"/>` +
          `<path d="M${x + iw - 3} ${y + 3}L${x + 2} ${cy}L${x + iw - 3} ${y + ih - 3}" fill="none" stroke="#5ac8e6" stroke-width="1" stroke-dasharray="2.5 2"/>`;
      } else if (typeId === 'yoko-suberi') {
        /* 横すべり出し窓：ヒンジは上辺（実線）、下辺が外側に開く（点線が軸側の1点に収束） */
        inner = `<path d="M${x + 2} ${y + 2}H${x + iw - 2}" stroke="#5ac8e6" stroke-width="1.6"/>` +
          `<path d="M${x + 3} ${y + ih - 3}L${cx} ${y + 2}L${x + iw - 3} ${y + ih - 3}" fill="none" stroke="#5ac8e6" stroke-width="1" stroke-dasharray="2.5 2"/>`;
      } else if (typeId === 'fix') {
        /* FIX窓：開閉しないため中央線なし */
        inner = '';
      } else {
        /* 引違い（掃き出し・腰窓）：中央に召合せの実線 */
        inner = `<path d="M${cx} ${y + 2}V${y + ih - 2}" stroke="#5ac8e6" stroke-width="1.2" opacity=".8"/>`;
      }
      return `<svg viewBox="0 0 ${B} ${B}" width="${B}" height="${B}" aria-hidden="true">${frame}${inner}</svg>`;
    }
  };
})(window.LC = window.LC || {});
