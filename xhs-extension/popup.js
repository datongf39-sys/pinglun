// ===== DualWrite 录入助手 · popup.js =====

let categories = [];

// ---- 加载所有数据 ----
function loadAll() {
  chrome.storage.local.get(['dw_pending', 'dw_stat_total', 'dw_categories'], (res) => {
    const pending    = res.dw_pending    || [];
    const totalEver  = res.dw_stat_total || 0;
    categories       = res.dw_categories || [];

    // 统计
    const todayStr   = new Date().toLocaleDateString();
    const todayCount = pending.filter(p => p.savedAt && p.savedAt.startsWith(todayStr)).length;

    document.getElementById('stat-total').innerText      = pending.length;
    document.getElementById('stat-today').innerText      = todayCount;
    document.getElementById('stat-total-ever').innerText = totalEver + pending.length;

    // 分类标签
    renderCatList();

    // 待导入列表
    const listEl    = document.getElementById('pending-list');
    const exportBtn = document.getElementById('btn-export');
    if (pending.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">暂无待导入的评论<br>去小红书划选文字试试吧 ✨</div>';
      exportBtn.disabled = true;
    } else {
      exportBtn.disabled = false;
      listEl.innerHTML = pending.map(p => `
        <div class="pending-item">
          <span class="cat-badge">${esc(p.cat || '未分类')}</span>
          <span class="txt">${esc(p.text)}</span>
        </div>
      `).join('');
    }
  });
}

// ---- 渲染分类标签 ----
function renderCatList() {
  const el = document.getElementById('cat-list');
  if (categories.length === 0) {
    el.innerHTML = '<span style="font-size:12px;color:#bbb;padding:2px 0;">还没有分类，在下方添加吧</span>';
    return;
  }
  el.innerHTML = categories.map((c, i) => `
    <div class="cat-tag-item">
      ${esc(c)}
      <span class="del" data-idx="${i}" title="删除">×</span>
    </div>
  `).join('');

  el.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      categories.splice(idx, 1);
      saveCategories();
    });
  });
}

// ---- 添加分类 ----
function addCategory() {
  const input = document.getElementById('new-cat-input');
  const name  = input.value.trim();
  if (!name) return;
  if (categories.includes(name)) { showToast('分类已存在'); return; }
  categories.push(name);
  input.value = '';
  saveCategories();
}

function saveCategories() {
  chrome.storage.local.set({ dw_categories: categories }, () => {
    renderCatList();
    showToast('✅ 分类已更新');
  });
}

// ---- 打开评论库 ----
document.getElementById('btn-open-workstation').addEventListener('click', () => {
  const url = chrome.runtime.getURL('index.html');
  chrome.tabs.query({}, (allTabs) => {
    const existing = allTabs.find(t => t.url === url);
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
      chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
    window.close();
  });
});

document.getElementById('btn-add-cat').addEventListener('click', addCategory);
document.getElementById('new-cat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCategory();
});

// ---- 生成导入代码 ----
document.getElementById('btn-export').addEventListener('click', () => {
  chrome.storage.local.get('dw_pending', (res) => {
    const pending = res.dw_pending || [];
    if (!pending.length) return;

    const newItems = pending.map(p => ({
      id: p.id || (Date.now() + Math.random()),
      cat: p.cat || '未分类',
      original: p.text,
      modified: p.text,
      status: 0,
      lastModified: p.savedAt || new Date().toLocaleString()
    }));

    const code = `(function(){const d=${JSON.stringify(newItems)};let db=JSON.parse(localStorage.getItem('dw_v15_db')||'{}');if(!db.items)db.items=[];if(!db.cats)db.cats=[];d.forEach(i=>{if(!db.cats.includes(i.cat))db.cats.push(i.cat);db.items.push(i);});localStorage.setItem('dw_v15_db',JSON.stringify(db));alert('✅ 导入成功！共 '+d.length+' 条，请刷新页面。');})();`;

    document.getElementById('import-code').value = code;
    document.getElementById('copy-code-area').style.display = 'block';
  });
});

// ---- 复制代码并清空 ----
document.getElementById('btn-copy-code').addEventListener('click', () => {
  const ta = document.getElementById('import-code');
  ta.select();
  document.execCommand('copy');
  showToast('✅ 已复制！去工作站 F12 控制台粘贴运行');

  chrome.storage.local.get(['dw_pending', 'dw_stat_total'], (res) => {
    const count = (res.dw_pending || []).length;
    chrome.storage.local.set({
      dw_pending:    [],
      dw_stat_total: (res.dw_stat_total || 0) + count
    }, loadAll);
  });
});

// ---- 清空 ----
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('确定清空所有待导入的评论？')) return;
  chrome.storage.local.set({ dw_pending: [] }, () => { showToast('已清空'); loadAll(); });
});

function showToast(msg) {
  const el = document.getElementById('toast');
  el.innerText = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadAll();
