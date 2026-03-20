// ===== DualWrite 录入助手 · popup.js =====

const WORKSTATION_URL = 'https://pinglun.onrender.com';
let categories = [];

// ---- 从评论库（pinglun.onrender.com）读取分类并同步 ----
function syncCatsFromWorkstation(onDone) {
  chrome.tabs.query({ url: WORKSTATION_URL + '/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      if (onDone) onDone(false);
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        try {
          const db = JSON.parse(localStorage.getItem('dw_v15_db') || '{}');
          return db.cats || [];
        } catch(e) { return []; }
      }
    }, (results) => {
      if (chrome.runtime.lastError) { if (onDone) onDone(false); return; }
      const cats = results && results[0] && results[0].result;
      if (cats && cats.length > 0) {
        categories = cats;
        chrome.storage.local.set({ dw_categories: cats }, () => {
          renderCatList();
          if (onDone) onDone(true, cats.length);
        });
      } else {
        if (onDone) onDone(false);
      }
    });
  });
}

// ---- 加载所有数据 ----
function loadAll() {
  // 优先从评论库实时同步分类，若评论库未开则用缓存
  syncCatsFromWorkstation(() => {});

  chrome.storage.local.get(['dw_pending', 'dw_stat_total', 'dw_categories'], (res) => {
    const pending   = res.dw_pending    || [];
    const totalEver = res.dw_stat_total || 0;
    // 若 syncCatsFromWorkstation 还没回来，先用缓存兜底
    if (categories.length === 0) categories = res.dw_categories || [];

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

// ---- 手动同步分类按钮 ----
document.getElementById('btn-sync-cats').addEventListener('click', () => {
  const btn = document.getElementById('btn-sync-cats');
  btn.textContent = '⏳';
  btn.disabled = true;
  syncCatsFromWorkstation((ok, count) => {
    btn.textContent = '🔄 同步';
    btn.disabled = false;
    if (ok) {
      showToast('✅ 已同步 ' + count + ' 个分类');
    } else {
      showToast('⚠️ 请先打开评论库再同步');
    }
  });
});

// ---- 打开评论库 ----
document.getElementById('btn-open-workstation').addEventListener('click', () => {
  const url = 'https://pinglun.onrender.com';
  chrome.tabs.query({ url: url + '/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
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
