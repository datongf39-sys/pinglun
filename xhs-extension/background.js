// ===== DualWrite 录入助手 · background.js =====

const WORKSTATION_URL = 'https://pinglun.onrender.com';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('dw_pending', (res) => {
    if (!res.dw_pending) {
      chrome.storage.local.set({ dw_pending: [], dw_stat_total: 0 });
    }
  });
});

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

// 从工作站页面自动导入 pending 评论
function autoImportToWorkstation(tabId) {
  chrome.storage.local.get('dw_pending', (res) => {
    const pending = res.dw_pending || [];
    if (pending.length === 0) return;

    chrome.scripting.executeScript({
      target: { tabId },
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
          // 触发工作站刷新
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
        // 清空 pending
        chrome.storage.local.set({ dw_pending: [] });
      }
    });
  });
}

// 监听来自 content.js 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_WORKSTATION') {
    chrome.tabs.query({ url: WORKSTATION_URL + '/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        chrome.tabs.update(tabId, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
        // 工作站已开着，直接注入导入
        autoImportToWorkstation(tabId);
        syncCatsFromWorkstation(tabId);
      } else {
        // 新开工作站，等加载完再导入
        chrome.tabs.create({ url: WORKSTATION_URL }, (tab) => {
          // 监听加载完成
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => {
                autoImportToWorkstation(tab.id);
                syncCatsFromWorkstation(tab.id);
              }, 1000); // 等工作站 JS 跑完
            }
          });
        });
      }
    });
    sendResponse({ ok: true });
  }
});

// 定期从工作站同步分类（每次插件启动时）
chrome.tabs.query({ url: WORKSTATION_URL + '/*' }, (tabs) => {
  if (tabs && tabs.length > 0) {
    syncCatsFromWorkstation(tabs[0].id);
  }
});
