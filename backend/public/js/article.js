const params = new URLSearchParams(location.search);
const articleId = Number.parseInt(params.get('id') ?? '', 10);
if (!Number.isInteger(articleId) || articleId <= 0) {
  location.href = '/';
}

const titleEl = document.getElementById('title');
const rulesEl = document.getElementById('rules');
const draftEl = document.getElementById('draft');
const correctedEl = document.getElementById('corrected');
const adviceEl = document.getElementById('advice');
const statusEl = document.getElementById('status');

const AUTOSAVE_DELAY_MS = 2000;

let saveTimer = null;
let saving = false;
let dirtyWhileSaving = false;

let correcting = false;
let correctAgain = false; // 添削中に再度発火したら、完了後に最新内容で 1 回だけ再実行
let lastCorrectedDraft = null; // 前回添削時の draft + rules（変化がなければ添削スキップ）

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${cls}`;
}

function correctionKey() {
  return JSON.stringify([rulesEl.value, draftEl.value]);
}

async function load() {
  const res = await fetch(`/api/articles/${articleId}`);
  if (!res.ok) {
    location.href = '/';
    return;
  }
  const a = await res.json();
  titleEl.value = a.title;
  rulesEl.value = a.rules;
  draftEl.value = a.draft;
  correctedEl.textContent = a.corrected;
  adviceEl.textContent = a.advice;
  if (a.corrected_at) {
    // 保存済み内容が最後の添削対象だったとみなし、変更がない限り再添削しない
    lastCorrectedDraft = correctionKey();
  }
}

function scheduleSave() {
  setStatus('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, AUTOSAVE_DELAY_MS);
}

async function save() {
  if (saving) {
    dirtyWhileSaving = true;
    return;
  }
  saving = true;
  setStatus('保存中…', 'busy');
  try {
    const res = await fetch(`/api/articles/${articleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleEl.value,
        rules: rulesEl.value,
        draft: draftEl.value,
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    setStatus('保存しました');
  } catch (err) {
    console.error(err);
    setStatus('保存に失敗しました', 'error');
    saving = false;
    return;
  }
  saving = false;
  if (dirtyWhileSaving) {
    dirtyWhileSaving = false;
    scheduleSave();
    return;
  }
  runCorrection();
}

async function runCorrection() {
  if (draftEl.value.trim() === '') return;
  if (correctionKey() === lastCorrectedDraft) return; // 前回添削から変化なし
  if (correcting) {
    correctAgain = true;
    return;
  }
  correcting = true;
  setStatus('添削中…', 'busy');
  try {
    const key = correctionKey();
    const res = await fetch(`/api/articles/${articleId}/correct`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `correction failed: ${res.status}`);
    }
    const a = await res.json();
    correctedEl.textContent = a.corrected;
    adviceEl.textContent = a.advice;
    lastCorrectedDraft = key;
    setStatus('添削しました');
  } catch (err) {
    console.error(err);
    setStatus('添削に失敗しました', 'error');
  }
  correcting = false;
  if (correctAgain) {
    correctAgain = false;
    // 添削中に保存された最新内容で再実行（保存は済んでいる前提）
    runCorrection();
  }
}

for (const el of [titleEl, rulesEl, draftEl]) {
  el.addEventListener('input', scheduleSave);
}

load();
