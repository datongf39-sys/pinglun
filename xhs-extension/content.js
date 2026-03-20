// ===== DualWrite 评论录入助手 · content.js =====

(function () {
  if (window.__dualWriteInjected) return;
  window.__dualWriteInjected = true;

  function storageGet(keys, cb) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, cb);
      } else { cb({}); }
    } catch(e) { cb({}); }
  }
  function storageSet(obj, cb) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, cb || function(){});
      }
    } catch(e) {}
  }

  let currentCat = '';
  let categories = [];
  let catMenu = null;

  function syncCategories() {
    storageGet('dw_categories', (res) => {
      categories = (res.dw_categories && res.dw_categories.length > 0)
        ? res.dw_categories : ['未分类'];
      if (!currentCat || !categories.includes(currentCat)) currentCat = categories[0];
    });
  }
  syncCategories();

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.dw_categories) {
        categories = changes.dw_categories.newValue || categories;
        if (!categories.includes(currentCat)) currentCat = categories[0];
      }
    });
  } catch(e) {}

  // ====================================================
  // 主评论：注入录入按钮到 .interactions
  // ====================================================
  function injectMainButtons() {
    document.querySelectorAll('div.parent-comment').forEach(block => {
      if (block.__dw_injected) return;
      block.__dw_injected = true;

      const mainItem = block.querySelector(':scope > div.comment-item');
      if (!mainItem) return;
      const interactions = mainItem.querySelector('.interactions');
      if (!interactions || interactions.__dw_btn) return;
      interactions.__dw_btn = true;

      const btn = makeRecordBtn(() => recordBlock(block));
      interactions.appendChild(btn);
    });
  }

  // ====================================================
  // 子回复：点击整行切换高亮选中
  // ====================================================
  function injectSubSelection() {
    document.querySelectorAll('div.reply-container .comment-item-sub').forEach(sub => {
      if (sub.__dw_sel_injected) return;
      const inner = sub.querySelector('.comment-inner-container');
      if (!inner) return;
      sub.__dw_sel_injected = true;
      sub.__dw_selected = false;

      inner.style.cursor = 'pointer';
      inner.title = '点击选中，再点取消，然后点主评论📥录入';

      inner.addEventListener('click', (e) => {
        // 不拦截链接、图片、按钮等原有交互
        if (e.target.closest('a, button, img, svg')) return;
        e.stopPropagation();
        sub.__dw_selected = !sub.__dw_selected;
        updateSubStyle(sub);
      });
    });
  }

  function updateSubStyle(sub) {
    const inner = sub.querySelector('.comment-inner-container');
    if (!inner) return;
    if (sub.__dw_selected) {
      inner.style.background = 'rgba(255,71,87,0.08)';
      inner.style.borderRadius = '8px';
      inner.style.outline = '1.5px solid rgba(255,71,87,0.35)';
    } else {
      inner.style.background = '';
      inner.style.borderRadius = '';
      inner.style.outline = '';
    }
  }

  function injectAll() {
    injectMainButtons();
    injectSubSelection();
  }

  // ====================================================
  // 录入：主评论 + 选中的子回复
  // ====================================================
  function makeRecordBtn(onClick) {
    const btn = document.createElement('button');
    btn.className = '__dw_inject_btn';
    btn.innerHTML = '📥';
    btn.title = '录入（右键换分类）';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showCatMenu(e, btn, onClick);
    });
    return btn;
  }

  function recordBlock(block) {
    const speakers = ['A','B','C','D','E','F','G','H'];
    const lines = [];

    const mainNote = block.querySelector(':scope > div.comment-item .note-text');
    if (mainNote) {
      const txt = getCleanText(mainNote);
      if (txt) lines.push(txt);
    }

    block.querySelectorAll('div.reply-container .comment-item-sub').forEach(sub => {
      if (sub.__dw_selected) {
        const note = sub.querySelector('.note-text');
        if (note) {
          const txt = getCleanText(note);
          if (txt) lines.push(txt);
        }
        // 录完清除选中
        sub.__dw_selected = false;
        updateSubStyle(sub);
      }
    });

    if (lines.length === 0) { showToast('未找到内容'); return; }

    const text = lines.length === 1
      ? lines[0]
      : lines.map((l, i) => (speakers[i] || String.fromCharCode(65+i)) + '：' + l).join('\n');

    saveComment(text);
  }

  function getCleanText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('button, .expand, [class*="expand"]').forEach(n => n.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  // ====================================================
  // 分类菜单
  // ====================================================
  function showCatMenu(e, btnEl, onConfirm) {
    hideCatMenu();
    catMenu = document.createElement('div');
    catMenu.id = '__dw_cat_menu';

    const header = document.createElement('div');
    header.className = '__dw_cat_header';
    header.innerText = '选择分类后录入';
    catMenu.appendChild(header);

    categories.forEach(c => {
      const item = document.createElement('div');
      item.className = '__dw_cat_item' + (c === currentCat ? ' active' : '');
      item.innerText = c;
      item.addEventListener('mousedown', ev => ev.preventDefault());
      item.addEventListener('click', () => {
        currentCat = c;
        hideCatMenu();
        onConfirm();
      });
      catMenu.appendChild(item);
    });

    document.body.appendChild(catMenu);

    const rect = btnEl.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top  = rect.bottom + window.scrollY + 6;
    if (left + 160 > window.innerWidth) left = window.innerWidth - 168;
    catMenu.style.left = left + 'px';
    catMenu.style.top  = top  + 'px';
  }

  function hideCatMenu() {
    if (catMenu) { catMenu.remove(); catMenu = null; }
  }

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('#__dw_cat_menu, .__dw_inject_btn')) return;
    hideCatMenu();
  });

  // ====================================================
  // 存储 & Toast
  // ====================================================
  function saveComment(text) {
    storageGet('dw_pending', (res) => {
      const pending = res.dw_pending || [];
      pending.push({
        id: Date.now() + Math.random(),
        text, cat: currentCat,
        source: location.href,
        savedAt: new Date().toLocaleString()
      });
      storageSet({ dw_pending: pending }, () => {
        showToast('✅ 已录入「' + currentCat + '」，正在打开工作站...');
        // 通知 background 打开工作站
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_WORKSTATION' });
        } catch(e) {}
      });
    });
  }

  function showToast(msg) {
    document.querySelectorAll('#__dw_toast').forEach(el => el.remove());
    const t = document.createElement('div');
    t.id = '__dw_toast'; t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ====================================================
  // MutationObserver
  // ====================================================
  function startObserver() {
    injectAll();
    const observer = new MutationObserver(() => injectAll());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

})();
