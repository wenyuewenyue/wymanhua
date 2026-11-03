// 漫页书库 (wymanhua) - 核心前端逻辑 (兼容分组 sources.json 直连 API、网页检索源、开源规则库与本地书架)

const STORAGE_SERIES = 'manyeku_series_v1';
const STORAGE_SOURCE_ENABLED = 'manyeku_source_enabled';
const STORAGE_LOCAL_SOURCES = 'manyeku_local_sources';
const STORAGE_READER_PREF = 'manyeku_reader_pref';
const STORAGE_PROGRESS = 'manyeku_progress_v1';

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

// ==================== 全局状态与视图管理 ====================
let seriesList = [];
try { seriesList = JSON.parse(localStorage.getItem(STORAGE_SERIES) || '[]'); } catch (e) { seriesList = []; }

let progressMap = {};
try { progressMap = JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'); } catch (e) { progressMap = {}; }

let sharedSources = [];
let localSources = [];
try { localSources = JSON.parse(localStorage.getItem(STORAGE_LOCAL_SOURCES) || '[]'); } catch (e) { localSources = []; }

let sourceEnabled = {};
try { sourceEnabled = JSON.parse(localStorage.getItem(STORAGE_SOURCE_ENABLED) || '{}'); } catch (e) { sourceEnabled = {}; }

let sourceSeriesCache = {};
let currentSeries = null;
let currentSource = null;
let reader = null;

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
  if (viewId === 'home') renderHome();
  if (viewId === 'sources') renderSources();
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
  if (empty) empty.hidden = count > 0;
}

function showDetail(series) {
  currentSeries = series;
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

// ==================== 示例占位 Canvas 页面生成 ====================
async function canvasPage(seriesTitle, subTitle) {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 1020;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f2430';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, c.width - 48, c.height - 48);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(seriesTitle || '漫页书库', c.width / 2, c.height / 2 - 24);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '24px sans-serif';
  ctx.fillText(subTitle || '', c.width / 2, c.height / 2 + 28);
  return new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));
}

// ==================== 网络请求与跨域回退辅助 ====================
async function fetchJsonWithFallback(targetUrl, customHeaders = {}) {
  const attempts = [
    () => fetch(targetUrl, { headers: customHeaders }),
    () => fetch('https://corsproxy.io/?' + encodeURIComponent(targetUrl), { headers: customHeaders }),
    () => fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl))
  ];
  let lastError = null;
  for (const run of attempts) {
    try {
      const resp = await run();
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('网络请求失败');
}

// ==================== 图源配置加载与标准化 (`sources.json`) ====================
function normalizeSourcesJson(raw) {
  // 1. 兼容旧版顶层数组结构
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const normalized = [];

  // 2. 解析直连 JSON API 源 (direct_json_api_zh_full_free)
  if (Array.isArray(raw.direct_json_api_zh_full_free)) {
    for (const item of raw.direct_json_api_zh_full_free) {
      normalized.push({
        ...item,
        id: item.id || ('api_' + normalized.length),
        name: item.name || item.id,
        type: 'direct_api',
        category: '直连 JSON API',
        defaultEnabled: item.id === 'mangadex_zh' || item.id === 'copymanga' || item.id === 'baozimh',
        note: '全本免费直连 API (' + ((item.base_urls && item.base_urls[0]) || '') + ')'
      });
    }
  }

  // 3. 解析网页直连/检索源 (vip_unlocked_zh_scrape_sources)
  if (Array.isArray(raw.vip_unlocked_zh_scrape_sources)) {
    for (const item of raw.vip_unlocked_zh_scrape_sources) {
      normalized.push({
        ...item,
        id: item.id || ('web_' + normalized.length),
        name: item.name || item.id,
        type: 'scrape_web',
        category: '免费网页源',
        defaultEnabled: true,
        note: '支持关键词直达搜索与目录浏览 (' + (item.base_url || item.mobile_url || '') + ')'
      });
    }
  }

  // 4. 解析中文免费漫画源规则库 (zh_free_source_rule_lists)
  if (Array.isArray(raw.zh_free_source_rule_lists)) {
    raw.zh_free_source_rule_lists.forEach((item, idx) => {
      normalized.push({
        ...item,
        id: item.id || ('rule_list_' + idx),
        name: item.name || ('开源规则库 #' + (idx + 1)),
        type: 'rule_list',
        category: '开源规则目录',
        defaultEnabled: false,
        note: '开源中文免费图源规则索引'
      });
    });
  }

  return normalized;
}

async function loadSharedSources() {
  try {
    const r = await fetch('sources.json');
    const raw = await r.json();
    sharedSources = normalizeSourcesJson(raw);
  } catch (e) {
    sharedSources = [];
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

function demoSeries() {
  return [{
    title: '示例源系列',
    status: 'unset',
    chapters: [
      { title: '第1话', pages: [{ demo: true }, { demo: true }, { demo: true }, { demo: true }] },
      { title: '第2话', pages: [{ demo: true }, { demo: true }, { demo: true }, { demo: true }] }
    ]
  }];
}

// ==================== 各类型图源列表与搜索适配器 ====================
async function fetchMangaDexSeries(src, keyword) {
  const baseUrl = (src.base_urls && src.base_urls[0]) || 'https://api.mangadex.org';
  const ep = keyword
    ? `/manga?title=${encodeURIComponent(keyword)}&availableTranslatedLanguage[]=zh&availableTranslatedLanguage[]=zh-hk&includes[]=cover_art&limit=16`
    : `/manga?availableTranslatedLanguage[]=zh&availableTranslatedLanguage[]=zh-hk&includes[]=cover_art&limit=16&offset=0`;
  const data = await fetchJsonWithFallback(baseUrl + ep);
  const items = Array.isArray(data && data.data) ? data.data : [];
  return items.map(m => {
    const attr = m.attributes || {};
    const titles = attr.title || {};
    const altTitles = Array.isArray(attr.altTitles) ? attr.altTitles : [];
    let zhAlt = null;
    for (const t of altTitles) {
      if (t['zh'] || t['zh-hk'] || t['zh-ro']) {
        zhAlt = t['zh'] || t['zh-hk'] || t['zh-ro'];
        break;
      }
    }
    const title = titles['zh'] || titles['zh-hk'] || zhAlt || titles['ja-ro'] || titles['en'] || Object.values(titles)[0] || m.id;
    let coverUrl = null;
    const rels = Array.isArray(m.relationships) ? m.relationships : [];
    const coverRel = rels.find(r => r.type === 'cover_art' && r.attributes && r.attributes.fileName);
    if (coverRel) {
      coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.256.jpg`;
    }
    return {
      id: m.id,
      title,
      status: attr.status || 'ongoing',
      cover: coverUrl,
      externalUrl: `https://mangadex.org/title/${m.id}`,
      lazyChapters: true,
      chapters: []
    };
  });
}

async function fetchCopyMangaSeries(src, keyword) {
  const baseUrls = Array.isArray(src.base_urls) && src.base_urls.length
    ? src.base_urls
    : ['https://api.mangacopy.com', 'https://api.2025copy.com', 'https://api.copy2000.online'];
  const ep = keyword
    ? `/api/v3/search/comic?q=${encodeURIComponent(keyword)}&limit=16&offset=0&platform=3`
    : `/api/v3/comics?limit=16&offset=0&ordering=-datetime_updated&platform=3`;

  let lastErr = null;
  for (const base of baseUrls) {
    try {
      const data = await fetchJsonWithFallback(base + ep, { platform: '3', webp: '1' });
      const list = (data && data.results && Array.isArray(data.results.list)) ? data.results.list : [];
      if (list.length) {
        return list.map(item => ({
          id: item.path_word,
          path_word: item.path_word,
          baseUrl: base,
          title: item.name || item.path_word,
          status: '连载/完结',
          cover: item.cover || null,
          externalUrl: `https://www.mangacopy.com/comic/${item.path_word}`,
          lazyChapters: true,
          chapters: []
        }));
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // 若浏览器端受 CORS 限制无法直连 API，提供一键跳转检索卡片
  return [{
    id: 'copymanga_web',
    title: keyword ? `在拷贝漫画中搜索「${keyword}」` : '打开拷贝漫画 (全本免费中文)',
    status: '直达站点',
    externalUrl: keyword
      ? `https://www.mangacopy.com/search?q=${encodeURIComponent(keyword)}`
      : 'https://www.mangacopy.com/comics',
    chapters: []
  }];
}

async function fetchBaozimhSeries(src, keyword) {
  const base = (src.base_urls && src.base_urls[0]) || 'https://www.baozimh.com';
  if (!keyword) {
    try {
      const ep = '/api/bzmhq/amp_comic_list?type=all&region=all&state=all&filter=%2a&page=1&limit=24&language=cn';
      const data = await fetchJsonWithFallback(base + ep);
      const items = Array.isArray(data && data.items) ? data.items : [];
      if (items.length) {
        return items.map(item => ({
          id: item.comic_id,
          comic_id: item.comic_id,
          title: item.name || item.comic_id,
          status: item.author || '连载中',
          cover: item.topic_img ? `https://static-tw.baozimh.com/cover/${item.topic_img}` : null,
          externalUrl: `${base}/comic/${item.comic_id}`,
          chapters: [
            {
              title: '前往包子漫画免费阅读全集',
              externalUrl: `${base}/comic/${item.comic_id}`,
              pages: []
            }
          ]
        }));
      }
    } catch (e) {}
  }
  return [{
    id: 'baozimh_search',
    title: keyword ? `在包子漫画中搜索「${keyword}」` : '打开包子漫画首页 (国漫/韩漫/日漫免费)',
    status: '直达站点',
    externalUrl: keyword ? `${base}/search?q=${encodeURIComponent(keyword)}` : base,
    chapters: []
  }];
}

async function fetchGenericDirectApiSeries(src, keyword) {
  const base = (src.base_urls && src.base_urls[0]) || '';
  if (src.id === 'happymh') {
    try {
      const ep = keyword
        ? `/apis/c/search?keyword=${encodeURIComponent(keyword)}&pn=1`
        : `/apis/c/index?pn=1&series_status=-1&order=last_date`;
      const data = await fetchJsonWithFallback(base + ep);
      const items = (data && data.data && Array.isArray(data.data.items)) ? data.data.items : [];
      if (items.length) {
        return items.map(item => ({
          id: item.manga_code || item.id,
          title: item.name || '未命名漫画',
          status: item.author || '免费连载',
          cover: item.cover || null,
          externalUrl: `${base}/manga/${item.manga_code || ''}`,
          chapters: []
        }));
      }
    } catch (e) {}
  }
  const searchEp = (src.endpoints && src.endpoints.search)
    ? src.endpoints.search.replace('{keyword}', encodeURIComponent(keyword || ''))
    : '';
  return [{
    id: src.id + '_direct',
    title: keyword ? `在 ${src.name} 中搜索「${keyword}」` : `打开 ${src.name}`,
    status: '免费直连',
    externalUrl: (keyword && searchEp) ? (base + searchEp) : base,
    chapters: []
  }];
}

function buildScrapeWebSeries(src, keyword) {
  const baseUrl = src.base_url || src.mobile_url || '';
  const targetUrl = keyword && src.search_url
    ? src.search_url.replace('{keyword}', encodeURIComponent(keyword))
    : (src.list_url ? src.list_url.replace('{page}', '1') : (src.rank_url || baseUrl));
  return [{
    id: src.id + '_web',
    title: keyword ? `在 ${src.name.split(' ')[0]} 搜索「${keyword}」` : `${src.name}`,
    status: '网页直达',
    externalUrl: targetUrl,
    chapters: [
      {
        title: keyword ? `打开「${keyword}」搜索结果页` : '打开漫画目录列表页',
        externalUrl: targetUrl,
        pages: []
      }
    ]
  }];
}

async function fetchRuleListSeries(src, keyword) {
  const indexUrl = src.index_json || src.full_index_json;
  if (indexUrl) {
    try {
      const data = await fetchJsonWithFallback(indexUrl);
      // Venera index.json 结构或 Keiyoushi index.min.json 数组结构
      if (Array.isArray(data)) {
        const zhExts = data.filter(ext => ext.lang === 'zh' || ext.lang === 'all');
        const filtered = keyword
          ? zhExts.filter(ext => (ext.name || '').toLowerCase().includes(keyword.toLowerCase()))
          : zhExts.slice(0, 24);
        return filtered.map(ext => ({
          id: ext.pkg || ext.name,
          title: ext.name.replace(/^Tachiyomi:\s*/i, ''),
          status: 'v' + (ext.version || '1.0'),
          externalUrl: (ext.sources && ext.sources[0] && ext.sources[0].baseUrl) || src.zh_sources_repo || 'https://github.com/keiyoushi/extensions-source',
          chapters: (ext.sources || []).map(s => ({
            title: `${s.name} (${s.baseUrl})`,
            externalUrl: s.baseUrl,
            pages: []
          }))
        }));
      } else if (data && typeof data === 'object') {
        const entries = Array.isArray(data.comics) ? data.comics : Object.values(data);
        const list = entries.filter(x => x && typeof x === 'object' && (x.name || x.fileName));
        if (list.length) {
          return list.map(item => ({
            id: item.fileName || item.name,
            title: item.name || item.fileName,
            status: 'Venera 规则',
            externalUrl: src.rules_repo || 'https://github.com/venera-app/venera-configs',
            chapters: []
          }));
        }
      }
    } catch (e) {}
  }
  const repoUrl = src.zh_sources_repo || src.rules_repo || indexUrl;
  return [{
    id: src.id + '_repo',
    title: src.name,
    status: '开源规则库',
    externalUrl: repoUrl,
    chapters: []
  }];
}

async function getSourceSeries(src, keyword = '') {
  const cacheKey = `${src.id}::${keyword}`;
  if (sourceSeriesCache[cacheKey]) return sourceSeriesCache[cacheKey];

  let list = [];
  if (src.type === 'demo') {
    list = demoSeries();
  } else if (src.type === 'index' && src.url) {
    const r = await fetch(src.url);
    const data = await r.json();
    if (!data || !Array.isArray(data.series)) throw new Error('索引中未找到 series 数组');
    list = data.series.map(s => ({
      title: s.title || '未命名系列',
      status: s.status || 'unset',
      chapters: (s.chapters || []).map(c => ({
        title: c.title || '第1话',
        pages: (c.pages || []).map(p => {
          try { return new URL(p, src.url).href; } catch (e) { return p; }
        })
      }))
    }));
  } else if (src.type === 'direct_api') {
    if (src.id === 'mangadex_zh') {
      list = await fetchMangaDexSeries(src, keyword);
    } else if (src.id === 'copymanga') {
      list = await fetchCopyMangaSeries(src, keyword);
    } else if (src.id === 'baozimh') {
      list = await fetchBaozimhSeries(src, keyword);
    } else {
      list = await fetchGenericDirectApiSeries(src, keyword);
    }
  } else if (src.type === 'scrape_web') {
    list = buildScrapeWebSeries(src, keyword);
  } else if (src.type === 'rule_list') {
    list = await fetchRuleListSeries(src, keyword);
  }

  sourceSeriesCache[cacheKey] = list;
  return list;
}

// ==================== 章节列表懒加载 (MangaDex / 拷贝漫画) ====================
async function loadLazyChapters(src, series) {
  if (!series.lazyChapters || (series.chapters && series.chapters.length > 0)) {
    return series.chapters || [];
  }
  if (src.id === 'mangadex_zh' && series.id) {
    const baseUrl = (src.base_urls && src.base_urls[0]) || 'https://api.mangadex.org';
    const ep = `/manga/${series.id}/feed?translatedLanguage[]=zh&translatedLanguage[]=zh-hk&order[chapter]=asc&limit=500`;
    const data = await fetchJsonWithFallback(baseUrl + ep);
    const rows = Array.isArray(data && data.data) ? data.data : [];
    series.chapters = rows.map((ch, idx) => {
      const attr = ch.attributes || {};
      const chNum = attr.chapter != null ? `第 ${attr.chapter} 话` : `第 ${idx + 1} 话`;
      const chTitle = attr.title ? `${chNum} · ${attr.title}` : chNum;
      return {
        id: ch.id,
        title: chTitle,
        pageCount: attr.pages || 0,
        lazyPages: true,
        pages: []
      };
    });
    return series.chapters;
  }
  if (src.id === 'copymanga' && series.path_word) {
    const base = series.baseUrl || (src.base_urls && src.base_urls[0]) || 'https://api.mangacopy.com';
    const ep = `/api/v3/comic/${series.path_word}/group/default/chapters?limit=500&offset=0&platform=3`;
    const data = await fetchJsonWithFallback(base + ep, { platform: '3', webp: '1' });
    const rows = (data && data.results && Array.isArray(data.results.list)) ? data.results.list : [];
    series.chapters = rows.map(ch => ({
      id: ch.uuid,
      uuid: ch.uuid,
      path_word: series.path_word,
      baseUrl: base,
      title: ch.name || '章节',
      pageCount: ch.size || 0,
      lazyPages: true,
      pages: []
    }));
    return series.chapters;
  }
  return series.chapters || [];
}

// ==================== 章节图片懒加载 (MangaDex @Home / 拷贝漫画) ====================
async function loadLazyPages(src, series, chapter) {
  if (!chapter.lazyPages || (chapter.pages && chapter.pages.length > 0)) {
    return chapter.pages || [];
  }
  if (src.id === 'mangadex_zh' && chapter.id) {
    const baseUrl = (src.base_urls && src.base_urls[0]) || 'https://api.mangadex.org';
    const data = await fetchJsonWithFallback(`${baseUrl}/at-home/server/${chapter.id}`);
    if (data && data.baseUrl && data.chapter && Array.isArray(data.chapter.data)) {
      const hash = data.chapter.hash;
      chapter.pages = data.chapter.data.map(fn => `${data.baseUrl}/data/${hash}/${fn}`);
    }
    return chapter.pages;
  }
  if (src.id === 'copymanga' && chapter.uuid && (chapter.path_word || series.path_word)) {
    const base = chapter.baseUrl || series.baseUrl || (src.base_urls && src.base_urls[0]) || 'https://api.mangacopy.com';
    const pw = chapter.path_word || series.path_word;
    const data = await fetchJsonWithFallback(`${base}/api/v3/comic/${pw}/chapter2/${chapter.uuid}?platform=3`, { platform: '3', webp: '1' });
    const contents = (data && data.results && data.results.chapter && Array.isArray(data.results.chapter.contents))
      ? data.results.chapter.contents
      : [];
    chapter.pages = contents.map(c => c.url).filter(Boolean);
    return chapter.pages;
  }
  return chapter.pages || [];
}

// ==================== 图源列表渲染与交互 ====================
async function renderSources() {
  if (!sharedSources.length) {
    await loadSharedSources();
  }
  const toggles = document.getElementById('source-toggles');
  if (toggles) {
    toggles.innerHTML = '';
    for (const src of allSources()) {
      const row = document.createElement('div');
      row.className = 'chapter-row';
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isSourceEnabled(src);
      cb.addEventListener('change', () => {
        sourceEnabled[src.id] = cb.checked;
        localStorage.setItem(STORAGE_SOURCE_ENABLED, JSON.stringify(sourceEnabled));
        renderSources();
      });
      label.appendChild(cb);
      const tag = src.local ? '本地源' : (src.category || '共享源');
      label.append(' ' + src.name + ' (' + tag + ')' + (src.note ? ' - ' + src.note : ''));
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

  const searchInput = document.getElementById('source-search');
  const q = searchInput ? (searchInput.value || '').trim() : '';
  const cont = document.getElementById('source-cards');
  if (!cont) return;
  cont.innerHTML = '';
  let count = 0;

  for (const src of allSources()) {
    if (!isSourceEnabled(src)) continue;
    let list = [];
    try {
      list = await getSourceSeries(src, q);
    } catch (e) {
      const err = document.createElement('p');
      err.className = 'error';
      err.textContent = src.name + ': ' + e.message;
      cont.appendChild(err);
      continue;
    }
    for (const s of list) {
      if (q && (src.type === 'demo' || src.type === 'index') && !(s.title || '').includes(q)) continue;
      count++;
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const body = document.createElement('div');
      body.className = 'card-body';
      const chapterInfo = s.lazyChapters
        ? '点击加载中文话数'
        : (s.chapters && s.chapters.length ? (s.chapters.length + ' 话') : '点击直达站点');
      body.innerHTML =
        '<h3>' + esc(s.title) + '</h3>' +
        '<p>来源：' + esc(src.name) + '</p>' +
        '<p>' + esc(chapterInfo) + ' · 状态：' + esc(s.status || '免费') + '</p>';
      card.appendChild(body);
      card.addEventListener('click', () => showSourceDetail(src, s));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showSourceDetail(src, s);
        }
      });
      cont.appendChild(card);
    }
  }
  const emptyEl = document.getElementById('source-empty');
  if (emptyEl) emptyEl.hidden = count > 0;
}

async function showSourceDetail(src, series) {
  currentSource = { src, series };
  const head = document.getElementById('source-detail-head');
  const list = document.getElementById('source-detail-chapters');
  showView('source-detail');

  if (head) {
    let extLinkHtml = '';
    if (series.externalUrl) {
      extLinkHtml = ` · <a href="${esc(series.externalUrl)}" target="_blank" rel="noopener noreferrer">在新标签页打开原网页 ↗</a>`;
    }
    head.innerHTML =
      '<h1>' + esc(series.title) + '</h1>' +
      '<p class="hint">来源：' + esc(src.name) + ' · 状态：' + esc(series.status || '免费') + extLinkHtml + '</p>';
  }

  if (!list) return;
  list.innerHTML = '<p class="hint">正在加载章节列表...</p>';

  try {
    await loadLazyChapters(src, series);
  } catch (e) {
    list.innerHTML = '<p class="error">章节加载失败：' + esc(e.message) + '</p>';
  }

  list.innerHTML = '';
  const chapters = series.chapters || [];
  if (!chapters.length && series.externalUrl) {
    const row = document.createElement('div');
    row.className = 'chapter-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.innerHTML = '<span>前往站点直接阅读 / 搜索：' + esc(series.title) + '</span><span class="hint">外部直连 ↗</span>';
    row.addEventListener('click', () => window.open(series.externalUrl, '_blank', 'noopener'));
    list.appendChild(row);
    return;
  }

  chapters.forEach((c, i) => {
    const prog = getSourceProgress({ sourceId: src.id, seriesTitle: series.title, chapterTitle: c.title });
    const row = document.createElement('div');
    row.className = 'chapter-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const pageHint = c.pages && c.pages.length
      ? (c.pages.length + ' 页')
      : (c.pageCount ? (c.pageCount + ' 页') : (c.externalUrl ? '外部直连 ↗' : '点击阅读'));
    row.innerHTML =
      '<span>第 ' + (i + 1) + ' 话 · ' + esc(c.title) + '</span>' +
      '<span class="hint">' + esc(pageHint) + (prog ? ' · 已读' : '') + '</span>';
    row.addEventListener('click', () => {
      if (c.externalUrl && (!c.pages || !c.pages.length) && !c.lazyPages) {
        window.open(c.externalUrl, '_blank', 'noopener');
      } else {
        openSourceReader(src, series, c);
      }
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
    list.appendChild(row);
  });
}

async function openSourceReader(src, series, chapter) {
  if (chapter.lazyPages && (!chapter.pages || !chapter.pages.length)) {
    try {
      await loadLazyPages(src, series, chapter);
    } catch (e) {
      if (series.externalUrl) {
        window.open(series.externalUrl, '_blank', 'noopener');
      }
      return;
    }
  }
  reader = {
    isSource: true,
    sourceId: src.id,
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

// ==================== 阅读器核心渲染 ====================
async function renderReader() {
  if (!reader) return;
  let title = '';
  let pageCount = 0;
  let getPage = null;

  if (reader.isSource) {
    title = reader.seriesTitle + ' · ' + reader.chapterTitle;
    pageCount = (reader.pages || []).length;
    getPage = async idx => {
      const p = reader.pages[idx];
      if (p && p.demo) {
        const b = await canvasPage('示例源系列', reader.chapterTitle + ' · 第 ' + (idx + 1) + ' 页');
        return URL.createObjectURL(b);
      }
      return typeof p === 'string' ? p : null;
    };
    setSourceProgress({
      sourceId: reader.sourceId,
      seriesTitle: reader.seriesTitle,
      chapterTitle: reader.chapterTitle,
      pageIndex: reader.pageIndex
    });
  } else {
    title = reader.seriesTitle + ' · ' + reader.chapterTitle;
    pageCount = (reader.pages || []).length;
    getPage = async idx => {
      const key = reader.pages[idx];
      const blob = await idbGet(key);
      return blob ? URL.createObjectURL(blob) : null;
    };
  }

  const titleEl = document.getElementById('reader-title');
  if (titleEl) titleEl.textContent = `${title} (${pageCount ? (reader.pageIndex + 1) : 0}/${pageCount})`;

  const bodyEl = document.getElementById('reader-body') || document.getElementById('reader-stage') || document.getElementById('reader-pages');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const modeEl = document.getElementById('reader-mode');
  const mode = modeEl ? modeEl.value : 'scroll';

  if (mode === 'single' || mode === 'page') {
    const url = await getPage(reader.pageIndex);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `第 ${reader.pageIndex + 1} 页`;
      img.referrerPolicy = 'no-referrer';
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
        img.referrerPolicy = 'no-referrer';
        bodyEl.appendChild(img);
      }
    }
  }
}

// ==================== 事件绑定与初始化 ====================
window.addEventListener('DOMContentLoaded', () => {
  // 导航按钮绑定
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.getAttribute('data-view')));
  });

  // 搜索框实时检索 (支持防抖)
  const srcSearch = document.getElementById('source-search');
  let searchTimer = null;
  if (srcSearch) {
    srcSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSources(), 350);
    });
  }

  const homeSearch = document.getElementById('home-search') || document.getElementById('series-search');
  if (homeSearch) {
    homeSearch.addEventListener('input', () => renderHome());
  }

  // 自定义索引源添加
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
        url,
        type: 'index',
        local: true,
        defaultEnabled: true
      });
      localStorage.setItem(STORAGE_LOCAL_SOURCES, JSON.stringify(localSources));
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      renderSources();
    });
  }

  // 阅读器关闭与翻页快捷键
  const closeBtn = document.getElementById('reader-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const readerEl = document.getElementById('reader');
      if (readerEl) readerEl.hidden = true;
      document.body.style.overflow = '';
      reader = null;
    });
  }

  window.addEventListener('keydown', e => {
    if (!reader) return;
    if (e.key === 'Escape') {
      const readerEl = document.getElementById('reader');
      if (readerEl) readerEl.hidden = true;
      document.body.style.overflow = '';
      reader = null;
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      if (reader.pageIndex < (reader.pages || []).length - 1) {
        reader.pageIndex++;
        renderReader();
      }
    } else if (e.key === 'ArrowLeft') {
      if (reader.pageIndex > 0) {
        reader.pageIndex--;
        renderReader();
      }
    }
  });

  renderHome();
  renderSources();
});
