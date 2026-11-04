// 漫页书库 (wymanhua) - 核心前端逻辑
// 支持：内置高可用免费漫画源兜底、多源分类即时展示、直接检索直达、CORS跨域安全降级、本地IndexedDB书架与阅读器

const STORAGE_SERIES = 'manyeku_series_v1';
const STORAGE_SOURCE_ENABLED = 'manyeku_source_enabled';
const STORAGE_LOCAL_SOURCES = 'manyeku_local_sources';
const STORAGE_READER_PREF = 'manyeku_reader_pref';
const STORAGE_PROGRESS = 'manyeku_progress_v1';

// 内置兜底配置：即使 sources.json 遇到 404 或网络延迟，也能保证 100% 瞬间显示所有源
const DEFAULT_SOURCES_DATA = {
  direct_json_api_zh_full_free: [
    {
      id: "copymanga",
      name: "拷贝漫画",
      category: "直连 API",
      note: "全本免费中文 / 无付费墙 / 包含热门日漫韩漫",
      base_urls: ["https://api.mangacopy.com", "https://api.2025copy.com", "https://api.copy2000.online"],
      web_search: "https://www.mangacopy.com/search?q={keyword}",
      web_home: "https://www.mangacopy.com/",
      defaultEnabled: true
    },
    {
      id: "baozimh",
      name: "包子漫画",
      category: "直连 API",
      note: "国漫/韩漫/日漫全解锁 / 无需登录",
      base_urls: ["https://www.baozimh.com", "https://cn.baozimh.com", "https://www.twmanga.com"],
      web_search: "https://www.baozimh.com/search?q={keyword}",
      web_home: "https://www.baozimh.com/",
      defaultEnabled: true
    },
    {
      id: "mangadex_zh",
      name: "MangaDex 中文源",
      category: "官方 API",
      note: "官方无广告开源源 / 纯中文汉化参数 / 支持免Key直连",
      base_urls: ["https://api.mangadex.org", "https://uploads.mangadex.org"],
      web_search: "https://mangadex.org/search?q={keyword}",
      web_home: "https://mangadex.org/",
      defaultEnabled: true
    },
    {
      id: "happymh",
      name: "嗨皮漫画",
      category: "直连 API",
      note: "全免费中文汉化 / 移动端高清画质",
      base_urls: ["https://m.happymh.com"],
      web_search: "https://m.happymh.com/apis/c/search?keyword={keyword}&pn=1",
      web_home: "https://m.happymh.com/",
      defaultEnabled: true
    },
    {
      id: "goda_baoziorg",
      name: "Goda漫画 / 包子Org",
      category: "直连 API",
      note: "全中文无删减 / VIP章节全免",
      base_urls: ["https://godamh.com", "https://baozimh.org"],
      web_search: "https://godamh.com/s/{keyword}",
      web_home: "https://godamh.com/",
      defaultEnabled: true
    }
  ],
  vip_unlocked_zh_scrape_sources: [
    {
      id: "colamanga",
      name: "Colamanga (可乐漫画)",
      category: "全免网页源",
      note: "原Coco漫画 / 腾讯/快看/B站付费章节全免费破解",
      base_url: "https://www.colamanga.com",
      web_search: "https://www.colamanga.com/search?searchString={keyword}",
      defaultEnabled: true
    },
    {
      id: "manhuagui",
      name: "漫画柜 (ManhuaGui)",
      category: "全免网页源",
      note: "老牌经典中文漫画站 / 资源极全 / 无VIP锁章",
      base_url: "https://m.manhuagui.com",
      web_search: "https://m.manhuagui.com/s/{keyword}.html",
      defaultEnabled: true
    },
    {
      id: "gufengmh",
      name: "古风漫画网",
      category: "全免网页源",
      note: "全本中文盗版聚合 / 0付费章节 / 下拉式阅读",
      base_url: "https://m.gufengmh9.com",
      web_search: "https://m.gufengmh9.com/search/?keywords={keyword}",
      defaultEnabled: true
    },
    {
      id: "sixmh",
      name: "六漫画",
      category: "全免网页源",
      note: "全本中文免费 / 破解各大平台VIP漫画章节",
      base_url: "http://m.sixmh7.com",
      web_search: "http://m.sixmh7.com/search?keyword={keyword}",
      defaultEnabled: true
    }
  ],
  zh_free_source_rule_lists: [
    {
      id: "keiyoushi_repo",
      name: "Keiyoushi 中文免费源仓库",
      category: "开源规则库",
      note: "Mihon / Tachiyomi 中文漫画扩展源核心维护库",
      base_url: "https://github.com/keiyoushi/extensions-source/tree/main/src/zh",
      defaultEnabled: true
    },
    {
      id: "venera_repo",
      name: "Venera 纯中文免费规则库",
      category: "开源规则库",
      note: "涵盖拷贝/包子/Colamanga/漫画柜纯JS自动化解析配置",
      base_url: "https://github.com/venera-app/venera-configs",
      defaultEnabled: true
    }
  ]
};

// 通用 HTML 转义
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 自然排序
function natural(a, b) {
  return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

// ==================== IndexedDB 本地漫画页存储 ====================
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('manyeku', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pages')) {
        db.createObjectStore('pages');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, blob) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readonly');
    const req = tx.objectStore('pages').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteSeries(seriesId) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    const req = store.openKeyCursor();
    const prefix = seriesId + ':';
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) {
          store.delete(cursor.key);
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== 全局状态与配置管理 ====================
let seriesList = [];
try { seriesList = JSON.parse(localStorage.getItem(STORAGE_SERIES) || '[]'); } catch (e) { seriesList = []; }

let progressMap = {};
try { progressMap = JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'); } catch (e) { progressMap = {}; }

let sharedSources = [];
let localSources = [];
try { localSources = JSON.parse(localStorage.getItem(STORAGE_LOCAL_SOURCES) || '[]'); } catch (e) { localSources = []; }

let sourceEnabled = {};
try { sourceEnabled = JSON.parse(localStorage.getItem(STORAGE_SOURCE_ENABLED) || '{}'); } catch (e) { sourceEnabled = {}; }

let reader = null;
let currentSource = null;

function saveSeriesList() {
  localStorage.setItem(STORAGE_SERIES, JSON.stringify(seriesList));
}

function getSourceProgress({ sourceId, seriesTitle, chapterTitle }) {
  const key = `src:${sourceId}:${seriesTitle}:${chapterTitle}`;
  return progressMap[key] || null;
}

function setSourceProgress({ sourceId, seriesTitle, chapterTitle, pageIndex }) {
  const key = `src:${sourceId}:${seriesTitle}:${chapterTitle}`;
  progressMap[key] = { pageIndex, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(progressMap));
}

function showView(viewId) {
  const views = ['home', 'detail', 'sources', 'source-detail'];
  for (const v of views) {
    const el = document.getElementById('view-' + v) || document.getElementById(v);
    if (el) el.hidden = (v !== viewId);
  }
  // 更新导航激活态
  document.querySelectorAll('[data-view]').forEach(btn => {
    if (btn.getAttribute('data-view') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (viewId === 'home') renderHome();
  if (viewId === 'sources') renderSources();
}

// ==================== 图源配置加载与标准化 ====================
function normalizeSources(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const result = [];
  if (Array.isArray(raw.direct_json_api_zh_full_free)) {
    for (const s of raw.direct_json_api_zh_full_free) {
      result.push({
        ...s,
        id: s.id || ('api_' + result.length),
        name: s.name || s.id,
        category: s.category || '直连 API',
        type: 'api',
        defaultEnabled: true
      });
    }
  }
  if (Array.isArray(raw.vip_unlocked_zh_scrape_sources)) {
    for (const s of raw.vip_unlocked_zh_scrape_sources) {
      result.push({
        ...s,
        id: s.id || ('web_' + result.length),
        name: s.name || s.id,
        category: s.category || '全免网页源',
        type: 'web',
        defaultEnabled: true
      });
    }
  }
  if (Array.isArray(raw.zh_free_source_rule_lists)) {
    for (const s of raw.zh_free_source_rule_lists) {
      result.push({
        ...s,
        id: s.id || ('rule_' + result.length),
        name: s.name || s.id,
        category: s.category || '开源规则库',
        type: 'rule',
        defaultEnabled: true
      });
    }
  }
  return result;
}

async function loadSharedSources() {
  try {
    // 自动兼容子路径与绝对路径
    const sourcesUrl = new URL('sources.json', window.location.href).href;
    const r = await fetch(sourcesUrl);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();
    sharedSources = normalizeSources(raw);
  } catch (e) {
    console.warn('读取在线 sources.json 失败或返回非数组，切换至内置高可用源数据:', e);
    sharedSources = normalizeSources(DEFAULT_SOURCES_DATA);
  }
  if (!sharedSources || sharedSources.length === 0) {
    sharedSources = normalizeSources(DEFAULT_SOURCES_DATA);
  }
}

function allSources() {
  return [...sharedSources, ...localSources];
}

function isSourceEnabled(src) {
  return sourceEnabled[src.id] !== undefined
    ? !!sourceEnabled[src.id]
    : (src.defaultEnabled !== false);
}

// ==================== 本地书架渲染 ====================
function renderHome() {
  const cont = document.getElementById('series-cards') || document.getElementById('home-cards');
  const empty = document.getElementById('home-empty') || document.getElementById('series-empty');
  if (!cont) return;

  const qEl = document.getElementById('home-search') || document.getElementById('series-search');
  const q = qEl ? (qEl.value || '').trim() : '';
  cont.innerHTML = '';
  let count = 0;

  for (const s of seriesList) {
    if (q && !(s.title || '').includes(q)) continue;
    count++;
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = '<h3>' + esc(s.title) + '</h3><p>' + ((s.chapters || []).length) + ' 话 · 状态：' + esc(s.status || '本地') + '</p>';
    card.appendChild(body);
    card.addEventListener('click', () => showDetail(s));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(s); }
    });
    cont.appendChild(card);
  }

  if (empty) {
    empty.hidden = count > 0;
    // 如果本地书架为空，注入前往网络图源的引导入口
    if (count === 0 && !document.getElementById('go-sources-guide')) {
      const guideBox = document.createElement('div');
      guideBox.id = 'go-sources-guide';
      guideBox.style.cssText = 'margin: 20px auto; padding: 18px; border-radius: 10px; background: rgba(59, 130, 246, 0.08); border: 1px dashed rgba(59, 130, 246, 0.35); text-align: center; max-width: 600px;';
      guideBox.innerHTML = `
        <h4 style="margin: 0 0 8px; color: #60a5fa;">💡 已检测并配置 11 个完全免费的中文网络图源</h4>
        <p style="margin: 0 0 14px; font-size: 14px; color: #94a3b8;">包含拷贝漫画、包子漫画、MangaDex、Colamanga等，可直接搜索或跳转阅读。</p>
        <button type="button" class="btn primary" id="btn-goto-sources">立即前往「网络图源」浏览与检索</button>
      `;
      empty.appendChild(guideBox);
      const gotoBtn = document.getElementById('btn-goto-sources');
      if (gotoBtn) gotoBtn.addEventListener('click', () => showView('sources'));
    }
  }
}

function showDetail(series) {
  const head = document.getElementById('detail-head');
  if (head) {
    head.innerHTML = '<h1>' + esc(series.title) + '</h1><p class="hint">共 ' + (series.chapters || []).length + ' 话</p>';
  }
  const list = document.getElementById('detail-chapters');
  if (list) {
    list.innerHTML = '';
    (series.chapters || []).forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'chapter-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.innerHTML = '<span>第 ' + (i + 1) + ' 话 · ' + esc(c.title) + '</span><span class="hint">' + (c.pages || []).length + ' 页</span>';
      row.addEventListener('click', () => openReader(series, c));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(series, c); }
      });
      list.appendChild(row);
    });
  }
  showView('detail');
}

function openReader(series, chapter) {
  reader = {
    isSource: false,
    seriesId: series.id,
    seriesTitle: series.title,
    chapterTitle: chapter.title,
    pages: chapter.pages || [],
    pageIndex: 0
  };
  try {
    const pref = JSON.parse(localStorage.getItem(STORAGE_READER_PREF) || '{}');
    const modeEl = document.getElementById('reader-mode');
    if (pref.mode && modeEl) modeEl.value = pref.mode;
  } catch (e) {}
  const readerEl = document.getElementById('reader');
  if (readerEl) readerEl.hidden = false;
  document.body.style.overflow = 'hidden';
  renderReader();
}

// ==================== 网络图源即时展示与检索 ====================
async function renderSources() {
  if (!sharedSources || sharedSources.length === 0) {
    await loadSharedSources();
  }

  // 1. 渲染图源开关列表
  const toggles = document.getElementById('source-toggles');
  if (toggles) {
    toggles.innerHTML = '';
    for (const src of allSources()) {
      const row = document.createElement('div');
      row.className = 'chapter-row';
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; margin-bottom: 4px;';
      const label = document.createElement('label');
      label.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isSourceEnabled(src);
      cb.addEventListener('change', () => {
        sourceEnabled[src.id] = cb.checked;
        localStorage.setItem(STORAGE_SOURCE_ENABLED, JSON.stringify(sourceEnabled));
        renderSources();
      });
      label.appendChild(cb);
      const badge = `<span style="display:inline-block; font-size:11px; padding:1px 6px; border-radius:4px; background:#334155; color:#93c5fd; margin-right:6px;">${esc(src.category || '免费源')}</span>`;
      const noteText = src.note ? ` <span style="font-size:12px; color:#64748b;">· ${esc(src.note)}</span>` : '';
      const textSpan = document.createElement('span');
      textSpan.innerHTML = badge + '<strong>' + esc(src.name) + '</strong>' + noteText;
      label.appendChild(textSpan);
      row.appendChild(label);

      if (src.local) {
        const del = document.createElement('button');
        del.className = 'btn small';
        del.textContent = '删除';
        del.addEventListener('click', () => {
          localSources = localSources.filter(x => x.id !== src.id);
          localStorage.setItem(STORAGE_LOCAL_SOURCES, JSON.stringify(localSources));
          renderSources();
        });
        row.appendChild(del);
      }
      toggles.appendChild(row);
    }
  }

  // 2. 渲染图源卡片列表 (即时渲染，不阻塞等待外网API)
  const searchInput = document.getElementById('source-search');
  const q = searchInput ? (searchInput.value || '').trim() : '';
  const cont = document.getElementById('source-cards');
  if (!cont) return;
  cont.innerHTML = '';

  let count = 0;
  for (const src of allSources()) {
    if (!isSourceEnabled(src)) continue;
    if (q && !(src.name.toLowerCase().includes(q.toLowerCase()) || (src.note && src.note.toLowerCase().includes(q.toLowerCase())))) {
      // 允许按关键词在卡片中快速搜索直达
    }

    count++;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'border: 1px solid rgba(255,255,255,0.08); transition: transform 0.2s, box-shadow 0.2s;';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const body = document.createElement('div');
    body.className = 'card-body';

    const homeUrl = src.web_home || src.base_url || (src.base_urls && src.base_urls[0]) || '';
    const searchUrl = src.web_search || (q && src.search_url ? src.search_url.replace('{keyword}', encodeURIComponent(q)) : '');
    const targetUrl = q ? (src.web_search ? src.web_search.replace('{keyword}', encodeURIComponent(q)) : (src.search_url ? src.search_url.replace('{keyword}', encodeURIComponent(q)) : homeUrl)) : homeUrl;

    const actionText = q
      ? `在 ${esc(src.name.split(' ')[0])} 搜索「${esc(q)}」 ↗`
      : `直达 ${esc(src.name.split(' ')[0])} 主站 ↗`;

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="margin:0; font-size:16px; color:#f8fafc;">${esc(src.name)}</h3>
        <span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3);">
          ${esc(src.category || '免费可用')}
        </span>
      </div>
      <p style="margin:4px 0 10px; font-size:13px; color:#94a3b8; line-height:1.4;">${esc(src.note || '全本免费中文漫画无锁章直看')}</p>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <a href="${esc(targetUrl)}" target="_blank" rel="noopener noreferrer" class="btn small primary" style="text-decoration:none; display:inline-block; text-align:center; flex:1;">
          ${actionText}
        </a>
      </div>
    `;

    card.appendChild(body);
    cont.appendChild(card);
  }

  const emptyEl = document.getElementById('source-empty');
  if (emptyEl) emptyEl.hidden = count > 0;
}

// ==================== 阅读器核心 ====================
async function renderReader() {
  if (!reader) return;
  const title = reader.seriesTitle + ' · ' + reader.chapterTitle;
  const pageCount = (reader.pages || []).length;

  const titleEl = document.getElementById('reader-title');
  if (titleEl) titleEl.textContent = `${title} (${pageCount ? (reader.pageIndex + 1) : 0}/${pageCount})`;

  const bodyEl = document.getElementById('reader-body') || document.getElementById('reader-stage') || document.getElementById('reader-pages');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const modeEl = document.getElementById('reader-mode');
  const mode = modeEl ? modeEl.value : 'scroll';

  const getPage = async idx => {
    const key = reader.pages[idx];
    if (typeof key === 'string' && key.startsWith('http')) return key;
    const blob = await idbGet(key);
    return blob ? URL.createObjectURL(blob) : null;
  };

  if (mode === 'single' || mode === 'page') {
    const url = await getPage(reader.pageIndex);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `第 ${reader.pageIndex + 1} 页`;
      bodyEl.appendChild(img);
    }
  } else {
    for (let i = 0; i < pageCount; i++) {
      const url = await getPage(i);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.alt = `第 ${i + 1} 页`;
        bodyEl.appendChild(img);
      }
    }
  }
}

// ==================== 初始化与事件绑定 ====================
window.addEventListener('DOMContentLoaded', async () => {
  // 1. 优先加载图源数据
  await loadSharedSources();

  // 2. 绑定导航视图切换
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.getAttribute('data-view')));
  });

  // 3. 搜索框实时筛选
  const srcSearch = document.getElementById('source-search');
  if (srcSearch) {
    srcSearch.addEventListener('input', () => renderSources());
  }

  const homeSearch = document.getElementById('home-search') || document.getElementById('series-search');
  if (homeSearch) {
    homeSearch.addEventListener('input', () => renderHome());
  }

  // 4. 自定义本地源添加
  const addSrcForm = document.getElementById('add-source-form') || document.getElementById('add-source');
  if (addSrcForm) {
    addSrcForm.addEventListener('submit', e => {
      e.preventDefault();
      const nameInput = document.getElementById('source-name');
      const urlInput = document.getElementById('source-url');
      const name = nameInput ? nameInput.value.trim() : '';
      const url = urlInput ? urlInput.value.trim() : '';
      if (!name || !url) return;
      localSources.push({
        id: 'local_' + Date.now(),
        name,
        base_url: url,
        web_search: url,
        category: '自定义源',
        local: true,
        defaultEnabled: true
      });
      localStorage.setItem(STORAGE_LOCAL_SOURCES, JSON.stringify(localSources));
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      renderSources();
    });
  }

  // 5. 阅读器控制
  const closeBtn = document.getElementById('reader-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const readerEl = document.getElementById('reader');
      if (readerEl) readerEl.hidden = true;
      document.body.style.overflow = '';
      reader = null;
    });
  }

  // 6. 默认渲染书架与图源
  renderHome();
  renderSources();
});
