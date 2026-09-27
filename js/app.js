/* =====================================================================
 * 採光電卓 UI
 * ---------------------------------------------------------------------
 * 構造：入力(state) → 計算(LC.calc.daylight) → 結果表示 / SVG断面図
 * 居室(room)は1つ。開口(opening)を複数持てる＝開口1つにつき窓1つ。
 * 断面図の「境界線・軒先・窓」はドラッグで直接動かせる。
 * ドラッグ中は重い計算（境界距離の逆算）を止め、requestAnimationFrameで
 * 再描画を1フレームに1回へ間引くことで、動かしたときの画面のガタつきを防ぐ。
 * ===================================================================== */
(function (LC) {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { fmt: f, mm } = LC.calc;
  const MINUS = '−';
  const signed = (n, d = 2) => (!isFinite(n) ? '—' : (n < -1e-9 ? MINUS : n > 1e-9 ? '+' : '±') + Math.abs(n).toFixed(d));

  let state = LC.store.load();
  let result = null;
  let drag = null;
  const activeOp = () => state.openings.find(o => o.id === state.active) || state.openings[0];
  const R = () => LC.rules.daylight;
  /* モードごとの見出し・計算関数の切り替え。採光は専用の幾何計算＋SVG、
   * 換気・排煙は窓面積×有効開口比率だけの簡易計算（simple-calc.js）を使う。 */
  const modeLabel = () => ({ daylight: '採光', ventilation: '換気', smoke: '排煙' }[state.mode] || '採光');
  const currentCalc = () => (state.mode === 'daylight' ? LC.calc.daylight(state) : LC.calc[state.mode](state));

  /* ---------- 入力欄の部品 ---------- */
  /* パスは "op.count" のような単純な2階層のほか、"bld.floors.0.h" のような
   * ネストしたパスにも対応（配列の添字は文字列キーとしてそのままアクセスできる） */
  function resolve(path) {
    const parts = path.split('.');
    let obj = { op: activeOp(), room: state.room, bld: state.bld, settings: state.settings }[parts[0]];
    for (let i = 1; i < parts.length - 1; i++) obj = obj[parts[i]];
    return { obj, key: parts[parts.length - 1] };
  }
  const val = p => { const { obj, key } = resolve(p); return obj[key]; };
  const idOf = path => 'f-' + path.replace(/\./g, '-');

  function numField({ label, path, unit, step = 100, min = 0, hint = '', ph = '' }) {
    const v = val(path);
    return `<div class="fld">
      <label for="${idOf(path)}">${label}</label>
      <div class="ctl">
        <button type="button" class="stp" data-step="${path}" data-delta="${-step}" data-min="${min}" aria-label="${step}減らす">${MINUS}</button>
        <input id="${idOf(path)}" type="number" inputmode="decimal" step="any" data-bind="${path}" value="${v == null ? '' : v}" placeholder="${esc(ph)}">
        <span class="unit">${unit}</span>
        <button type="button" class="stp" data-step="${path}" data-delta="${step}" data-min="${min}" aria-label="${step}増やす">＋</button>
      </div>
      ${hint ? `<small class="hint">${hint}</small>` : ''}
    </div>`;
  }
  /* 数値欄 ＋ よく使う値のワンタップ候補 */
  function choiceField(o) {
    const chips = o.options.map(v =>
      `<button type="button" class="chip sm ${Number(val(o.path)) === v ? 'on' : ''}" data-choice="${o.path}" data-value="${v}">${v.toLocaleString('ja-JP')}</button>`).join('');
    return `<div class="choice">${numField(o)}<div class="chips tight" data-chips="${o.path}">${chips}</div></div>`;
  }
  /* 文字列（enum）のチップ選択。groupExtra があれば、選択と同時に同じオブジェクトの
   * 別キーも調整する（例：天井高さグループを変えたら階高を候補内に補正） */
  function enumChips({ label, path, options, groupExtra }) {
    const v = val(path);
    return `<div class="fld"><label>${label}</label><div class="chips">${
      options.map(([id, t]) => `<button type="button" class="chip ${v === id ? 'on' : ''}" data-enum="${path}" data-value="${id}" ${groupExtra ? `data-enum-extra="${groupExtra}"` : ''}>${esc(t)}</button>`).join('')
    }</div></div>`;
  }
  function selField({ label, path, options }) {
    const v = val(path);
    return `<div class="fld"><label for="${idOf(path)}">${label}</label>
      <div class="ctl sel"><select id="${idOf(path)}" data-bind="${path}">
      ${options.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}
      </select></div></div>`;
  }
  function textField({ label, path, ph = '', attrs = '' }) {
    return `<div class="fld"><label for="${idOf(path)}">${label}</label>
      <div class="ctl"><input id="${idOf(path)}" type="text" data-bind="${path}" value="${esc(val(path))}" placeholder="${esc(ph)}" ${attrs}></div></div>`;
  }

  /* ---------- 建物パネル（ツーバイフォー・階ごとに天井高さ） ---------- */
  function renderBld() {
    const b = state.bld, n = b.storeys;
    const groupOpts = Object.values(LC.presets.groups).map(g => [g.id, g.label]);
    let floorsHtml = '';
    for (let i = 0; i < n; i++) {
      const isTop = i === n - 1;
      const g = LC.group(b.floors[i].ceilingGroup);
      floorsHtml += `<div class="floorblk">
        <h4>${i + 1}階</h4>
        ${enumChips({ label: '天井高さ', path: `bld.floors.${i}.ceilingGroup`, options: groupOpts, groupExtra: `bld.floors.${i}.h` })}
        ${!isTop
          ? `<div class="row">${choiceField({ label: `階高 ${i + 1}FL→${i + 2}FL`, path: `bld.floors.${i}.h`, unit: 'mm', step: 1, options: g.storeyOptions })}</div>`
          : `<small class="hint">軒高：${i + 1}FL ＋ ${mm(g.eaveOff)}mm（天井高${g.ceiling}mm）</small>`}
      </div>`;
    }
    $('#panelBldBody').innerHTML = `
      <div class="fld"><label>階数</label>
        <div class="chips">${[1, 2, 3].map(k => `<button type="button" class="chip ${n === k ? 'on' : ''}" data-storeys="${k}">${k}階建て</button>`).join('')}</div></div>
      <div class="row">${numField({ label: '1FL（設計GLから）', path: 'bld.fl1', unit: 'mm', step: 50 })}</div>
      ${floorsHtml}
      <div class="readout" data-out="levels"></div>`;
  }

  /* ---------- 居室パネル ---------- */
  function renderRoom() {
    let modeFields;
    if (state.mode === 'daylight') {
      const zones = Object.entries(R().zones).map(([k, z]) => [k, z.label]);
      const ratios = Object.entries(R().requiredRatios).map(([k, r]) => [k, r.label]);
      modeFields = `<div class="row two">
        ${selField({ label: '用途地域の区分', path: 'room.zone', options: zones })}
        ${selField({ label: '必要な採光割合', path: 'room.ratioKey', options: ratios })}
      </div>`;
    } else {
      const rules = LC.rules[state.mode];
      const ratios = Object.entries(rules.requiredRatios).map(([k, r]) => [k, r.label]);
      const path = state.mode === 'ventilation' ? 'room.ventRatioKey' : 'room.smokeRatioKey';
      modeFields = `<div class="row">${selField({ label: `必要な${modeLabel()}の割合`, path, options: ratios })}</div>`;
    }
    $('#panelRoom').innerHTML = `
      <h2>居室</h2>
      <div class="row">${textField({ label: '居室名（任意）', path: 'room.name', ph: '例：LDK' })}</div>
      <div class="row">${numField({ label: '居室床面積', path: 'room.area', unit: '㎡', step: 0.5, ph: '例：13.2' })}</div>
      <details class="more"><summary>縦×横(mm)から床面積を出す</summary>
        <div class="row two">
          ${numField({ label: '縦', path: 'room.dimX', unit: 'mm', step: 100, ph: '3640' })}
          ${numField({ label: '横', path: 'room.dimY', unit: 'mm', step: 100, ph: '2730' })}
        </div>
        <small class="hint">縦×横を入れると、上の床面積へ自動で反映します（長方形のみ）。</small>
      </details>
      ${modeFields}`;
  }

  /* ---------- 窓カード ---------- */
  function winCard(op) {
    const rw = LC.calc.resolveWindow(op);
    if (!rw) return `<div class="wcard empty">幅・高さを入力すると、面積が表示されます</div>`;
    const t = LC.windows.find(op.winType);
    return `<div class="wcard">
      <div class="wimg">${LC.windows.icon(rw.w, rw.h, 56, op.winType)}</div>
      <div class="winfo">
        <div class="wtitle"><b>W${mm(rw.w)} × H${mm(rw.h)}</b> ${esc(t.label)}</div>
        <div class="weff">面積 <b>${f(rw.w / 1000, 2)} × ${f(rw.h / 1000, 2)} = ${f(rw.area, 2)}㎡</b></div>
      </div>
    </div>`;
  }

  /* ---------- 開口パネル（開口1つ＝窓1つ） ---------- */
  function renderOpening() {
    const op = activeOp();
    const n = state.bld.storeys;
    const tabs = state.openings.map(o =>
      `<button type="button" class="chip ${o.id === op.id ? 'on' : ''}" data-tab="${o.id}">${esc(o.name || '開口')}（${o.floor || 1}F）</button>`).join('') +
      `<button type="button" class="chip add" id="btnAddOpening" aria-label="開口を追加">＋ 開口を追加（窓を増やす）</button>`;
    const bts = Object.entries(R().boundaryTypes).map(([k, b]) => [k, b.label]);
    const types = LC.windows.types();

    $('#panelOpening').innerHTML = `
      <h2>開口（窓1つにつき1件）</h2>
      <div class="chips" role="tablist">${tabs}</div>
      <div class="row">${textField({ label: '面の名称（任意）', path: 'op.name', ph: '例：南面' })}</div>

      <h3>窓</h3>
      ${n > 1 ? `<div class="fld"><label>窓のある階</label><div class="chips">${
        Array.from({ length: n }, (_, i) => `<button type="button" class="chip ${op.floor === i + 1 ? 'on' : ''}" data-floor="${i + 1}">${i + 1}階</button>`).join('')}</div></div>` : ''}
      <div class="fld"><label>窓の種類</label><div class="chips">${
        types.map(t => `<button type="button" class="chip ${op.winType === t.id ? 'on' : ''}" data-wintype="${t.id}">${esc(t.label)}</button>`).join('')}</div></div>
      <div class="row">${numField({ label: '幅', path: 'op.w', unit: 'mm', step: 10 })}</div>
      <div class="row">${numField({ label: '高さ', path: 'op.h', unit: 'mm', step: 10 })}</div>
      <div class="chips tight"><button type="button" class="chip sm" data-sizereset>この種類の標準サイズに戻す</button></div>
      <div id="winCardBox">${winCard(op)}</div>

      <h3>窓の高さ</h3>
      <div class="row">${numField({ label: `窓上端（${op.floor}FLから）`, path: 'op.headFL', unit: 'mm', step: 50, hint: '基本は FL+2000。ここから上げ下げして調整（図の窓を上下にドラッグでも可）' })}
        <div class="chips tight"><button type="button" class="chip sm" data-headreset>基本 2000 に戻す</button></div></div>
      <div class="readout" data-out="winLevels"></div>

      <h3>境界・軒</h3>
      <div class="row">${selField({ label: '境界の種類', path: 'op.boundaryType', options: bts })}</div>
      <div class="row">${numField({ label: '外壁面から境界までの距離', path: 'op.distance', unit: 'mm', step: 100, hint: '道路・公園等は反対側の境界線までを入力' })}</div>
      <div class="row">${numField({ label: '軒の出', path: 'op.eaveOut', unit: 'mm', step: 50 })}</div>

      <details class="more" ${op.canopyOn || Number(op.roofPitch) > 0 ? 'open' : ''}><summary>屋根勾配・庇／下屋</summary>
        <div class="row">${numField({ label: '屋根勾配（軒先の下がり補正）', path: 'op.roofPitch', unit: '寸', step: 0.5, hint: '0＝軒先を軒高と同じ高さで扱う（安全側）。入れると軒先が下がり、d/hは有利になります' })}</div>
        <label class="check"><input type="checkbox" data-bind="op.canopyOn" ${op.canopyOn ? 'checked' : ''}> 窓の上に庇・下屋がある</label>
        ${op.canopyOn ? `<div class="row two">
          ${numField({ label: `庇先端の高さ（${op.floor}FLから）`, path: 'op.canopyTip', unit: 'mm', step: 50 })}
          ${numField({ label: '庇の出', path: 'op.canopyOut', unit: 'mm', step: 50 })}
        </div>` : ''}
      </details>
      <div class="readout" data-out="parts"></div>
      ${state.openings.length > 1 ? `<button type="button" class="btn danger" id="btnDelOpening">この開口を削除</button>` : ''}
    `;
  }

  /* ---------- 結果ストリップ ---------- */
  function renderStrip() {
    const r = result, m = modeLabel();
    $('#strip').className = 'strip v-' + r.verdict;
    $('#strip').innerHTML = `
      <div class="badge">${esc(m)}：${esc(r.verdictLabel)}</div>
      <dl class="lcd">
        <div><dt>必要${esc(m)}面積</dt><dd>${isFinite(r.required) ? f(r.required, 2) : '—'}<small>㎡</small></dd></div>
        <div><dt>有効${esc(m)}面積</dt><dd>${r.ok ? f(r.effective, 2) : '—'}<small>㎡</small></dd></div>
        <div><dt>余裕</dt><dd class="mg">${r.ok ? signed(r.margin) : '—'}<small>㎡</small></dd></div>
      </dl>`;
  }

  /* ---------- SVG ---------- */
  function renderSvg() {
    const op = activeOp();
    $('#svgBox').innerHTML = LC.ui.sectionSVG(op, state.room, state, drag ? { lockXMax: drag.m.xmax } : {});
    $('#svgTitle').textContent = `断面イメージ：${op.name || '開口'}`;
  }

  /* ---------- 入力欄の派生表示 ---------- */
  function renderDerived() {
    const op = activeOp();
    const g = LC.calc.geometry(op, state);
    const set = (k, html) => { const el = document.querySelector(`[data-out="${k}"]`); if (el) el.innerHTML = html; };
    set('levels', g.lv.fl.map((y, i) => `${i + 1}FL GL+${mm(y)}`).join(' ／ ') + ` ／ 軒高 GL+${mm(g.lv.eaveH)}`);
    if (g.rw && isFinite(g.headFL) && isFinite(g.fl)) {
      set('winLevels', `窓 ${g.floor}FL+${mm(g.sill)} 〜 ${g.floor}FL+${mm(g.headFL)}（GL+${mm(g.fl + g.sill)} 〜 ${mm(g.fl + g.headFL)}）／窓中心 GL+${mm(g.centerH)}`);
    } else set('winLevels', '');
    const lines = g.parts.map(p => {
      if (!isFinite(p.d) || !isFinite(p.h)) return '';
      if (!p.valid) return `<div class="warn">${p.label}：先端が窓中心より低いため除外</div>`;
      const crit = g.critical === p && g.parts.filter(x => x.valid).length > 1;
      return `<div>${p.label}：d ${mm(p.d)} ／ h ${mm(p.h)} ／ d/h ${f(p.ratio, 3)}${crit ? ' <span class="pill">採用</span>' : ''}</div>`;
    }).join('');
    set('parts', lines);
    const card = $('#winCardBox');
    if (card) card.innerHTML = winCard(op);
  }

  function refreshChips() {
    document.querySelectorAll('[data-chips]').forEach(box => {
      const v = Number(val(box.dataset.chips));
      box.querySelectorAll('[data-choice]').forEach(b => b.classList.toggle('on', Number(b.dataset.value) === v));
    });
    document.querySelectorAll('[data-enum]').forEach(b => b.classList.toggle('on', val(b.dataset.enum) === b.dataset.value));
  }
  function syncInputs() {
    document.querySelectorAll('input[data-bind]').forEach(el => {
      if (el === document.activeElement) return;
      const v = val(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
  }

  /* ---------- 計算根拠（採光） ----------
   * skipHint が true のとき、境界距離の逆算（solveDistance）を省略する。
   * この計算は状態を何十回も複製して試すため重く、ドラッグ中に毎フレーム
   * 呼ぶと画面が重くなり「震える」体感の原因になるため、ドラッグ中は省略する。 */
  function renderBasisDaylight(skipHint) {
    const r = result, rules = R(), room = state.room;
    const z = rules.zones[room.zone] || rules.zones.residential;
    let h = `<h2>計算根拠</h2>`;

    h += `<div class="blk"><div class="bh">必要採光面積</div><div class="bl">${isFinite(r.required) ? `${esc(r.requiredBasis)} = <b>${f(r.required, 3)}㎡</b>` : '居室床面積を入力してください'}</div></div>`;

    r.openings.forEach(o => {
      h += `<div class="blk"><div class="bh">${esc(o.name)}${o.errors.length ? ' <span class="pill bad">未完成</span>' : ''}</div>`;
      o.steps.forEach(s => { h += `<div class="bl">${esc(s)}</div>`; });
      o.errors.forEach(s => { h += `<div class="bl warn">${esc(s)}</div>`; });
      o.warnings.forEach(s => { h += `<div class="bl warn">${esc(s)}</div>`; });
      h += `</div>`;
    });

    if (r.ok) {
      const okOps = r.openings.filter(o => !o.errors.length);
      const parts = okOps.map(o => f(o.effective, 3)).join(' + ');
      h += `<div class="blk total"><div class="bh">合計</div>
        <div class="bl">有効採光面積 = ${okOps.length > 1 ? parts + ' = ' : ''}<b>${f(r.effective, 3)}㎡</b></div>
        <div class="bl">余裕 = ${f(r.effective, 3)} ${MINUS} ${f(r.required, 3)} = <b>${signed(r.margin, 3)}㎡</b>（必要面積の ${signed(r.marginPct, 0)}%）</div>
        <div class="bl">窓の採光可能面積の合計 ${f(r.totalOpening, 2)}㎡ に対し、必要な平均補正係数は <b>${f(r.neededCoef, 2)}</b> 以上</div>`;
      if (skipHint) {
        h += `<div class="bl dim" id="hintSlot">（操作中は境界距離の目安計算を省略しています）</div>`;
      } else {
        const op = activeOp();
        const sol = LC.calc.solveDistance(state, op.id);
        if (sol.status === 'found') {
          const cur = Number(op.distance), d = cur - sol.mm;
          h += `<div class="bl hintline" id="hintSlot">目安：「${esc(op.name || '開口')}」の境界距離が <b>${mm(sol.mm)}mm</b> 以上で成立（現在 ${mm(cur)}mm・${d >= 0 ? `あと ${mm(d)}mm 詰められる` : `あと ${mm(-d)}mm 必要`}）。他の条件は固定した場合。</div>`;
        } else if (sol.status === 'never') {
          h += `<div class="bl hintline" id="hintSlot">目安：境界距離を伸ばしても成立しません。窓を大きく、軒の出を減らす等を検討してください。</div>`;
        } else {
          h += `<div class="bl dim" id="hintSlot"></div>`;
        }
      }
      h += `</div>`;
    }
    r.warnings.forEach(w => { h += `<div class="blk"><div class="bl warn">${esc(w)}</div></div>`; });

    const rr = rules.requiredRatios[room.ratioKey] || rules.requiredRatios['1/7'];
    h += `<div class="rulebox ${rules.isVerified() ? 'okv' : ''}">
      <div class="rb-h">${rules.isVerified() ? '法規値：照合済み' : '法規値：暫定（未照合）'}</div>
      <div class="rb-l">${esc(z.label)}：補正係数 = ${f(z.k, 1)} × d/h ${z.c < 0 ? MINUS : '+'} ${f(Math.abs(z.c), 1)}／上限 ${f(rules.maxCoefficient.value, 1)}／必要割合 ${esc(rr.label)}</div>
      <div class="rb-l">この値は条文・告示で確認してから確定してください（js/rules/daylight-rules.js を差し替え）。確認申請用の計算ではありません。</div>
    </div>
    <button type="button" class="btn" id="btnCopy">結果をテキストでコピー</button>`;
    $('#panelBasis').innerHTML = h;
  }

  /* ---------- 計算根拠（換気・排煙）----------
   * 境界距離や軒は関係ないので、窓面積×有効開口比率の積み上げだけを示す簡易版。 */
  function renderBasisSimple() {
    const r = result, m = modeLabel(), room = state.room;
    const ruleKey = state.mode, rules = LC.rules[ruleKey];
    const ratioKey = state.mode === 'ventilation' ? room.ventRatioKey : room.smokeRatioKey;
    const rr = rules.requiredRatios[ratioKey] || Object.values(rules.requiredRatios)[0];
    let h = `<h2>計算根拠</h2>`;

    h += `<div class="blk"><div class="bh">必要${esc(m)}面積</div><div class="bl">${isFinite(r.required) ? `${esc(r.requiredBasis)} = <b>${f(r.required, 3)}㎡</b>` : '居室床面積を入力してください'}</div></div>`;

    r.openings.forEach(o => {
      h += `<div class="blk"><div class="bh">${esc(o.name)}${o.errors.length ? ' <span class="pill bad">未完成</span>' : ''}</div>`;
      o.steps.forEach(s => { h += `<div class="bl">${esc(s)}</div>`; });
      o.errors.forEach(s => { h += `<div class="bl warn">${esc(s)}</div>`; });
      o.warnings.forEach(s => { h += `<div class="bl warn">${esc(s)}</div>`; });
      h += `</div>`;
    });

    if (r.ok) {
      const okOps = r.openings.filter(o => !o.errors.length);
      const parts = okOps.map(o => f(o.effective, 3)).join(' + ');
      h += `<div class="blk total"><div class="bh">合計</div>
        <div class="bl">有効${esc(m)}面積 = ${okOps.length > 1 ? parts + ' = ' : ''}<b>${f(r.effective, 3)}㎡</b></div>
        <div class="bl">余裕 = ${f(r.effective, 3)} ${MINUS} ${f(r.required, 3)} = <b>${signed(r.margin, 3)}㎡</b>（必要面積の ${signed(r.marginPct, 0)}%）</div>
      </div>`;
    }
    r.warnings.forEach(w => { h += `<div class="blk"><div class="bl warn">${esc(w)}</div></div>`; });

    h += `<div class="rulebox ${rules.isVerified() ? 'okv' : ''}">
      <div class="rb-h">${rules.isVerified() ? '法規値：照合済み' : '法規値：暫定（未照合）'}</div>
      <div class="rb-l">有効開口比率（ユーザー指定）：掃き出し窓・腰窓＝0.5／タテスベリ窓・ヨコスベリ窓＝1.0／FIX窓＝0</div>
      <div class="rb-l">必要割合 ${esc(rr.label)} は暫定です。条文・告示で確認してから確定してください（js/rules/${ruleKey}-rules.js を差し替え）。${state.mode === 'smoke' ? '排煙は天井から800mm以内にかかる高さ部分のみを有効として計算しています。' : ''}確認申請用の計算ではありません。</div>
    </div>
    <button type="button" class="btn" id="btnCopy">結果をテキストでコピー</button>`;
    $('#panelBasis').innerHTML = h;
  }

  function renderBasis(skipHint) {
    if (state.mode === 'daylight') renderBasisDaylight(skipHint);
    else renderBasisSimple();
  }

  /* ---------- 全体更新 ----------
   * lite=true（ドラッグ中）は SVG・数値表示・入力欄の派生表示だけを更新し、
   * 計算根拠（重い逆算を含む）は更新しない。ドラッグが終わったら通常更新で仕上げる。 */
  function update(lite) {
    result = currentCalc();
    renderStrip();
    renderSvg();
    renderDerived();
    if (!lite) { renderBasis(false); refreshChips(); }
    LC.store.save(state);
  }
  function renderAll() { renderBld(); renderRoom(); renderOpening(); update(); }

  /* ---------- 入力イベント ---------- */
  function applyBound(el) {
    const path = el.dataset.bind;
    const { obj, key } = resolve(path);
    if (el.type === 'checkbox') obj[key] = el.checked;
    else if (el.type === 'number') obj[key] = el.value === '' ? null : parseFloat(el.value);
    else obj[key] = el.value;
    if (path === 'room.dimX' || path === 'room.dimY') {
      const { dimX, dimY } = state.room;
      if (dimX > 0 && dimY > 0) {
        state.room.area = Math.round(dimX * dimY / 1e6 * 100) / 100;
        const a = $('#f-room-area'); if (a) a.value = state.room.area;
      }
    }
    if (path === 'op.name') {
      const tab = document.querySelector(`[data-tab="${state.active}"]`);
      if (tab) tab.textContent = el.value || '開口';
    }
  }

  document.addEventListener('input', e => {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    applyBound(el);
    if (el.dataset.bind === 'op.canopyOn') renderOpening();
    update();
  });

  /* 数値欄をタップ/クリックしたら既存の値を全選択：クリックし直さず即座に上書き入力できるようにする */
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el.matches && el.matches('input[type="number"][data-bind]')) {
      requestAnimationFrame(() => el.select());
    }
  });

  /* 階数の変更：範囲外になった窓の階を補正 */
  function setStoreys(n) {
    const b = state.bld;
    if (n === b.storeys) return;
    b.storeys = n;
    state.openings.forEach(o => { if (o.floor > n) o.floor = n; });
    renderBld(); renderOpening(); update();
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const stp = t.closest('[data-step]');
    if (stp) {
      const path = stp.dataset.step, { obj, key } = resolve(path);
      const cur = Number(obj[key]) || 0;
      let nv = cur + Number(stp.dataset.delta);
      nv = Math.max(Number(stp.dataset.min || 0), Math.round(nv * 1000) / 1000);
      obj[key] = nv;
      const inp = document.getElementById(idOf(path));
      if (inp) { inp.value = nv; applyBound(inp); }
      update();
      return;
    }
    const ch = t.closest('[data-choice]');
    if (ch) {
      const path = ch.dataset.choice, { obj, key } = resolve(path);
      obj[key] = Number(ch.dataset.value);
      const inp = document.getElementById(idOf(path)); if (inp) inp.value = obj[key];
      update(); return;
    }
    const en = t.closest('[data-enum]');
    if (en) {
      const path = en.dataset.enum, { obj, key } = resolve(path);
      obj[key] = en.dataset.value;
      if (en.dataset.enumExtra) {
        const g = LC.group(en.dataset.value);
        const { obj: obj2, key: key2 } = resolve(en.dataset.enumExtra);
        if (g.storeyOptions && !g.storeyOptions.includes(obj2[key2])) obj2[key2] = g.storeyOptions[0];
      }
      renderBld(); update(); return;
    }
    const sto = t.closest('[data-storeys]'); if (sto) { setStoreys(Number(sto.dataset.storeys)); return; }
    const fl = t.closest('[data-floor]'); if (fl) { activeOp().floor = Number(fl.dataset.floor); renderOpening(); update(); return; }
    const wt = t.closest('[data-wintype]');
    if (wt) {
      const op = activeOp(), type = LC.windows.find(wt.dataset.wintype);
      op.winType = type.id; op.w = type.w; op.h = type.h;
      renderOpening(); update(); return;
    }
    if (t.closest('[data-sizereset]')) {
      const op = activeOp(), type = LC.windows.find(op.winType);
      op.w = type.w; op.h = type.h;
      renderOpening(); update(); return;
    }
    if (t.closest('[data-headreset]')) { activeOp().headFL = 2000; syncInputs(); update(); return; }
    const tab = t.closest('[data-tab]');
    if (tab) { state.active = tab.dataset.tab; renderOpening(); update(); return; }
    if (t.closest('#btnAddOpening')) {
      const n = state.openings.length + 1;
      const src = activeOp();
      const op = Object.assign(LC.store.defaultOpening(`開口${n}`), { boundaryType: src.boundaryType, eaveOut: src.eaveOut, roofPitch: src.roofPitch, floor: src.floor });
      state.openings.push(op); state.active = op.id; renderOpening(); update(); return;
    }
    if (t.closest('#btnDelOpening')) {
      if (state.openings.length < 2) return;
      if (!confirm(`「${activeOp().name || '開口'}」を削除しますか？`)) return;
      state.openings = state.openings.filter(o => o.id !== state.active);
      state.active = state.openings[0].id; renderOpening(); update(); return;
    }
    if (t.closest('#btnCopy')) { copySummary(); return; }
    if (t.closest('#btnSettings')) { openSettings(); return; }
    if (t.closest('[data-close]')) { closeSheet(); return; }
    if (t.id === 'sheet') closeSheet();                          // 背景タップで閉じる
    if (t.id === 'btnResetAll') {
      if (!confirm('入力内容をすべて初期化します。よろしいですか？')) return;
      state = LC.store.defaults(); closeSheet(); renderAll();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  });

  /* ---------- 断面図のドラッグ操作 ----------
   * pointermove は指の動きに合わせて高頻度で発火するため、そのたびに描画すると
   * 重くなりガタつく。requestAnimationFrame で1フレームに1回へ間引き、
   * さらにドラッグ中は軽量な update(true) だけを呼ぶ。 */
  const SNAP = 50;
  const snap = v => Math.round(v / SNAP) * SNAP;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function toMM(e, m) {
    const svg = $('#svgBox svg');
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) / r.width * m.w;
    const vy = (e.clientY - r.top) / r.height * m.h;
    return { x: (vx - m.pad) / m.s + m.xmin, y: m.ymin + (m.h - m.pad - vy) / m.s };
  }
  $('#svgBox').addEventListener('pointerdown', e => {
    const hdl = e.target.closest && e.target.closest('[data-drag]');
    if (!hdl) return;
    const svg = $('#svgBox svg'), d = svg.dataset;
    const m = { s: +d.s, xmin: +d.xmin, ymin: +d.ymin, xmax: +d.xmax, w: +d.w, h: +d.h, pad: +d.pad };
    const op = activeOp(), kind = hdl.dataset.drag;
    let v0;
    if (kind === 'distance') v0 = Number(op.distance) || 0;
    else if (kind === 'eaveOut') v0 = Number(op.eaveOut) || 0;
    else {                                             // head：階をまたげるよう、絶対GL高さを基準にする
      const g = LC.calc.geometry(op, state);
      v0 = g.fl + (Number(op.headFL) || 0);
    }
    drag = { kind, m, p0: toMM(e, m), v0, pending: false };
    try { hdl.setPointerCapture(e.pointerId); } catch (err) { /* 対応していないブラウザは無視 */ }
    e.preventDefault();
  });
  $('#svgBox').addEventListener('touchstart', e => {          // ハンドルを触ったときは画面スクロールさせない
    if (e.target.closest && e.target.closest('[data-drag]')) e.preventDefault();
  }, { passive: false });

  /* 図形の中の文字をダブルクリック／ダブルタップ → 対応する入力欄にカーソルを合わせる。
   * ・開口ラベル（「開口1／腰窓」など）→「窓の種類」のチップ
   * ・境界線のラベル（「隣地境界線」など）→「境界の種類」の欄
   * 窓そのものと境界線そのものはドラッグ専用にする（ドラッグ操作と誤操作が混ざらないよう、対象を分けている）。
   * ネイティブの dblclick には頼らない：ドラッグハンドルの touchstart で preventDefault しているため、
   * スマホではタップ由来の click/dblclick が発生しないブラウザがある。代わりに pointerup の間隔で
   * 自前のダブルタップ判定を行う（マウスのダブルクリックもこの経路で拾える）。 */
  function openWindowTypeEditor() {
    const btn = document.querySelector('[data-wintype].on') || document.querySelector('[data-wintype]');
    if (btn) { if (btn.scrollIntoView) btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); btn.focus(); }
  }
  function openBoundaryTypeEditor() {
    const sel = $('#f-op-boundaryType');
    if (sel) { if (sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); sel.focus(); }
  }
  const tapAt = {};
  function doubleTap(kind, action) {
    const now = Date.now();
    if (tapAt[kind] && now - tapAt[kind] < 400) { tapAt[kind] = 0; action(); }
    else tapAt[kind] = now;
  }
  $('#svgBox').addEventListener('pointerup', e => {
    if (drag) return;                                             // ドラッグ中に指が乗っただけの場合は無視
    if (e.target.closest && e.target.closest('[data-editwintype]')) { doubleTap('wintype', openWindowTypeEditor); return; }
    if (e.target.closest && e.target.closest('[data-editboundary]')) { doubleTap('boundary', openBoundaryTypeEditor); return; }
  });

  let lastMoveEvent = null;
  function applyDragFrame() {
    if (!drag) return;
    drag.pending = false;
    const e = lastMoveEvent;
    if (!e) return;
    const op = activeOp(), p = toMM(e, drag.m);
    const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (drag.kind === 'distance') op.distance = clamp(snap(drag.v0 + dx), 0, snap(drag.m.xmax - 300));
    else if (drag.kind === 'eaveOut') op.eaveOut = clamp(snap(drag.v0 + dx), 0, Math.max(0, Number(op.distance) || 0));
    else {
      /* 窓を絶対GL高さで動かし、その高さがどの階の範囲に入るかで階を切り替える。
       * 1階の窓を2階の高さまで上げると、窓のある階が自動で2階になる。 */
      const rw = LC.calc.resolveWindow(op);
      const lv = LC.calc.levels(state.bld);
      const absHead = clamp(snap(drag.v0 + dy), rw ? rw.h : 0, lv.eaveH);
      let floor = lv.n;
      for (let i = 0; i < lv.n; i++) {
        const rangeTop = i < lv.n - 1 ? lv.fl[i + 1] : lv.eaveH;
        if (absHead < rangeTop) { floor = i + 1; break; }
      }
      const prevFloor = op.floor;
      op.floor = floor;
      op.headFL = clamp(absHead - lv.fl[floor - 1], rw ? rw.h : 0, 3500);
      if (floor !== prevFloor) renderOpening();          // 階の切り替えを開口パネルの表示にも反映
    }
    syncInputs();
    update(true);
  }
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    lastMoveEvent = e;
    if (!drag.pending) { drag.pending = true; requestAnimationFrame(applyDragFrame); }
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null; lastMoveEvent = null;
    update();                                                    // 通常更新（計算根拠の逆算を含む）で仕上げる
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', () => { drag = null; lastMoveEvent = null; update(); });

  /* ---------- シート（設定） ---------- */
  let lastFocus = null;
  function openSheet(html) {
    lastFocus = document.activeElement;
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.classList.add('noscroll');
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.classList.remove('noscroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function openSettings() {
    openSheet(`
      <div class="sh-head"><h2>設定</h2><button class="btn ghost" data-close>閉じる</button></div>
      <div class="row">${numField({ label: '「余裕小」とする余裕の割合', path: 'settings.cautionPct', unit: '%', step: 5, hint: '必要面積に対する余裕がこの割合未満なら「OK（余裕小）」と表示。法規値ではなく計画上のマージン' })}</div>
      <h3>データ</h3>
      <button class="btn danger" id="btnResetAll">入力内容をすべて初期化</button>
      <div class="bl dim">バージョン ${LC.VERSION}</div>`);
  }

  /* ---------- コピー ---------- */
  function summaryText() {
    const r = result, room = state.room, b = state.bld, lv = LC.calc.levels(b), m = modeLabel();
    const L = [];
    if (state.mode === 'daylight') {
      L.push('【採光 初期検討】※確認申請用ではありません／法規値は' + (R().isVerified() ? '照合済み' : '暫定（未照合）'));
      L.push(`${b.storeys}階建て（${lv.fl.map((y, i) => `${i + 1}FL GL+${mm(y)}`).join('、')}、軒高 GL+${mm(lv.eaveH)}）`);
      L.push(`${room.name || '居室'}：床面積 ${f(room.area, 2)}㎡（${(R().zones[room.zone] || {}).label}／必要 ${(R().requiredRatios[room.ratioKey] || {}).label}）`);
      r.openings.forEach(o => {
        if (o.errors.length) { L.push(`・${o.name}：入力不足`); return; }
        const p = o.g.critical, t = LC.windows.find(o.op.winType);
        L.push(`・${o.name}：${o.g.floor}階 ${t.label} W${mm(o.op.w)}×H${mm(o.op.h)}／窓上端 FL+${mm(o.g.headFL)}／境界${mm(o.op.distance)}・軒の出${mm(o.op.eaveOut)}／d/h ${f(p.ratio, 3)}／係数 ${f(o.coef, 3)}／有効 ${f(o.effective, 2)}㎡`);
      });
    } else {
      const rules = LC.rules[state.mode];
      L.push(`【${m} 初期検討】※確認申請用ではありません／法規値は` + (rules.isVerified() ? '照合済み' : '暫定（未照合）'));
      L.push(`${room.name || '居室'}：床面積 ${f(room.area, 2)}㎡`);
      r.openings.forEach(o => {
        if (o.errors.length) { L.push(`・${o.name}：入力不足`); return; }
        const t = LC.windows.find(o.op.winType);
        L.push(`・${o.name}：${t.label} W${mm(o.op.w)}×H${mm(o.op.h)}／有効 ${f(o.effective, 2)}㎡`);
      });
    }
    if (r.ok) L.push(`必要 ${f(r.required, 2)}㎡ ／ 有効 ${f(r.effective, 2)}㎡ ／ 余裕 ${signed(r.margin)}㎡ → ${r.verdictLabel}`);
    return L.join('\n');
  }
  function copySummary() {
    const text = summaryText();
    const done = () => toast('コピーしました');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); }
    ta.remove();
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ---------- 機能タブ（採光／換気／排煙） ---------- */
  function renderTabs() {
    $('#modeBar').innerHTML = LC.modules.map(m =>
      `<button type="button" class="mode ${m.id === state.mode ? 'on' : ''}" data-mode="${m.id}" ${m.enabled ? '' : 'disabled'}>${m.label}${m.enabled ? '' : '<small>準備中</small>'}</button>`).join('');
  }
  function switchMode(id) {
    if (id === state.mode || !LC.modules.some(m => m.id === id && m.enabled)) return;
    state.mode = id;
    renderTabs();
    renderRoom();                                                  // 居室パネルのモード別項目（用途地域／必要割合）を差し替え
    updateNotice();
    update();
  }
  document.addEventListener('click', e => {
    const mb = e.target.closest && e.target.closest('[data-mode]');
    if (mb) switchMode(mb.dataset.mode);
  });

  /* ---------- Service Worker（起動時に自動更新） ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;          // 初回インストール時はリロードしない
      reloaded = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => { reg.update(); }).catch(() => { /* file:// 等では無視 */ });
  }

  LC.VERSION = '0.5.0-prototype';
  function updateNotice() {
    const n = $('#notice'), ok = LC.rules[state.mode].isVerified();
    n.textContent = '計画初期の検討用（ツーバイフォー）。確認申請用の計算ではありません。' + (ok ? '' : '法規値は暫定（未照合）です。');
    n.className = 'notice' + (ok ? ' okv' : '');
  }
  updateNotice();
  renderTabs();
  renderAll();
  registerSW();

  /* PC/横画面レイアウトで右カラムの固定位置(top)を、実際のヘッダー高さに追随させる
   * （注記文が2行/3行に変わっても右の断面図パネルと重ならないように） */
  const topbarEl = $('.topbar');
  if (topbarEl && 'ResizeObserver' in window) {
    const syncTopbarH = () => document.documentElement.style.setProperty('--topbar-h', `${topbarEl.offsetHeight}px`);
    new ResizeObserver(syncTopbarH).observe(topbarEl);
    syncTopbarH();
  }

  /* 断面図パネル(#panelSvg)は position:fixed で画面に完全固定し、スクロールに追従させない
   * （position:sticky はブラウザのスクロール再計算に依存するため、環境によって微妙にジッターすることがある）。
   * 左端・幅は .col-out（レイアウト上の余白確保用の空き領域）の実測値をリサイズ時にだけ反映し、
   * スクロール中は一切再計算しない。 */
  const colOutEl = $('.col-out');
  if (colOutEl) {
    const syncDiagramRect = () => {
      if (!window.matchMedia('(min-width: 640px)').matches) return;
      const r = colOutEl.getBoundingClientRect();
      document.documentElement.style.setProperty('--diagram-left', `${r.left}px`);
      document.documentElement.style.setProperty('--diagram-w', `${r.width}px`);
    };
    syncDiagramRect();
    window.addEventListener('resize', syncDiagramRect);
    if ('ResizeObserver' in window) new ResizeObserver(syncDiagramRect).observe($('.col-in') || document.body);
  }
})(window.LC = window.LC || {});
