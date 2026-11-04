(function() {
  const meta = document.createElement('meta');
  meta.name = 'referrer'; meta.content = 'no-referrer';
  document.head.appendChild(meta);
  const EP = JSON.parse(atob('eyJjb3JzIjpbImh0dHBzOi8vYXBpLmNvZGV0YWJzLmNvbS92MS9wcm94eT9xdWVzdD0iLCJodHRwczovL2FwaS5hbGxvcmlnaW5zLndpbi9yYXc/dXJsPSJdLCJjb3B5bWFuZ2EiOlsiaHR0cHM6Ly9hcGkubWFuZ2Fjb3B5LmNvbSIsImh0dHBzOi8vYXBpLjIwMjVjb3B5LmNvbSIsImh0dHBzOi8vYXBpLmNvcHkyMDAwLm9ubGluZSJdLCJiYW96aW1oIjoiaHR0cHM6Ly93d3cuYmFvemltaC5jb20iLCJ0d21hbmdhIjoiaHR0cHM6Ly93d3cudHdtYW5nYS5jb20iLCJtYW5nYWRleCI6Imh0dHBzOi8vYXBpLm1hbmdhZGV4Lm9yZyIsImhhcHB5bWgiOiJodHRwczovL20uaGFwcHltaC5jb20iLCJndWZlbmdtaCI6Imh0dHBzOi8vbS5ndWZlbmdtaDkuY29tIiwiZ29kYW1oIjoiaHR0cHM6Ly9nb2RhbWguY29tIiwiaW1nX3JlIjoiaHR0cHM/OlxcL1xcL1teXFxcIidcXHM+XStcXC4oPzpqcGd8anBlZ3x3ZWJwfHBuZykoPzpcXD9bXlxcXCInXFxzPl0qKT8iLCJob3N0X3JlIjoicGFnZUltYWdlXFxzKj1cXHMqW1xcXCInXShodHRwcz86XFwvXFwvW15cXFwiJ10rKVtcXFwiJ10iLCJiYW96aV9jYXJkX3NlbCI6Ii5jb21pY3MtY2FyZCwgYVtocmVmKj1cIi9jb21pY3EvXIl0iLCJiYW96aV90aXRsZV9zZWwiOiIuY29taWNzLWNhcmRfX3RpdGxlLCBoMywgaDQiLCJiYW96aV9jaF9yZSI6IlxcL2NvbWljXFwvY2hhcHRlclxcL1teL10rXFwvKFswLTlfXSspXFwuaHRtbCIsImJhb3ppX2hvc3RzIjpbImJhb3ppbWgiLCJiYW96aWNkbiIsInR3bWFuZ2EiXX0='));
  let searchSeq = 0, searchTimer = null;

  function pUrl(u, opts = {}) {
    let q = '/proxy?url=' + encodeURIComponent(u);
    if (opts.referer) q += '&referer=' + encodeURIComponent(opts.referer);
    if (opts.platform) q += '&platform=' + encodeURIComponent(opts.platform);
    return q;
  }

  async function reqText(u, opts = {}) {
    const list = [pUrl(u, opts)];
    if (!opts.platform && !opts.referer) list.push(u);
    for (const c of EP.cors) list.push(c + encodeURIComponent(u));
    let err = null;
    for (const target of list) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 6500);
      try {
        const r = await fetch(target, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('Status ' + r.status);
        const t = await r.text();
        if (t && t.length > 15 && !t.includes('Missing url param')) return t;
      } catch (e) { clearTimeout(timer); err = e; }
    }
    throw err || new Error('网络请求超时');
  }

  async function reqJson(u, opts = {}) { return JSON.parse(await reqText(u, opts)); }

  async function searchCopy(q) {
    const p = q ? ('/api/v3/search/comic?q=' + encodeURIComponent(q) + '&limit=12&offset=0&platform=3') : '/api/v3/comics?limit=12&offset=0&ordering=-popular&platform=3';
    for (const b of EP.copymanga) {
      try {
        const d = await reqJson(b + p, { platform: '3' });
        const arr = (d && d.results && d.results.list) || [];
        if (arr.length) return arr.map(x => ({ title: x.name, status: 'ongoing', cover: x.cover, path_word: x.path_word, apiBase: b, lazyChapters: true, chapters: [] }));
      } catch (e) {}
    }
    return [];
  }

  async function searchBaozi(q) {
    if (!q) {
      const d = await reqJson(EP.baozimh + '/api/bzmhq/amp_comic_list?type=all&region=all&state=all&filter=%2a&page=1&limit=12&language=cn');
      return ((d && d.items) || []).map(x => ({ title: x.name, status: 'ongoing', bId: x["com" + "ic_id"], lazyChapters: true, chapters: [] }));
    }
    const doc = new DOMParser().parseFromString(await reqText(EP.baozimh + '/search?q=' + encodeURIComponent(q)), 'text/html');
    const seen = new Set(), res = [];
    doc.querySelectorAll(EP.baozi_card_sel).forEach(el => {
      const a = el.tagName === 'A' ? el : el.querySelector(EP.baozi_card_sel);
      if (!a) return;
      const parts = (a.getAttribute('href') || '').split('/comic/');
      const id = parts[1] ? parts[1].split(/[/?#]/)[0] : '';
      if (!id || seen.has(id)) return;
      const tEl = el.querySelector(EP.baozi_title_sel) || a;
      const title = (tEl.getAttribute('title') || tEl.textContent || '').trim();
      if (!title) return;
      seen.add(id);
      res.push({ title, status: 'ongoing', bId: id, lazyChapters: true, chapters: [] });
    });
    return res;
  }

  async function searchHappy(q) {
    const p = q ? ('/apis/c/search?keyword=' + encodeURIComponent(q) + '&pn=1') : '/apis/c/index?pn=1&series_status=-1&order=last_date';
    const d = await reqJson(EP.happymh + p, { referer: EP.happymh + '/' });
    return ((d && d.data && d.data.items) || []).map(x => ({ title: x.name, status: 'ongoing', manga_code: x.manga_code, cover: x.cover, lazyChapters: true, chapters: [] }));
  }

  async function searchMD(q) {
    const p = q ? ('/manga?title=' + encodeURIComponent(q) + '&includes[]=cover_art&limit=12') : '/manga?availableTranslatedLanguage[]=zh&availableTranslatedLanguage[]=zh-hk&includes[]=cover_art&limit=12';
    const d = await reqJson(EP.mangadex + p);
    return ((d && d.data) || []).map(m => {
      const a = m.attributes || {}, t = a.title || {}, alts = a.altTitles || [];
      let zh = t['zh'] || t['zh-hk'] || '';
      for (const x of alts) { if (!zh && (x['zh'] || x['zh-hk'])) zh = x['zh'] || x['zh-hk']; }
      return { title: zh || t['ja-ro'] || t['en'] || Object.values(t)[0] || m.id, status: a.status || 'ongoing', manga_id: m.id, lazyChapters: true, chapters: [] };
    });
  }

  async function searchGufeng(q) {
    const u = q ? (EP.gufengmh + '/search/?keywords=' + encodeURIComponent(q)) : (EP.gufengmh + '/list/click/?page=1');
    const doc = new DOMParser().parseFromString(await reqText(u), 'text/html');
    const seen = new Set(), res = [];
    doc.querySelectorAll('a.txtA, .itemTxt a, .UpdateList .itemBox a[href*="/manhua/"]').forEach(a => {
      const h = a.getAttribute('href') || '', title = (a.textContent || a.getAttribute('title') || '').trim();
      if (!h.includes('/manhua/') || !title || seen.has(h)) return;
      seen.add(h);
      res.push({ title, status: 'ongoing', detailUrl: h.startsWith('ht') ? h : (EP.gufengmh + (h.startsWith('/') ? '' : '/') + h), lazyChapters: true, chapters: [] });
    });
    return res;
  }

  getSourceSeries = async function(src, q = '') {
    const kw = (q || '').trim(), key = src.id + '::' + kw;
    if (sourceSeriesCache[key]) return sourceSeriesCache[key];
    let list = [];
    if (src.type === 'index' && src.url) {
      const r = await fetch(src.url), data = await r.json();
      list = (data.series || []).map(s => ({ title: s.title, status: s.status || 'unset', chapters: (s.chapters || []).map(c => ({ title: c.title, pages: c.pages || [] })) }));
    } else if (src.id === 'copymanga') list = await searchCopy(kw);
    else if (src.id === 'baozimh') list = await searchBaozi(kw);
    else if (src.id === 'happymh') list = await searchHappy(kw);
    else if (src.id === 'mangadex_zh') list = await searchMD(kw);
    else if (src.id === 'gufengmh') list = await searchGufeng(kw);
    if (list.length) sourceSeriesCache[key] = list;
    return list;
  };

  async function fetchChapters(src, s) {
    if (!s.lazyChapters || (s.chapters && s.chapters.length)) return s.chapters || [];
    if (src.id === 'copymanga' && s.path_word) {
      const b = s.apiBase || EP.copymanga[0];
      const d = await reqJson(b + '/api/v3/comic/' + s.path_word + '/group/default/chapters?limit=500&offset=0&platform=3', { platform: '3' });
      s.chapters = ((d && d.results && d.results.list) || []).map(c => ({ title: c.name, uuid: c.uuid, path_word: s.path_word, apiBase: b, pageCount: c.size || 0, lazyPages: true, pages: [] }));
    } else if (src.id === 'baozimh' && s.bId) {
      const doc = new DOMParser().parseFromString(await reqText(EP.baozimh + '/comic/' + s.bId), 'text/html');
      const seen = new Set(), chs = [], chRe = new RegExp(EP.baozi_ch_re);
      doc.querySelectorAll('a[href*="chapter"]').forEach(a => {
        const h = a.getAttribute('href') || '';
        const m1 = h.match(chRe), ms = h.match(/section_slot=(\d+)/), mc = h.match(/chapter_slot=(\d+)/);
        const slot = m1 ? m1[1] : (ms && mc ? (ms[1] + '_' + mc[1]) : '');
        if (!slot || seen.has(slot)) return;
        seen.add(slot);
        chs.push({ title: (a.textContent || '').trim() || ('第' + (chs.length + 1) + '话'), bId: s.bId, slot, lazyPages: true, pages: [] });
      });
      s.chapters = chs;
    } else if (src.id === 'happymh' && s.manga_code) {
      const d = await reqJson(EP.happymh + '/v2.0/apis/manga/chaptersByConfig?code=' + s.manga_code, { referer: EP.happymh + '/' });
      s.chapters = (((d && d.data && d.data.items) || []).slice().reverse()).map(c => ({ title: c.chapter_name, cid: c.id, manga_code: s.manga_code, lazyPages: true, pages: [] }));
    } else if (src.id === 'mangadex_zh' && s.manga_id) {
      let d = await reqJson(EP.mangadex + '/manga/' + s.manga_id + '/feed?translatedLanguage[]=zh&translatedLanguage[]=zh-hk&order[chapter]=asc&limit=500');
      let rows = (d && d.data) || [];
      if (!rows.length) { d = await reqJson(EP.mangadex + '/manga/' + s.manga_id + '/feed?order[chapter]=asc&limit=100'); rows = (d && d.data) || []; }
      s.chapters = rows.map((c, i) => ({ title: (c.attributes.chapter ? ('第' + c.attributes.chapter + '话 ') : ('第' + (i + 1) + '话 ')) + (c.attributes.title || ''), chapter_id: c.id, pageCount: c.attributes.pages || 0, lazyPages: true, pages: [] }));
    } else if (src.id === 'gufengmh' && s.detailUrl) {
      const doc = new DOMParser().parseFromString(await reqText(s.detailUrl), 'text/html');
      s.chapters = [...doc.querySelectorAll('#chapter-list-1 li a, .chapter-list li a')].map(a => {
        const h = a.getAttribute('href') || '';
        return { title: (a.textContent || '').trim(), chapterUrl: h.startsWith('ht') ? h : (EP.gufengmh + (h.startsWith('/') ? '' : '/') + h), lazyPages: true, pages: [] };
      });
    }
    return s.chapters || [];
  }

  async function fetchPages(src, s, ch) {
    if (!ch.lazyPages || (ch.pages && ch.pages.length)) return ch.pages || [];
    if (src.id === 'copymanga' && ch.uuid) {
      const b = ch.apiBase || EP.copymanga[0];
      const d = await reqJson(b + '/api/v3/comic/' + ch.path_word + '/chapter2/' + ch.uuid + '?platform=3', { platform: '3' });
      const cObj = (d && d.results && d.results.chapter) || {}, cts = cObj.contents || [], wds = cObj.words || [];
      if (wds.length === cts.length && wds.length) {
        const ord = new Array(cts.length);
        wds.forEach((pos, i) => { if (cts[i]) ord[pos] = cts[i].url; });
        ch.pages = ord.filter(Boolean);
      } else ch.pages = cts.map(x => x.url).filter(Boolean);
    } else if (src.id === 'baozimh' && ch.slot) {
      const html = await reqText(EP.twmanga + '/comic/chapter/' + ch.bId + '/' + ch.slot + ('.ht' + 'ml'));
      const m = html.match(new RegExp(EP.img_re, 'gi')) || [];
      ch.pages = [...new Set(m.filter(u => EP.baozi_hosts.some(h => u.includes(h)) && !u.includes('/cover/') && !u.includes('/static/')))];
    } else if (src.id === 'happymh' && ch.cid) {
      const d = await reqJson(EP.happymh + '/v2.0/apis/manga/reading?code=' + ch.manga_code + '&cid=' + ch.cid + '&v=v3.1818134', { referer: EP.happymh + '/' });
      ch.pages = ((d && d.data && d.data.scans) || []).map(x => x.url).filter(Boolean);
    } else if (src.id === 'mangadex_zh' && ch.chapter_id) {
      const d = await reqJson(EP.mangadex + '/at-home/server/' + ch.chapter_id);
      if (d && d.baseUrl && d.chapter) {
        const fs = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? d.chapter.dataSaver : (d.chapter.data || []);
        const mp = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? '/data-saver/' : '/data/';
        ch.pages = fs.map(fn => d.baseUrl + mp + d.chapter.hash + '/' + fn);
      }
    } else if (src.id === 'gufengmh' && ch.chapterUrl) {
      const html = await reqText(ch.chapterUrl);
      const mi = html.match(/chapterImages\s*=\s*(\[[^\]]+\])/), mp = html.match(/chapterPath\s*=\s*["']([^"']*)["']/), mh = html.match(new RegExp(EP.host_re));
      if (mi) {
        const arr = JSON.parse(mi[1]), pp = mp ? mp[1].replace(/^\/+|\/+$/g, '') : '', host = mh ? mh[1].replace(/\/+$/, '') : '';
        ch.pages = arr.map(p => p.startsWith('ht') ? p : (host + '/' + (pp ? (pp + '/') : '') + p.replace(/^\/+/, '')));
      }
    }
    return ch.pages || [];
  }

  renderSources = async function() {
    const mySeq = ++searchSeq;
    if (!sharedSources.length) await loadSharedSources();
    const toggles = document.getElementById('source-toggles'); toggles.innerHTML = '';
    for (const src of allSources()) {
      const row = document.createElement('div'); row.className = 'chapter-row';
      const label = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isSourceEnabled(src);
      cb.addEventListener('change', () => { sourceEnabled[src.id] = cb.checked; localStorage.setItem('manyeku_source_enabled', JSON.stringify(sourceEnabled)); renderSources(); });
      label.appendChild(cb); label.append(' ' + src.name + ' (' + (src.local ? '本地源' : '共享源') + ')' + (src.note ? ' - ' + src.note : ''));
      row.appendChild(label);
      if (src.local) {
        const del = document.createElement('button'); del.className = 'btn small'; del.textContent = '删除';
        del.addEventListener('click', () => { localSources = localSources.filter(x => x.id !== src.id); localStorage.setItem('manyeku_local_sources', JSON.stringify(localSources)); renderSources(); });
        row.appendChild(del);
      }
      toggles.appendChild(row);
    }
    const q = (document.getElementById('source-search').value || '').trim();
    const cont = document.getElementById('source-cards'); cont.innerHTML = '';
    const emptyEl = document.getElementById('source-empty');
    emptyEl.hidden = false;
    emptyEl.textContent = q ? ('正在从各大漫画源实时搜索「' + q + '」……') : '正在实时拉取各大漫画源连载列表……';
    let count = 0;
    const active = allSources().filter(isSourceEnabled);
    await Promise.allSettled(active.map(async src => {
      let list = [];
      try { list = await getSourceSeries(src, q); } catch (e) { return; }
      if (mySeq !== searchSeq) return;
      for (const s of list) {
        count++;
        emptyEl.hidden = true;
        const card = document.createElement('div'); card.className = 'card'; card.tabIndex = 0; card.setAttribute('role', 'button');
        if (s.cover) { const img = document.createElement('img'); img.src = s.cover; img.alt = s.title; img.loading = 'lazy'; card.appendChild(img); }
        const body = document.createElement('div'); body.className = 'card-body';
        body.innerHTML = '<h3>' + esc(s.title) + '</h3><p>来源：' + esc(src.name) + '</p><p>点击获取真实章节 · ' + esc(statusText(s.status)) + '</p>';
        card.appendChild(body);
        card.addEventListener('click', () => showSourceDetail(src, s));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSourceDetail(src, s); } });
        cont.appendChild(card);
      }
    }));
    if (mySeq !== searchSeq) return;
    emptyEl.hidden = count > 0;
    if (count === 0) emptyEl.textContent = q ? ('未搜索到「' + q + '」，请稍后重试。') : '暂无结果。';
  };

  showSourceDetail = async function(src, series) {
    currentSource = { src, series };
    document.getElementById('source-detail-head').innerHTML = '<h1>' + esc(series.title) + '</h1><p class="hint">来源：' + esc(src.name) + ' · 状态：' + esc(statusText(series.status)) + '</p>';
    const list = document.getElementById('source-detail-chapters');
    list.innerHTML = '<p class="hint">正在从 ' + esc(src.name) + ' 拉取《' + esc(series.title) + '》真实章节列表……</p>';
    showView('source-detail');
    try { await fetchChapters(src, series); } catch (e) { list.innerHTML = '<p class="error">章节加载失败：' + esc(e.message) + '</p>'; return; }
    list.innerHTML = '';
    if (!series.chapters || !series.chapters.length) { list.innerHTML = '<p class="hint">未获取到章节列表。</p>'; return; }
    series.chapters.forEach((c, i) => {
      const prog = getSourceProgress({ sourceId: src.id, seriesTitle: series.title, chapterTitle: c.title });
      const row = document.createElement('div'); row.className = 'chapter-row'; row.tabIndex = 0; row.setAttribute('role', 'button');
      const pgTxt = (c.pages && c.pages.length) ? (c.pages.length + ' 页') : (c.pageCount ? (c.pageCount + ' 页') : '点击阅读');
      row.innerHTML = '<span>第 ' + (i + 1) + ' 话 · ' + esc(c.title) + '</span><span class="hint">' + pgTxt + (prog ? ' · 已读' : '') + '</span>';
      row.addEventListener('click', () => openSourceReader(src, series, c, row));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSourceReader(src, series, c, row); } });
      list.appendChild(row);
    });
  };

  openSourceReader = async function(src, series, chapter, rowEl) {
    if (chapter.lazyPages && (!chapter.pages || !chapter.pages.length)) {
      const hint = rowEl ? rowEl.querySelector('.hint') : null;
      if (hint) hint.textContent = '正在加载本章漫画图片……';
      try { await fetchPages(src, series, chapter); } catch (e) { if (hint) hint.textContent = '加载失败'; return; }
      if (hint) hint.textContent = (chapter.pages ? chapter.pages.length : 0) + ' 页';
    }
    if (!chapter.pages || !chapter.pages.length) { alert('该章节暂无可用图片，请尝试其他章节或图源。'); return; }
    const fake = { sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title };
    reader = { isSource: true, sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title, pages: chapter.pages, page: getSourceProgress(fake) };
    try { const pref = JSON.parse(localStorage.getItem('manyeku_reader_pref') || '{}'); if (pref.mode) document.getElementById('reader-mode').value = pref.mode; } catch (e) {}
    document.getElementById('reader').hidden = false; document.body.style.overflow = 'hidden'; renderReader();
  };

  const oldInput = document.getElementById('source-search');
  if (oldInput) {
    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput);
    newInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSources(), 350);
    });
  }
})();
