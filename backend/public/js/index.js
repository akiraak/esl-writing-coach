const listEl = document.getElementById('article-list');
const emptyEl = document.getElementById('empty-message');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function loadArticles() {
  const res = await fetch('/api/articles');
  const articles = await res.json();
  listEl.innerHTML = '';
  emptyEl.hidden = articles.length > 0;

  for (const a of articles) {
    const li = document.createElement('li');

    const title = document.createElement('span');
    title.className = 'article-title' + (a.title ? '' : ' untitled');
    title.textContent = a.title || '(無題)';

    const date = document.createElement('span');
    date.className = 'article-date';
    date.textContent = `更新: ${formatDate(a.updated_at)}`;

    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = '削除';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`「${a.title || '(無題)'}」を削除しますか？`)) return;
      await fetch(`/api/articles/${a.id}`, { method: 'DELETE' });
      loadArticles();
    });

    li.append(title, date, del);
    li.addEventListener('click', () => {
      location.href = `/article.html?id=${a.id}`;
    });
    listEl.appendChild(li);
  }
}

document.getElementById('new-article').addEventListener('click', async () => {
  const res = await fetch('/api/articles', { method: 'POST' });
  const article = await res.json();
  location.href = `/article.html?id=${article.id}`;
});

loadArticles();
