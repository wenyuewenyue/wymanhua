const LS_KEY = 'manyeku_series_v1';
const IMG_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
let seriesList = [];
try { seriesList = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { seriesList = []; }
let currentSeriesId = null;
let reader = null;
let readerUrls = [];

function saveMeta() { localStorage.setItem(LS_KEY, JSON.stringify(seriesList)); }
function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function natural(a, b) {
  const pa = String(a).match(/\d+|\D+/g) || [], pb = String(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1; if (pb[i] === undefined) return 1;
    const na = Number(pa[i]), nb = Number(pb[i]);
    if (!isNaN(na) && !isNaN(nb)) { if (na !== nb) return na - nb; }
    else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}
function isImageName(n) { return IMG_RE.test(n) && !n.split('/').some(p => p.startsWith('.') || p === '__MACOSX'); }

// IndexedDB
let dbPromise = null;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open('manyeku', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('pages'); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}
async function idbPut(key, blob) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('pages', 'readwrite'); t.objectStore('pages').put(blob, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbGet(key) { const d = await db(); return new Promise((res, rej) => { const r = d.transaction('pages').objectStore('pages').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDeleteSeries(seriesId) {
  const d = await db(); const store = d.transaction('pages', 'readwrite').objectStore('pages');
  const range = IDBKeyRange.bound(seriesId + '/', seriesId + '/\uffff');
  return new Promise((res, rej) => { const req = store.openCursor(range); req.onsuccess = e => { const c = e.target.result; if (c) { c.delete(); c.continue(); } else res(); }; req.onerror = () => rej(req.error); });
}

// Views
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  const el = document.getElementById('view-' + name);
  if (el) el.hidden = false;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  if (name === 'home') renderHome();
  if (name === 'library') renderLibrary();
  if (name === 'history') renderHistory();
  if (name === 'sources') renderSources();
}
document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => showView(el.dataset.nav)));

function totalPages(s) { return s.chapters.reduce((a, c) => a + c.pageCount, 0); }
function readPages(s) {
  if (!s.lastChapterId) return 0;
  let n = 0;
  for (const c of s.chapters) { if (c.id === s.lastChapterId) { n += (c.lastPage || 0) + 1; break; } n += c.pageCount; }
  return n;
}
function progressPct(s) { const t = totalPages(s); return t ? Math.round(readPages(s) / t * 100) : 0; }
function statusText(v) { return v === 'ongoing' ? '连载中' : v === 'finished' ? '已完结' : '未设置'; }

async function cardEl(s, continueMode) {
  const card = document.createElement('div'); card.className = 'card';
  const img = document.createElement('img'); img.alt = s.title;
  card.appendChild(img);
  const body = document.createElement('div'); body.className = 'card-body';
  body.innerHTML = '<h3>' + esc(s.title) + '</h3><p>' + s.chapters.length + ' 话 · ' + totalPages(s) + ' 页 · ' + statusText(s.status) + '</p><p>进度 ' + progressPct(s) + '%</p><div class="progress"><i style="width:' + progressPct(s) + '%"></i></div>';
  card.appendChild(body);
  card.tabIndex = 0; card.setAttribute('role', 'button');
  card.addEventListener('click', () => {
    if (continueMode && s.lastChapterId) { const ch = s.chapters.find(c => c.id === s.lastChapterId); if (ch) openReader(s.id, ch.id); else showDetail(s.id); }
    else showDetail(s.id);
  });
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  const first = s.chapters[0];
  if (first) { const blob = await idbGet(s.id + '/' + first.id + '/0'); if (blob) img.src = URL.createObjectURL(blob); }
  return card;
}
async function renderHome() {
  const stats = document.getElementById('home-stats');
  stats.innerHTML = '<div><b>' + seriesList.length + '</b>系列</div><div><b>' + seriesList.reduce((a, s) => a + s.chapters.length, 0) + '</b>话</div><div><b>' + seriesList.reduce((a, s) => a + totalPages(s), 0) + '</b>页</div>';
  const cont = document.getElementById('home-continue'); cont.innerHTML = '';
  const reading = seriesList.filter(s => s.lastChapterId);
  document.getElementById('home-empty').hidden = seriesList.length > 0;
  for (const s of reading.slice(0, 6)) cont.appendChild(await cardEl(s, true));
}
async function renderLibrary() {
  const q = (document.getElementById('search').value || '').trim();
  const st = document.getElementById('filter-status').value;
  const sort = document.getElementById('sort-by').value;
  let list = seriesList.filter(s => (!q || s.title.includes(q)) && (!st || s.status === st));
  if (sort === 'title') list.sort((a, b) => natural(a.title, b.title));
  else if (sort === 'created') list.sort((a, b) => b.createdAt - a.createdAt);
  else list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cont = document.getElementById('library-cards'); cont.innerHTML = '';
  document.getElementById('library-empty').hidden = list.length > 0;
  for (const s of list) cont.appendChild(await cardEl(s, false));
}
async function renderHistory() {
  const cont = document.getElementById('history-list'); cont.innerHTML = '';
  const reading = seriesList.filter(s => s.lastChapterId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  document.getElementById('history-empty').hidden = reading.length > 0;
  for (const s of reading) cont.appendChild(await cardEl(s, true));
}
['search', 'filter-status', 'sort-by'].forEach(id => document.getElementById(id).addEventListener('input', renderLibrary));

function showDetail(seriesId) {
  currentSeriesId = seriesId;
  const s = seriesList.find(x => x.id === seriesId); if (!s) return;
  document.getElementById('detail-head').innerHTML = '<h1>' + esc(s.title) + '</h1><p class="hint">' + s.chapters.length + ' 话 · ' + totalPages(s) + ' 页 · ' + statusText(s.status) + ' · 进度 ' + progressPct(s) + '%</p>';
  const list = document.getElementById('detail-chapters'); list.innerHTML = '';
  s.chapters.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'chapter-row';
    row.tabIndex = 0; row.setAttribute('role', 'button');
    row.innerHTML = '<span>第 ' + (i + 1) + ' 话 · ' + esc(c.title) + '</span><span class="hint">' + c.pageCount + ' 页' + (s.lastChapterId === c.id ? ' · 看到第 ' + ((c.lastPage || 0) + 1) + ' 页' : '') + '</span>';
    row.addEventListener('click', () => openReader(s.id, c.id));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(s.id, c.id); } });
    list.appendChild(row);
  });
  showView('detail');
}
document.getElementById('btn-delete-series').addEventListener('click', async () => {
  const s = seriesList.find(x => x.id === currentSeriesId); if (!s) return;
  if (!confirm('确定删除《' + s.title + '》吗？本地页面数据与进度将一并清除。')) return;
  await idbDeleteSeries(s.id);
  seriesList = seriesList.filter(x => x.id !== s.id); saveMeta(); showView('library');
});

// Import: grouping
function groupFiles(files) {
  // files: [{path, name, blob}] path uses / separators, no leading series folder yet
  let paths = files.map(f => f.path);
  // strip common single top folder
  const tops = [...new Set(paths.map(p => p.split('/')[0]))];
  if (tops.length === 1 && paths.some(p => p.includes('/'))) {
    files = files.map(f => ({ ...f, path: f.path.split('/').slice(1).join('/') })).filter(f => f.path);
    paths = files.map(f => f.path);
  }
  const groups = new Map();
  for (const f of files) {
    const parts = f.path.split('/');
    const chapter = parts.length > 1 ? parts.slice(0, -1).join('/') : '第1话';
    if (!groups.has(chapter)) groups.set(chapter, []);
    groups.get(chapter).push(f);
  }
  return [...groups.entries()].sort((a, b) => natural(a[0], b[0])).map(([title, items]) => ({
    title, pages: items.sort((a, b) => natural(a.name, b.name))
  }));
}
async function saveSeries(title, status, chapters) {
  const s = { id: uid(), title, status, createdAt: Date.now(), updatedAt: Date.now(), lastChapterId: null, chapters: [] };
  for (const ch of chapters) {
    const cid = uid();
    s.chapters.push({ id: cid, title: ch.title, pageCount: ch.pages.length, lastPage: 0 });
    for (let i = 0; i < ch.pages.length; i++) await idbPut(s.id + '/' + cid + '/' + i, ch.pages[i].blob);
  }
  seriesList.unshift(s); saveMeta(); return s;
}
function setImportResult(msg) { document.getElementById('import-result').textContent = msg; }
async function handleGrouped(titleInput, status, chapters, sourceLabel) {
  if (!chapters.length) { setImportResult('未找到图片文件，请检查所选内容。'); return; }
  const total = chapters.reduce((a, c) => a + c.pages.length, 0);
  setImportResult('正在保存 ' + chapters.length + ' 话、' + total + ' 页，请稍候……');
  const s = await saveSeries(titleInput, status, chapters);
  setImportResult('导入完成：' + s.title + '，共 ' + chapters.length + ' 话、' + total + ' 页。');
  renderLibrary(); showDetail(s.id);
}
document.getElementById('input-folder').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => isImageName(f.name));
  if (!files.length) { setImportResult('该文件夹内未找到图片文件。'); return; }
  const root = (e.target.files[0].webkitRelativePath || '').split('/')[0] || '';
  const title = document.getElementById('import-title').value.trim() || root || '未命名系列';
  const items = files.map(f => ({ path: f.webkitRelativePath || f.name, name: f.name, blob: f }));
  handleGrouped(title, document.getElementById('import-status').value, groupFiles(items), 'folder');
  e.target.value = '';
});
document.getElementById('input-images').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => isImageName(f.name)).sort((a, b) => natural(a.name, b.name));
  const title = document.getElementById('import-title').value.trim() || '未命名系列';
  handleGrouped(title, document.getElementById('import-status').value, [{ title: '第1话', pages: files.map(f => ({ name: f.name, blob: f })) }], 'images');
  e.target.value = '';
});
// Minimal ZIP reader (stored + deflate)
async function parseZip(buf) {
  const view = new DataView(buf); const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) { if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('未找到 ZIP 目录');
  const total = view.getUint16(eocd + 10, true); const cdOffset = view.getUint32(eocd + 16, true);
  const entries = []; let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true); const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true); const extraLen = view.getUint16(p + 30, true); const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    const lp = localOffset; const lNameLen = view.getUint16(lp + 26, true); const lExtraLen = view.getUint16(lp + 28, true);
    const dataStart = lp + 30 + lNameLen + lExtraLen; const comp = bytes.slice(dataStart, dataStart + compSize);
    let blob;
    if (method === 0) blob = new Blob([comp]);
    else if (method === 8) {
      const out = await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      blob = new Blob([out]);
    } else { p += 46 + nameLen + extraLen + commentLen; continue; }
    entries.push({ path: name, name: name.split('/').pop(), blob });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
document.getElementById('input-zip').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    setImportResult('正在解压，请稍候……');
    const entries = (await parseZip(await file.arrayBuffer())).filter(x => isImageName(x.path));
    const title = document.getElementById('import-title').value.trim() || file.name.replace(/\.(cbz|zip)$/i, '');
    handleGrouped(title, document.getElementById('import-status').value, groupFiles(entries), 'zip');
  } catch (err) { setImportResult('解压失败：' + err.message + '。请解压后改用文件夹导入。'); }
  e.target.value = '';
});

// Sample series (placeholder pages only)
function canvasPage(text, sub) {
  const c = document.createElement('canvas'); c.width = 720; c.height = 1024;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 720, 1024);
  g.strokeStyle = '#222'; g.lineWidth = 3;
  g.strokeRect(30, 30, 660, 460); g.strokeRect(30, 510, 320, 460); g.strokeRect(370, 510, 320, 460);
  g.fillStyle = '#222'; g.font = 'bold 42px sans-serif'; g.textAlign = 'center';
  g.fillText(text, 360, 250); g.font = '28px sans-serif'; g.fillText(sub, 360, 310);
  g.font = '24px sans-serif'; g.fillText('占位示意图', 360, 740);
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
document.getElementById('btn-sample').addEventListener('click', async () => {
  if (seriesList.some(s => s.title === '示例系列')) { setImportResult(''); showDetail(seriesList.find(s => s.title === '示例系列').id); return; }
  const chapters = [];
  for (let ch = 1; ch <= 2; ch++) {
    const pages = [];
    for (let pg = 1; pg <= 4; pg++) pages.push({ name: 'p' + pg + '.png', blob: await canvasPage('示例系列', '第 ' + ch + ' 话 · 第 ' + pg + ' 页') });
    chapters.push({ title: '第' + ch + '话', pages });
  }
  const s = await saveSeries('示例系列', 'unset', chapters);
  showDetail(s.id);
});

// Reader
function sourceProgressKey(r) { return r.sourceId + '|' + r.seriesTitle + '|' + r.chapterTitle; }
function getSourceProgress(r) { try { return JSON.parse(localStorage.getItem('manyeku_source_progress') || '{}')[sourceProgressKey(r)] || 0; } catch (e) { return 0; } }
function readerPageCount() {
  if (reader.isSource) return reader.pages.length;
  const s = seriesList.find(x => x.id === reader.seriesId); const ch = s ? s.chapters.find(c => c.id === reader.chapterId) : null;
  return ch ? ch.pageCount : 0;
}
function saveProgress() {
  if (!reader) return;
  if (reader.isSource) {
    try { const m = JSON.parse(localStorage.getItem('manyeku_source_progress') || '{}'); m[sourceProgressKey(reader)] = reader.page; localStorage.setItem('manyeku_source_progress', JSON.stringify(m)); } catch (e) {}
    return;
  }
  const s = seriesList.find(x => x.id === reader.seriesId); if (!s) return;
  const ch = s.chapters.find(c => c.id === reader.chapterId); if (!ch) return;
  ch.lastPage = reader.page; s.lastChapterId = ch.id; s.updatedAt = Date.now(); saveMeta();
}
async function renderReader() {
  let title = '', pageCount = 0, getPage = null;
  if (reader.isSource) {
    title = reader.seriesTitle + ' · ' + reader.chapterTitle; pageCount = reader.pages.length;
    getPage = async idx => {
      const p = reader.pages[idx];
      if (p && p.demo) { const b = await canvasPage(reader.seriesTitle, reader.chapterTitle + ' · 第 ' + (idx + 1) + ' 页'); return URL.createObjectURL(b); }
      return typeof p === 'string' ? p : null;
    };
  } else {
    const s = seriesList.find(x => x.id === reader.seriesId); const ch = s ? s.chapters.find(c => c.id === reader.chapterId) : null;
    if (!s || !ch) return;
    title = s.title + ' · ' + ch.title; pageCount = ch.pageCount;
    getPage = async idx => { const blob = await idbGet(s.id + '/' + ch.id + '/' + idx); return blob ? URL.createObjectURL(blob) : null; };
  }
  document.getElementById('reader-title').textContent = title;
  const mode = document.getElementById('reader-mode').value;
  const dir = document.getElementById('reader-dir').value;
  localStorage.setItem('manyeku_reader_pref', JSON.stringify({ mode, dir }));
  let indices = [reader.page];
  if (mode === 'double' && reader.page + 1 < pageCount) indices = [reader.page, reader.page + 1];
  if (mode === 'double' && dir === 'rtl') indices = indices.slice().reverse();
  document.getElementById('reader-page').textContent = '第 ' + (reader.page + 1) + ' / ' + pageCount + ' 页';
  document.getElementById('reader-goto').value = reader.page + 1;
  const box = document.getElementById('reader-pages'); box.className = 'reader-pages' + (mode === 'double' ? ' double' : '');
  readerUrls.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); }); readerUrls = []; box.innerHTML = '';
  for (const idx of indices) {
    const url = await getPage(idx);
    const img = document.createElement('img'); img.alt = '第 ' + (idx + 1) + ' 页';
    if (url) { readerUrls.push(url); img.src = url; }
    img.addEventListener('click', ev => {
      const r = img.getBoundingClientRect(); const left = ev.clientX - r.left < r.width / 2;
      if (dir === 'rtl') left ? readerNext() : readerPrev(); else left ? readerPrev() : readerNext();
    });
    box.appendChild(img);
  }
  saveProgress();
}
function readerNext() {
  const pageCount = readerPageCount();
  const step = document.getElementById('reader-mode').value === 'double' ? 2 : 1;
  if (reader.page + step < pageCount) { reader.page += step; renderReader(); }
  else if (reader.page < pageCount - 1) { reader.page = pageCount - 1; renderReader(); }
}
function readerPrev() {
  const step = document.getElementById('reader-mode').value === 'double' ? 2 : 1;
  reader.page = Math.max(0, reader.page - step); renderReader();
}
function openReader(seriesId, chapterId) {
  const s = seriesList.find(x => x.id === seriesId); const ch = s.chapters.find(c => c.id === chapterId); if (!s || !ch) return;
  reader = { seriesId, chapterId, page: ch.lastPage || 0 };
  try { const pref = JSON.parse(localStorage.getItem('manyeku_reader_pref') || '{}'); if (pref.mode) document.getElementById('reader-mode').value = pref.mode; if (pref.dir) document.getElementById('reader-dir').value = pref.dir; } catch (e) {}
  document.getElementById('reader').hidden = false; document.body.style.overflow = 'hidden'; renderReader();
}
function closeReader() { document.getElementById('reader').hidden = true; document.body.style.overflow = ''; reader = null; renderHome(); renderLibrary(); }
document.getElementById('reader-exit').addEventListener('click', closeReader);
document.getElementById('reader-prev').addEventListener('click', readerPrev);
document.getElementById('reader-next').addEventListener('click', readerNext);
document.getElementById('reader-mode').addEventListener('change', renderReader);
document.getElementById('reader-dir').addEventListener('change', renderReader);
document.getElementById('reader-goto-btn').addEventListener('click', () => {
  const pageCount = readerPageCount();
  const n = parseInt(document.getElementById('reader-goto').value, 10);
  if (!isNaN(n)) { reader.page = Math.min(Math.max(0, n - 1), pageCount - 1); renderReader(); }
});
document.addEventListener('keydown', e => {
  if (!reader || document.getElementById('reader').hidden) return;
  const dir = document.getElementById('reader-dir').value;
  if (e.key === 'ArrowRight') dir === 'rtl' ? readerPrev() : readerNext();
  if (e.key === 'ArrowLeft') dir === 'rtl' ? readerNext() : readerPrev();
  if (e.key === 'Escape') closeReader();
});

renderHome();

// Sources: shared config (sources.json) + locally added index sources
let sharedSources = [];
let localSources = [];
try { localSources = JSON.parse(localStorage.getItem('manyeku_local_sources') || '[]'); } catch (e) { localSources = []; }
let sourceEnabled = {};
try { sourceEnabled = JSON.parse(localStorage.getItem('manyeku_source_enabled') || '{}'); } catch (e) { sourceEnabled = {}; }
let sourceSeriesCache = {};
let currentSource = null;
async function loadSharedSources() {
  try { const r = await fetch('sources.json'); sharedSources = await r.json(); } catch (e) { sharedSources = []; }
}
function allSources() { return [...sharedSources, ...localSources]; }
function isSourceEnabled(src) { return sourceEnabled[src.id] !== undefined ? !!sourceEnabled[src.id] : (src.defaultEnabled !== false); }
function demoSeries() {
  const q = (document.getElementById('source-search')?.value || '').trim();
  const titles = ['斗破苍穹', '斗罗大陆', '一人之下', '凡人修仙传', '海贼王', '火影忍者', '鬼灭之刃', '咒术回战', '完美世界', '吞噬星空'];
  if (q && !titles.some(t => t.includes(q))) titles.unshift(q);
  const p = [{ demo: true }, { demo: true }, { demo: true }, { demo: true }];
  return titles.map(t => ({
    title: t, status: 'ongoing', chapters: [
      { title: '第1话 陨落的天才', pages: p },
      { title: '第2话 斗气大陆', pages: p },
      { title: '第3话 药老现身', pages: p }
    ]
  }));
}

async function getSourceSeries(src) {
  if (src.type === 'demo') return demoSeries();
  if (sourceSeriesCache[src.id]) return sourceSeriesCache[src.id];
  let list = [];
  else if (src.type === 'index' && src.url) {
    const r = await fetch(src.url); const data = await r.json();
    if (!data || !Array.isArray(data.series)) throw new Error('索引中未找到 series 数组');
    list = data.series.map(s => ({
      title: s.title || '未命名系列', status: s.status || 'unset',
      chapters: (s.chapters || []).map(c => ({
        title: c.title || '第1话',
        pages: (c.pages || []).map(p => { try { return new URL(p, src.url).href; } catch (e) { return p; } })
      }))
    }));
  }
  sourceSeriesCache[src.id] = list; return list;
}
async function renderSources() {
  await loadSharedSources();
  const toggles = document.getElementById('source-toggles'); toggles.innerHTML = '';
  for (const src of allSources()) {
    const row = document.createElement('div'); row.className = 'chapter-row';
    const label = document.createElement('label');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isSourceEnabled(src);
    cb.addEventListener('change', () => { sourceEnabled[src.id] = cb.checked; localStorage.setItem('manyeku_source_enabled', JSON.stringify(sourceEnabled)); renderSources(); });
    label.appendChild(cb); label.append(' ' + src.name + '（' + (src.local ? '本机源' : '共享源') + '）' + (src.note ? ' · ' + src.note : ''));
    row.appendChild(label);
    if (src.local) {
      const del = document.createElement('button'); del.className = 'btn small'; del.textContent = '删除';
      del.addEventListener('click', () => { localSources = localSources.filter(x => x.id !== src.id); localStorage.setItem('manyeku_local_sources', JSON.stringify(localSources)); delete sourceSeriesCache[src.id]; renderSources(); });
      row.appendChild(del);
    }
    toggles.appendChild(row);
  }
  const q = (document.getElementById('source-search').value || '').trim();
  const cont = document.getElementById('source-cards'); cont.innerHTML = '';
  let count = 0;
  for (const src of allSources()) {
    if (!isSourceEnabled(src)) continue;
    let list = [];
    try { list = await getSourceSeries(src); } catch (e) { const err = document.createElement('p'); err.className = 'hint'; err.textContent = src.name + ' 加载失败：' + e.message; cont.appendChild(err); continue; }
    for (const s of list) {
      if (q && !s.title.includes(q)) continue;
      count++;
      const card = document.createElement('div'); card.className = 'card'; card.tabIndex = 0; card.setAttribute('role', 'button');
      const body = document.createElement('div'); body.className = 'card-body';
      body.innerHTML = '<h3>' + esc(s.title) + '</h3><p>来源：' + esc(src.name) + '</p><p>' + s.chapters.length + ' 话 · ' + s.chapters.reduce((a, c) => a + c.pages.length, 0) + ' 页 · ' + statusText(s.status) + '</p>';
      card.appendChild(body);
      card.addEventListener('click', () => showSourceDetail(src, s));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSourceDetail(src, s); } });
      cont.appendChild(card);
    }
  }
  document.getElementById('source-empty').hidden = count > 0;
}
function showSourceDetail(src, series) {
  currentSource = { src, series };
  document.getElementById('source-detail-head').innerHTML = '<h1>' + esc(series.title) + '</h1><p class="hint">来源：' + esc(src.name) + ' · ' + series.chapters.length + ' 话 · ' + series.chapters.reduce((a, c) => a + c.pages.length, 0) + ' 页</p>';
  const list = document.getElementById('source-detail-chapters'); list.innerHTML = '';
  series.chapters.forEach((c, i) => {
    const prog = getSourceProgress({ sourceId: src.id, seriesTitle: series.title, chapterTitle: c.title });
    const row = document.createElement('div'); row.className = 'chapter-row'; row.tabIndex = 0; row.setAttribute('role', 'button');
    row.innerHTML = '<span>第 ' + (i + 1) + ' 话 · ' + esc(c.title) + '</span><span class="hint">' + c.pages.length + ' 页' + (prog ? ' · 看到第 ' + (prog + 1) + ' 页' : '') + '</span>';
    row.addEventListener('click', () => openSourceReader(src, series, c));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSourceReader(src, series, c); } });
    list.appendChild(row);
  });
  showView('source-detail');
}
function openSourceReader(src, series, chapter) {
  const fake = { sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title };
  reader = { isSource: true, sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title, pages: chapter.pages, page: getSourceProgress(fake) };
  try { const pref = JSON.parse(localStorage.getItem('manyeku_reader_pref') || '{}'); if (pref.mode) document.getElementById('reader-mode').value = pref.mode; if (pref.dir) document.getElementById('reader-dir').value = pref.dir; } catch (e) {}
  document.getElementById('reader').hidden = false; document.body.style.overflow = 'hidden'; renderReader();
}
document.getElementById('source-search').addEventListener('input', renderSources);
document.getElementById('btn-add-source').addEventListener('click', async () => {
  const name = document.getElementById('add-source-name').value.trim();
  const url = document.getElementById('add-source-url').value.trim();
  const out = document.getElementById('add-source-result');
  if (!name || !url) { out.textContent = '请填写源名称和索引地址。'; return; }
  out.textContent = '正在验证索引……';
  const src = { id: uid(), name, type: 'index', url, local: true, defaultEnabled: true };
  try {
    const r = await fetch(url); const data = await r.json();
    if (!data || !Array.isArray(data.series)) throw new Error('索引中未找到 series 数组');
    localSources.push(src); localStorage.setItem('manyeku_local_sources', JSON.stringify(localSources));
    sourceEnabled[src.id] = true; localStorage.setItem('manyeku_source_enabled', JSON.stringify(sourceEnabled));
    out.textContent = '添加成功：' + name + '，共 ' + data.series.length + ' 个系列。';
    renderSources();
  } catch (e) { out.textContent = '添加失败：' + e.message; }
});

renderHome();
