// ===== 评论库页面 content script =====
// 运行在 pinglun.onrender.com，负责把分类实时同步给插件

function pushCats() {
  try {
    const db = JSON.parse(localStorage.getItem('dw_v15_db') || '{}');
    const cats = db.cats || [];
    chrome.runtime.sendMessage({ type: 'SYNC_CATS', cats });
  } catch(e) {}
}

// 页面加载时同步一次
pushCats();

// 拦截 localStorage.setItem，分类变动时实时推送
const _setItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  _setItem(key, value);
  if (key === 'dw_v15_db') pushCats();
};
