// ---- 要素 ----
const sidebarEl = document.getElementById('sidebar');
const sidebarToggleEl = document.getElementById('sidebar-toggle');
const sidebarToggleIconEl = document.getElementById('sidebar-toggle-icon');
const menuButtonEl = document.getElementById('menu-button');
const sidebarDimEl = document.getElementById('sidebar-dim');
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

// fetch 失敗の表示用の理由。原因特定できるようステータス欄に添える
function failReason(err) {
  return /^HTTP \d+$/.test(err?.message ?? '') ? err.message : '通信エラー';
}

// ---- Cloudflare Access セッション切れの自動リカバリ ----
// セッションが切れると Access は API への fetch にも別オリジン
// （cloudflareaccess.com）への 302 を返し、fetch は CORS エラー（TypeError）になる。
// 検知したら編集中の内容を退避してリロードし、Access の再認証フローに乗せる
const PENDING_EDITS_KEY = 'pendingEdits';

function stashPendingEdits() {
  if (currentId === null) return;
  localStorage.setItem(PENDING_EDITS_KEY, JSON.stringify({
    id: currentId,
    rules: rulesEl.value,
    draft: draftEl.value,
  }));
}

async function isAccessSessionExpired() {
  try {
    const res = await fetch('/api/me', { redirect: 'manual', cache: 'no-store' });
    return res.type === 'opaqueredirect';
  } catch {
    return false; // probe 自体が通らない = サーバ不達（本当の通信エラー）
  }
}

const REAUTH_RELOAD_AT_KEY = 'reauthReloadAt';

function reloadForReauth() {
  // 直前にもリロードしていたら、再認証してもセッションが即失効している
  // （Access の Session Duration が「No duration, expires immediately」等）。
  // リロードループにせず設定の問題として案内する
  const last = Number(sessionStorage.getItem(REAUTH_RELOAD_AT_KEY) ?? '0');
  if (Date.now() - last < 30_000) {
    setStatus('ログインセッションが維持できません。Cloudflare Access の Session Duration 設定を確認してください', 'error');
    return;
  }
  sessionStorage.setItem(REAUTH_RELOAD_AT_KEY, String(Date.now()));
  stashPendingEdits();
  setStatus('ログインの有効期限が切れたため再読み込みします…', 'busy');
  location.reload();
}

// API 呼び出しは全てこれを通す
async function apiFetch(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (await isAccessSessionExpired()) {
      reloadForReauth();
      return new Promise(() => {}); // リロードが始まるまで後続処理を止める
    }
    throw err;
  }
  if (res.redirected && new URL(res.url).origin !== location.origin) {
    reloadForReauth();
    return new Promise(() => {});
  }
  return res;
}

// bfcache から復元されたタブはセッションだけ切れていることがあるので先回りで確認
window.addEventListener('pageshow', async (e) => {
  if (!e.persisted) return;
  if (await isAccessSessionExpired()) reloadForReauth();
});

// セッション切れリロード前に退避した編集内容を復元する（初期化の記事選択後に呼ぶ）
function restorePendingEdits() {
  const raw = localStorage.getItem(PENDING_EDITS_KEY);
  if (!raw) return;
  localStorage.removeItem(PENDING_EDITS_KEY);
  let saved;
  try { saved = JSON.parse(raw); } catch { return; }
  if (saved.id !== currentId) return;
  if (saved.rules === rulesEl.value && saved.draft === draftEl.value) return;
  rulesEl.value = saved.rules;
  updateRulesPreview();
  draftEl.value = saved.draft;
  updateWordCount(draftWordsEl, saved.draft);
  scheduleSave();
}

// ---- 確認ダイアログ（confirm() の代替） ----
// ブラウザ標準の confirm() は連続表示で「ダイアログを表示しない」チェックが付き、
// 一度チェックされると以後常にキャンセル扱いになって削除が無反応になるため使わない
const confirmDialogEl = document.getElementById('confirm-dialog');
const confirmMessageEl = document.getElementById('confirm-message');
let confirmResolve = null;

function confirmDialog(message) {
  confirmMessageEl.textContent = message;
  confirmDialogEl.showModal();
  return new Promise((resolve) => { confirmResolve = resolve; });
}

function settleConfirm(result) {
  if (confirmResolve === null) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve(result);
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  settleConfirm(true);
  confirmDialogEl.close();
});
document.getElementById('confirm-cancel').addEventListener('click', () => confirmDialogEl.close());
// Esc・backdrop クリック・キャンセルボタン共通でキャンセル扱い
confirmDialogEl.addEventListener('close', () => settleConfirm(false));
confirmDialogEl.addEventListener('click', (e) => {
  if (e.target === confirmDialogEl) confirmDialogEl.close();
});

// 空白区切りの非空トークン数（日本語の塊も 1 トークンと数える目安表示）
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// AI 出力を Markdown として整形表示する。コピペで拾えるのはレンダリング後の
// 表示テキストのみ（** などの記法は残らない）。挿入前に DOMPurify を通す
function renderMarkdown(el, text) {
  const html = marked.parse(text ?? '', { breaks: true, gfm: true });
  el.innerHTML = DOMPurify.sanitize(html);
  return el.textContent; // 語数カウント用の表示テキスト
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

// ---- サイドバー折りたたみ（デスクトップ）----
// collapsed（幅 0 化）と drawer-open（モバイルのドロワー）は独立したクラスで、
// collapsed はモバイル幅では CSS 側で無効化される
function applySidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle('collapsed', collapsed);
  sidebarToggleIconEl.textContent = collapsed ? '▶' : '◀';
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}

sidebarToggleEl.addEventListener('click', () => {
  applySidebarCollapsed(!sidebarEl.classList.contains('collapsed'));
});

// ---- サイドバーのドロワー（モバイル）----
const mobileMedia = window.matchMedia('(max-width: 640px)');

function openDrawer() {
  sidebarEl.classList.add('drawer-open');
  sidebarDimEl.classList.add('visible');
}

function closeDrawer() {
  sidebarEl.classList.remove('drawer-open');
  sidebarDimEl.classList.remove('visible');
}

menuButtonEl.addEventListener('click', openDrawer);
sidebarDimEl.addEventListener('click', closeDrawer);

// デスクトップ幅へ戻ったらドロワー状態をリセットする（状態が混ざらないように）
mobileMedia.addEventListener('change', (e) => {
  if (!e.matches) closeDrawer();
});

// ---- 記事一覧 ----

// li の生成は記事ごとに一度だけ。以降は updateArticleLi() で中身だけ差し替える
function buildArticleLi(id) {
  const li = document.createElement('li');
  li.dataset.id = id;

  const excerpt = document.createElement('span');
  excerpt.className = 'article-excerpt';

  const meta = document.createElement('span');
  meta.className = 'article-meta';

  const date = document.createElement('span');
  date.className = 'article-date';

  const del = document.createElement('button');
  del.className = 'btn btn-danger btn-small';
  del.textContent = '削除';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!(await confirmDialog('この記事を削除しますか？'))) return;
    try {
      const res = await apiFetch(`/api/articles/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error(err);
      setStatus(`削除に失敗しました（${failReason(err)}）`, 'error');
      return;
    }
    if (id === currentId) closeArticle();
    loadArticles();
  });

  meta.append(date, del);
  li.append(excerpt, meta);
  li.addEventListener('click', () => selectArticle(id));
  return li;
}

function updateArticleLi(li, a) {
  const excerptText = (a.excerpt || '').replace(/\s+/g, ' ').trim();
  const excerpt = li.querySelector('.article-excerpt');
  excerpt.textContent = excerptText || '(本文なし)';
  excerpt.classList.toggle('untitled', excerptText === '');
  li.querySelector('.article-date').textContent = `更新: ${formatDate(a.updated_at)}`;
  li.classList.toggle('active', a.id === currentId);
}

// 一覧は全再構築せず id ベースの差分更新にする。innerHTML での作り直しは
// クリック（mousedown → mouseup）の途中で要素が消え、自動保存のタイミングと
// 重なると「押しても反応しない」原因になる
async function loadArticles() {
  const res = await apiFetch('/api/articles');
  const articles = await res.json();
  emptyEl.hidden = articles.length > 0;

  const existing = new Map();
  for (const li of listEl.children) existing.set(li.dataset.id, li);

  articles.forEach((a, i) => {
    let li = existing.get(String(a.id));
    if (li) existing.delete(String(a.id));
    else li = buildArticleLi(a.id);
    updateArticleLi(li, a);
    // 位置が既に正しい li は動かさない（移動もクリックを失わせるため）
    const ref = listEl.children[i] ?? null;
    if (ref !== li) listEl.insertBefore(li, ref);
  });
  for (const li of existing.values()) li.remove();
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
  apiFetch(`/api/articles/${id}`, {
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

  const res = await apiFetch(`/api/articles/${id}`);
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
  const correctedText = renderMarkdown(correctedEl, a.corrected);
  renderMarkdown(adviceEl, a.advice);
  updateWordCount(draftWordsEl, a.draft);
  updateWordCount(correctedWordsEl, correctedText);
  if (a.corrected_at) {
    // 保存済み内容が最後の添削対象だったとみなし、変更がない限り再添削しない
    lastCorrectedDraft = correctionKey();
  }
  editorEl.hidden = false;
  placeholderEl.hidden = true;
  setStatus('');
  history.replaceState(null, '', `/?id=${id}`);
  highlightActive();
  closeDrawer(); // モバイルでは記事を開いたらドロワーを閉じてエディタを見せる
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
    const res = await apiFetch(`/api/articles/${id}`, {
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
    const res = await apiFetch(`/api/articles/${id}/correct`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `correction failed: ${res.status}`);
    }
    const a = await res.json();
    if (id === currentId) {
      const correctedText = renderMarkdown(correctedEl, a.corrected);
      renderMarkdown(adviceEl, a.advice);
      updateWordCount(correctedWordsEl, correctedText);
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
  let article;
  try {
    const res = await apiFetch('/api/articles', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    article = await res.json();
  } catch (err) {
    // サーバ停止・ネットワーク断などで無言のまま「反応しない」ように見えないようにする
    console.error(err);
    setStatus(`記事の作成に失敗しました（${failReason(err)}）`, 'error');
    return;
  }
  await loadArticles();
  await selectArticle(article.id);
  // 新規作成直後はまずルールを設定してほしいので、ダイアログを開いておく
  // 閉じたときはボタンをパルスさせて「ルールはここ」と場所を教える
  pulseRulesButtonOnClose = true;
  openRulesDialog();
});

// ---- ログイン中ユーザー ----
async function loadMe() {
  try {
    const res = await apiFetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    const infoEl = document.getElementById('user-info');
    const emailEl = document.getElementById('user-email');
    emailEl.textContent = me.email;
    emailEl.title = me.email;
    // ログアウトは Cloudflare 経由時のみ機能する（DEV フォールバック時は logoutUrl が null）
    document.getElementById('logout-link').hidden = !me.logoutUrl;
    infoEl.hidden = false;
  } catch (err) {
    console.error(err);
  }
}

// ---- 初期化 ----
applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
loadMe();

(async () => {
  await loadArticles();
  const id = Number.parseInt(new URLSearchParams(location.search).get('id') ?? '', 10);
  if (Number.isInteger(id) && id > 0) {
    await selectArticle(id);
  }
  restorePendingEdits(); // セッション切れリロード前の書きかけがあれば復元
  // モバイルは常に「閉」で開始し、記事未選択のときだけ一覧を見せる
  if (mobileMedia.matches && currentId === null) openDrawer();
})();
