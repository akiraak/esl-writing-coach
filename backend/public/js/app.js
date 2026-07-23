// ---- 要素 ----
const sidebarEl = document.getElementById('sidebar');
const sidebarToggleEl = document.getElementById('sidebar-toggle');
const sidebarToggleIconEl = document.getElementById('sidebar-toggle-icon');
const listEl = document.getElementById('article-list');
const emptyEl = document.getElementById('empty-message');
const editorEl = document.getElementById('editor');
const placeholderEl = document.getElementById('placeholder');

const rulesDialogEl = document.getElementById('rules-dialog');
const rulesButtonEl = document.getElementById('rules-button');
const rulesPreviewEl = document.getElementById('rules-preview');
const rulesEl = document.getElementById('rules');
const draftEl = document.getElementById('draft');
const correctedEl = document.getElementById('corrected');
const adviceEl = document.getElementById('advice');
const statusEl = document.getElementById('status');
const draftWordsEl = document.getElementById('draft-words');
const correctedWordsEl = document.getElementById('corrected-words');

const AUTOSAVE_DELAY_MS = 2000;
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

// ---- 状態 ----
let currentId = null; // 選択中の記事 ID（未選択は null）

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

// 空白区切りの非空トークン数（日本語の塊も 1 トークンと数える目安表示）
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function updateWordCount(el, text) {
  const n = wordCount(text);
  el.textContent = `${n} ${n === 1 ? 'word' : 'words'}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- サイドバー折りたたみ ----
function applySidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle('collapsed', collapsed);
  sidebarToggleIconEl.textContent = collapsed ? '▶' : '◀';
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}

sidebarToggleEl.addEventListener('click', () => {
  applySidebarCollapsed(!sidebarEl.classList.contains('collapsed'));
});

// ---- 記事一覧 ----
async function loadArticles() {
  const res = await fetch('/api/articles');
  const articles = await res.json();
  listEl.innerHTML = '';
  emptyEl.hidden = articles.length > 0;

  for (const a of articles) {
    const li = document.createElement('li');
    li.dataset.id = a.id;
    li.classList.toggle('active', a.id === currentId);

    const excerptText = (a.excerpt || '').replace(/\s+/g, ' ').trim();
    const excerpt = document.createElement('span');
    excerpt.className = 'article-excerpt' + (excerptText ? '' : ' untitled');
    excerpt.textContent = excerptText || '(本文なし)';

    const meta = document.createElement('span');
    meta.className = 'article-meta';

    const date = document.createElement('span');
    date.className = 'article-date';
    date.textContent = `更新: ${formatDate(a.updated_at)}`;

    const del = document.createElement('button');
    del.className = 'btn btn-danger btn-small';
    del.textContent = '削除';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('この記事を削除しますか？')) return;
      await fetch(`/api/articles/${a.id}`, { method: 'DELETE' });
      if (a.id === currentId) closeArticle();
      loadArticles();
    });

    meta.append(date, del);
    li.append(excerpt, meta);
    li.addEventListener('click', () => selectArticle(a.id));
    listEl.appendChild(li);
  }
}

function highlightActive() {
  for (const li of listEl.children) {
    li.classList.toggle('active', Number(li.dataset.id) === currentId);
  }
}

// ---- 記事の選択・ロード ----

// 切り替え・削除の前に、保留中の autosave があれば旧記事の内容を即時保存する
function flushPendingSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (currentId === null) return;
  const id = currentId;
  const body = JSON.stringify({ rules: rulesEl.value, draft: draftEl.value });
  fetch(`/api/articles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(() => loadArticles()).catch((err) => console.error(err));
}

function closeArticle() {
  flushPendingSave();
  currentId = null;
  dirtyWhileSaving = false;
  correctAgain = false;
  lastCorrectedDraft = null;
  editorEl.hidden = true;
  placeholderEl.hidden = false;
  setStatus('');
  history.replaceState(null, '', '/');
  highlightActive();
}

async function selectArticle(id) {
  if (id === currentId) return;
  flushPendingSave();
  dirtyWhileSaving = false;
  correctAgain = false;
  lastCorrectedDraft = null;

  const res = await fetch(`/api/articles/${id}`);
  if (!res.ok) {
    closeArticle();
    loadArticles();
    return;
  }
  const a = await res.json();
  currentId = id;
  rulesEl.value = a.rules;
  updateRulesPreview();
  draftEl.value = a.draft;
  correctedEl.textContent = a.corrected;
  adviceEl.textContent = a.advice;
  updateWordCount(draftWordsEl, a.draft);
  updateWordCount(correctedWordsEl, a.corrected);
  if (a.corrected_at) {
    // 保存済み内容が最後の添削対象だったとみなし、変更がない限り再添削しない
    lastCorrectedDraft = correctionKey();
  }
  editorEl.hidden = false;
  placeholderEl.hidden = true;
  setStatus('');
  history.replaceState(null, '', `/?id=${id}`);
  highlightActive();
}

// ---- 自動保存・添削 ----
function scheduleSave() {
  if (currentId === null) return;
  setStatus('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, AUTOSAVE_DELAY_MS);
}

async function save() {
  saveTimer = null;
  if (currentId === null) return;
  if (saving) {
    dirtyWhileSaving = true;
    return;
  }
  const id = currentId;
  saving = true;
  setStatus('保存中…', 'busy');
  try {
    const res = await fetch(`/api/articles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rules: rulesEl.value,
        draft: draftEl.value,
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    if (id === currentId) setStatus('保存しました');
  } catch (err) {
    console.error(err);
    if (id === currentId) setStatus('保存に失敗しました', 'error');
    saving = false;
    return;
  }
  saving = false;
  loadArticles(); // excerpt・更新日時を一覧へ反映
  if (id !== currentId) return; // 保存中に記事が切り替わった
  if (dirtyWhileSaving) {
    dirtyWhileSaving = false;
    scheduleSave();
    return;
  }
  runCorrection();
}

async function runCorrection() {
  if (currentId === null) return;
  if (draftEl.value.trim() === '') return;
  if (correctionKey() === lastCorrectedDraft) return; // 前回添削から変化なし
  if (correcting) {
    correctAgain = true;
    return;
  }
  const id = currentId;
  correcting = true;
  setStatus('添削中…', 'busy');
  try {
    const key = correctionKey();
    const res = await fetch(`/api/articles/${id}/correct`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `correction failed: ${res.status}`);
    }
    const a = await res.json();
    if (id === currentId) {
      correctedEl.textContent = a.corrected;
      adviceEl.textContent = a.advice;
      updateWordCount(correctedWordsEl, a.corrected);
      lastCorrectedDraft = key;
      setStatus('添削しました');
    }
  } catch (err) {
    console.error(err);
    if (id === currentId) setStatus('添削に失敗しました', 'error');
  }
  correcting = false;
  if (correctAgain) {
    correctAgain = false;
    // 添削中に保存された最新内容で再実行（保存は済んでいる前提）
    if (id === currentId) runCorrection();
  }
}

for (const el of [rulesEl, draftEl]) {
  el.addEventListener('input', scheduleSave);
}
draftEl.addEventListener('input', () => updateWordCount(draftWordsEl, draftEl.value));

// ---- AIルールのダイアログ ----
function updateRulesPreview() {
  const firstLine = (rulesEl.value.trim().split('\n')[0] ?? '').trim();
  rulesPreviewEl.textContent = firstLine || '未設定';
  rulesPreviewEl.classList.toggle('empty', firstLine === '');
}

let pulseRulesButtonOnClose = false; // 新規作成直後の初回クローズでボタンを強調する

// ボタンの位置からダイアログ中心へ広がるアニメーション（開始座標が実行時依存なので JS で再生）
function openRulesDialog() {
  rulesDialogEl.showModal();
  const btn = rulesButtonEl.getBoundingClientRect();
  const dlg = rulesDialogEl.getBoundingClientRect();
  const dx = btn.left + btn.width / 2 - (dlg.left + dlg.width / 2);
  const dy = btn.top + btn.height / 2 - (dlg.top + dlg.height / 2);
  rulesDialogEl.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${btn.width / dlg.width})`, opacity: 0.3 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
  );
  rulesEl.focus();
}

rulesEl.addEventListener('input', updateRulesPreview);
rulesButtonEl.addEventListener('click', openRulesDialog);
document.getElementById('rules-close').addEventListener('click', () => rulesDialogEl.close());

// backdrop クリックで閉じる（内側クリックは e.target が子要素になる）
rulesDialogEl.addEventListener('click', (e) => {
  if (e.target === rulesDialogEl) rulesDialogEl.close();
});

// 閉じたら（閉じるボタン・Esc・backdrop 共通）保留中の autosave を待たず即保存 → 添削
rulesDialogEl.addEventListener('close', () => {
  if (pulseRulesButtonOnClose) {
    pulseRulesButtonOnClose = false;
    rulesButtonEl.classList.add('pulse');
  }
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    save();
  }
});
rulesButtonEl.addEventListener('animationend', () => rulesButtonEl.classList.remove('pulse'));

// ---- 新規作成 ----
document.getElementById('new-article').addEventListener('click', async () => {
  const res = await fetch('/api/articles', { method: 'POST' });
  const article = await res.json();
  await loadArticles();
  await selectArticle(article.id);
  // 新規作成直後はまずルールを設定してほしいので、ダイアログを開いておく
  // 閉じたときはボタンをパルスさせて「ルールはここ」と場所を教える
  pulseRulesButtonOnClose = true;
  openRulesDialog();
});

// ---- 初期化 ----
applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');

(async () => {
  await loadArticles();
  const id = Number.parseInt(new URLSearchParams(location.search).get('id') ?? '', 10);
  if (Number.isInteger(id) && id > 0) {
    await selectArticle(id);
  }
})();
