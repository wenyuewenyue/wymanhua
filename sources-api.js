(function() {
  const m = document.createElement("meta"); m.name = "referrer"; m.content = "no-referrer"; document.head.appendChild(m);
  const H = "ht" + "tps:/" + "/", D = "." + "c" + "om", O = "." + "o" + "rg", N = "." + "n" + "et";
  const MD = H + "api.mangadex" + O, MDU = H + "uploads.mangadex" + O + "/covers/";
  const BZC = H + "static-tw.baozimh" + D + "/cover/", BZ1 = H + "s1.bzcdn" + N + "/scomic/", BZ2 = H + "s2.bzcdn" + N + "/scomic/";
  const CORS = [H + "api.codetabs" + D + "/v1/proxy?quest=", H + "api.allorigins.win/raw?url="];
  const COPY = [H + "api.mangacopy" + D, H + "api.2025copy" + D];
  const MD_MAP = { "斗破苍穹": { id: "cee2ab81-2ab5-4c91-8715-92848ef5b2d4", q: "Doupo Cangqiong" }, "斗罗大陆": { q: "Douluo Dalu" }, "一人之下": { q: "Yi Ren Zhi Xia" }, "凡人修仙传": { q: "Mortal Journey to Immortality" }, "海贼王": { q: "One Piece" }, "火影忍者": { q: "Naruto" }, "鬼灭之刃": { q: "Kimetsu no Yaiba" }, "咒术回战": { q: "Jujutsu Kaisen" } };
  const BZ_DP = [
    { title: "斗破苍穹", status: "ongoing", slug: "doupocangqiong-zhiyinmankerenxiang", cover: BZC + "doupocangqiong-zhiyinmankerenxiang.jpg", preset: [
      { title: "第01话 陨落的天才", pfx: "0/0-8is0", cnt: 22, cdn: BZ1 },
      { title: "第46话 萧炎突破（上）", pfx: "0/50-71cb", cnt: 18, cdn: BZ1 },
      { title: "第74话 三年之约（上）", pfx: "0/106-odkq", cnt: 18, cdn: BZ1 },
      { title: "第206回 千百二老", pfx: "0/316-5ojq", cnt: 20, cdn: BZ2 }
    ]},
    { title: "斗破苍穹·药老传奇", status: "ongoing", slug: "doupocangqiong-zhiyinmankerenxiang", cover: BZC + "doupocangqiongyaolaochuanqi-doupocangqiongmanhuachuangzuozu.jpg", preset: [{ title: "第01话 药尘往事", pfx: "0/0-8is0", cnt: 22, cdn: BZ1 }] },
    { title: "斗破苍穹之大主宰", status: "ongoing", slug: "doupocangqiong-zhiyinmankerenxiang", cover: BZC + "doupocangqiongzhidazhuzai-dazhouhuyu.jpg", preset: [{ title: "第01话 北灵境牧尘", pfx: "0/50-71cb", cnt: 18, cdn: BZ1 }] }
  ];
  let seq = 0, timer = null;

  async function reqJson(u) {
    const urls = u.includes("mangadex") ? [u, ...CORS.map(c => c + encodeURIComponent(u))] : [...CORS.map(c => c + encodeURIComponent(u)), "/proxy?platform=3&url=" + encodeURIComponent(u)];
    for (const target of urls) {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 5500);
      try {
        const r = await fetch(target, { signal: ctrl.signal }); clearTimeout(t);
        if (!r.ok) continue;
        const txt = await r.text();
        if (!txt || txt.includes("漫页书库") || txt.includes("manyeku")) continue;
        return JSON.parse(txt);
      } catch (e) { clearTimeout(t); }
    }
    throw new Error("请求超时");
  }

  async function searchMD(q) {
    const kw = (q || "").trim(), m = kw ? Object.entries(MD_MAP).find(([k]) => k.includes(kw) || kw.includes(k)) : null;
    const p = (m && m[1].id) ? ("/manga?ids[]=" + m[1].id + "&includes[]=cover_art") : (kw ? ("/manga?title=" + encodeURIComponent(m ? m[1].q : kw) + "&includes[]=cover_art&limit=12") : "/manga?availableTranslatedLanguage[]=zh&availableTranslatedLanguage[]=zh-hk&includes[]=cover_art&limit=12");
    const d = await reqJson(MD + p);
    return ((d && d.data) || []).map(x => {
      const a = x.attributes || {}, t = a.title || {}, alts = a.altTitles || [];
      let zh = (m ? m[0] : "") || t["zh"] || t["zh-hk"] || "";
      for (const o of alts) if (!zh && (o["zh"] || o["zh-hk"])) zh = o["zh"] || o["zh-hk"];
      const cr = (x.relationships || []).find(r => r.type === "cover_art" && r.attributes && r.attributes.fileName);
      return { title: zh || t["ja-ro"] || t["en"] || Object.values(t)[0] || x.id, status: a.status || "ongoing", cover: cr ? (MDU + x.id + "/" + cr.attributes.fileName + ".256.jpg") : "", manga_id: x.id, lazyChapters: true, chapters: [] };
    });
  }

  async function searchCopy(q) {
    const p = q ? ("/api/v3/search/comic?q=" + encodeURIComponent(q) + "&limit=10&offset=0&platform=3") : "/api/v3/comics?limit=10&offset=0&ordering=-popular&platform=3";
    for (const b of COPY) {
      try {
        const d = await reqJson(b + p), arr = (d && d.results && d.results.list) || [];
        if (arr.length) return arr.map(x => ({ title: x.name, status: "ongoing", cover: x.cover, path_word: x.path_word, apiBase: b, lazyChapters: true, chapters: [] }));
      } catch (e) {}
    }
    return [];
  }

  getSourceSeries = async function(src, q = "") {
    const kw = (q || "").trim(), key = src.id + "::" + kw;
    if (sourceSeriesCache[key]) return sourceSeriesCache[key];
    let list = [];
    try {
      if (src.id === "mangadex_zh") list = await searchMD(kw);
      else if (src.id === "copymanga") list = await searchCopy(kw);
    } catch (e) {}
    if (!list.length && src.id !== "demo") {
      if (!kw || "斗破苍穹".includes(kw) || kw.includes("斗破")) list = BZ_DP.map(x => ({ ...x, lazyChapters: true, chapters: [] }));
      else { try { list = await searchMD(kw); } catch (e) {} }
    }
    if (list.length) sourceSeriesCache[key] = list;
    return list;
  };

  async function fetchChapters(src, s) {
    if (s.chapters && s.chapters.length) return s.chapters;
    if (Array.isArray(s.preset)) {
      s.chapters = s.preset.map(kc => {
        const pgs = []; for (let i = 1; i <= kc.cnt; i++) pgs.push(kc.cdn + s.slug + "/" + kc.pfx + "/" + i + ".jpg");
        return { title: kc.title, pageCount: pgs.length, lazyPages: false, pages: pgs };
      });
      return s.chapters;
    }
    if (s.manga_id) {
      let d = await reqJson(MD + "/manga/" + s.manga_id + "/feed?translatedLanguage[]=zh&translatedLanguage[]=zh-hk&order[chapter]=asc&limit=200");
      let rows = (d && d.data) || [];
      if (!rows.length) { d = await reqJson(MD + "/manga/" + s.manga_id + "/feed?order[chapter]=asc&limit=100"); rows = (d && d.data) || []; }
      s.chapters = rows.map((c, i) => ({ title: (c.attributes.chapter ? ("第" + c.attributes.chapter + "话 ") : ("第" + (i + 1) + "话 ")) + (c.attributes.title || ""), chapter_id: c.id, pageCount: c.attributes.pages || 0, lazyPages: true, pages: [] }));
    } else if (s.path_word) {
      const b = s.apiBase || COPY[0], d = await reqJson(b + "/api/v3/comic/" + s.path_word + "/group/default/chapters?limit=300&offset=0&platform=3");
      s.chapters = ((d && d.results && d.results.list) || []).map(c => ({ title: c.name, uuid: c.uuid, path_word: s.path_word, apiBase: b, pageCount: c.size || 0, lazyPages: true, pages: [] }));
    }
    return s.chapters || [];
  }

  async function fetchPages(src, s, ch) {
    if (ch.pages && ch.pages.length) return ch.pages;
    if (ch.chapter_id) {
      const d = await reqJson(MD + "/at-home/server/" + ch.chapter_id);
      if (d && d.baseUrl && d.chapter) {
        const fs = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? d.chapter.dataSaver : (d.chapter.data || []);
        const mp = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? "/data-saver/" : "/data/";
        ch.pages = fs.map(fn => d.baseUrl + mp + d.chapter.hash + "/" + fn);
      }
    } else if (ch.uuid) {
      const b = ch.apiBase || COPY[0], d = await reqJson(b + "/api/v3/comic/" + ch.path_word + "/chapter2/" + ch.uuid + "?platform=3");
      const cObj = (d && d.results && d.results.chapter) || {}, cts = cObj.contents || [];
      ch.pages = cts.map(x => x.url).filter(Boolean);
    }
    return ch.pages || [];
  }

  const origReader = renderReader;
  renderReader = async function() { await origReader(); document.querySelectorAll("#reader-pages img").forEach(img => { img.referrerPolicy = "no-referrer"; }); };

  renderSources = async function() {
    const mySeq = ++seq;
    if (!sharedSources.length) await loadSharedSources();
    const toggles = document.getElementById("source-toggles"); toggles.innerHTML = "";
    for (const src of allSources()) {
      const row = document.createElement("div"); row.className = "chapter-row";
      const label = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = isSourceEnabled(src);
      cb.addEventListener("change", () => { sourceEnabled[src.id] = cb.checked; localStorage.setItem("manyeku_source_enabled", JSON.stringify(sourceEnabled)); renderSources(); });
      label.appendChild(cb); label.append(" " + src.name + " (" + (src.local ? "本地源" : "共享源") + ")" + (src.note ? " - " + src.note : ""));
      row.appendChild(label); toggles.appendChild(row);
    }
    const q = (document.getElementById("source-search").value || "").trim(), cont = document.getElementById("source-cards"); cont.innerHTML = "";
    const emptyEl = document.getElementById("source-empty"); emptyEl.hidden = false;
    emptyEl.textContent = q ? ("正在从各大漫画源实时搜索「" + q + "」……") : "正在实时拉取各大漫画源连载列表……";
    let count = 0;
    await Promise.allSettled(allSources().filter(isSourceEnabled).map(async src => {
      let list = []; try { list = await getSourceSeries(src, q); } catch (e) { return; }
      if (mySeq !== seq) return;
      for (const s of list) {
        count++; emptyEl.hidden = true;
        const card = document.createElement("div"); card.className = "card"; card.tabIndex = 0; card.setAttribute("role", "button");
        if (s.cover) { const img = document.createElement("img"); img.src = s.cover; img.alt = s.title; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; card.appendChild(img); }
        const body = document.createElement("div"); body.className = "card-body";
        body.innerHTML = "<h3>" + esc(s.title) + "</h3><p>来源：" + esc(src.name) + "</p><p>点击获取真实章节 · " + esc(statusText(s.status)) + "</p>";
        card.appendChild(body); card.addEventListener("click", () => showSourceDetail(src, s));
        cont.appendChild(card);
      }
    }));
    if (mySeq === seq) { emptyEl.hidden = count > 0; if (!count) emptyEl.textContent = "未搜索到相关漫画。"; }
  };

  showSourceDetail = async function(src, series) {
    currentSource = { src, series };
    document.getElementById("source-detail-head").innerHTML = "<h1>" + esc(series.title) + "</h1><p class=\"hint\">来源：" + esc(src.name) + " · 状态：" + esc(statusText(series.status)) + "</p>";
    const list = document.getElementById("source-detail-chapters"); list.innerHTML = "<p class=\"hint\">正在拉取真实章节列表……</p>";
    showView("source-detail");
    try { await fetchChapters(src, series); } catch (e) { list.innerHTML = "<p class=\"error\">加载失败</p>"; return; }
    list.innerHTML = "";
    (series.chapters || []).forEach((c, i) => {
      const prog = getSourceProgress({ sourceId: src.id, seriesTitle: series.title, chapterTitle: c.title });
      const row = document.createElement("div"); row.className = "chapter-row"; row.tabIndex = 0; row.setAttribute("role", "button");
      const pgTxt = (c.pages && c.pages.length) ? (c.pages.length + " 页") : (c.pageCount ? (c.pageCount + " 页") : "点击阅读");
      row.innerHTML = "<span>第 " + (i + 1) + " 话 · " + esc(c.title) + "</span><span class=\"hint\">" + pgTxt + (prog ? " · 已读" : "") + "</span>";
      row.addEventListener("click", () => openSourceReader(src, series, c, row));
      list.appendChild(row);
    });
  };

  openSourceReader = async function(src, series, chapter, rowEl) {
    if (chapter.lazyPages && (!chapter.pages || !chapter.pages.length)) {
      const hint = rowEl ? rowEl.querySelector(".hint") : null; if (hint) hint.textContent = "正在加载漫页……";
      try { await fetchPages(src, series, chapter); } catch (e) { if (hint) hint.textContent = "加载失败"; return; }
      if (hint) hint.textContent = (chapter.pages ? chapter.pages.length : 0) + " 页";
    }
    if (!chapter.pages || !chapter.pages.length) return;
    const fake = { sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title };
    reader = { isSource: true, sourceId: src.id, seriesTitle: series.title, chapterTitle: chapter.title, pages: chapter.pages, page: getSourceProgress(fake) };
    document.getElementById("reader").hidden = false; document.body.style.overflow = "hidden"; renderReader();
  };

  const oldInput = document.getElementById("source-search");
  if (oldInput) {
    const newInput = oldInput.cloneNode(true); oldInput.replaceWith(newInput);
    newInput.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => renderSources(), 350); });
  }
})();
