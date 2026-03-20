// ===== DualWrite 录入助手 · background.js =====

// 评论库页面（打包在扩展内）
const WORKSTATION_URL = chrome.runtime.getURL('index.html');

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('dw_pending', (res) => {
    if (!res.dw_pending) {
      chrome.storage.local.set({ dw_pending: [], dw_stat_total: 0 });
    }
  });
});

// 查找已打开的评论库 tab（精确匹配 URL）
function findWorkstationTab(callback) {
  chrome.tabs.query({}, (allTabs) => {
    const tab = allTabs.find(t => t.url === WORKSTATION_URL);
    callback(tab || null);
  });
}

// 从工作站页面读取分类列表
function syncCatsFromWorkstation(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      try {
        const db = JSON.parse(localStorage.getItem('dw_v15_db') || '{}');
        return db.cats || [];
      } catch(e) { return []; }
    }
  }, (results) => {
    if (chrome.runtime.lastError) return;
    const cats = results && results[0] && results[0].result;
    if (cats && cats.length > 0) {
      chrome.storage.local.set({ dw_categories: cats });
    }
  });
}

// 向工作站自动导入 pending 评论
function autoImportToWorkstation(tabId) {
  chrome.storage.local.get('dw_pending', (res) => {
    const pending = res.dw_pending || [];
    if (pending.length === 0) return;

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',  // 在页面主世界执行，可直接调用 render()、showToast()
      func: (items) => {
        try {
          let db = JSON.parse(localStorage.getItem('dw_v15_db') || '{}');
          if (!db.items) db.items = [];
          if (!db.cats) db.cats = [];
          items.forEach(p => {
            const cat = p.cat || db.cats[0] || '未分类';
            if (!db.cats.includes(cat)) db.cats.push(cat);
            db.items.push({
              id: p.id || (Date.now() + Math.random()),
              cat,
              original: p.text,
              modified: p.text,
              status: 0,
              lastModified: p.savedAt || new Date().toLocaleString()
            });
          });
          localStorage.setItem('dw_v15_db', JSON.stringify(db));
          // 触发工作站实时刷新
          if (typeof render === 'function') render();
          if (typeof showToast === 'function') showToast('✅ 已导入 ' + items.length + ' 条评论！');
          return true;
        } catch(e) { return false; }
      },
      args: [pending]
    }, (results) => {
      if (chrome.runtime.lastError) return;
      const ok = results && results[0] && results[0].result;
      if (ok) {
        // 清空 pending 并累计统计
        chrome.storage.local.get('dw_stat_total', (r) => {
          chrome.storage.local.set({
            dw_pending: [],
            dw_stat_total: (r.dw_stat_total || 0) + pending.length
          });
        });
      }
    });
  });
}

// 监听来自 content.js 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_WORKSTATION') {
    findWorkstationTab((tab) => {
      if (tab) {
        // 评论库已打开，切换到它并导入
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
        autoImportToWorkstation(tab.id);
        syncCatsFromWorkstation(tab.id);
      } else {
        // 新开评论库，等加载完再导入
        chrome.tabs.create({ url: WORKSTATION_URL }, (newTab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => {
                autoImportToWorkstation(newTab.id);
                syncCatsFromWorkstation(newTab.id);
              }, 1000); // 等页面 JS 初始化完成
            }
          });
        });
      }
    });
    sendResponse({ ok: true });
  }
});

// 插件启动时同步一次分类
findWorkstationTab((tab) => {
  if (tab) syncCatsFromWorkstation(tab.id);
});
