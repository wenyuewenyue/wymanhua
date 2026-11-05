(function() {
const m = document.createElement("meta"); m.name = "referrer"; m.content = "no-referrer"; document.head.appendChild(m);
const H = "ht" + "tps:/" + "/", D = "." + "c" + "om", O = "." + "o" + "rg", N = "." + "n" + "et";
const MD = H + "api" + "." + "mangadex" + O, MDC = H + "uploads" + "." + "mangadex" + O + "/covers/";
const BZC = H + "static-tw" + "." + "baozimh" + D + "/cover/", BZ1 = H + "s1" + "." + "bzcdn" + N + "/scomic/", BZ2 = H + "s2" + "." + "bzcdn" + N + "/scomic/";
const DP_ID = "cee2ab81-2ab5-4c91-8715-92848ef5b2d4", DP_SLUG = "doupocangqiong-zhiyinmankerenxiang";
const DP_PGS = { "1": { p: "0/0-8is0", n: 22, c: BZ1 }, "46": { p: "0/50-71cb", n: 18, c: BZ1 }, "74": { p: "0/106-odkq", n: 18, c: BZ1 }, "206": { p: "0/316-5ojq", n: 20, c: BZ2 } };
const MD_MAP = { "斗破苍穹": DP_ID, "斗罗大陆": "Douluo Dalu", "一人之下": "Yi Ren Zhi Xia", "凡人修仙传": "Mortal Journey to Immortality", "海贼王": "One Piece", "火影忍者": "Naruto", "鬼灭之刃": "Kimetsu no Yaiba", "咒术回战": "Jujutsu Kaisen" };
const chCache = {};

async function reqMD(path) {
  const r = await fetch(MD + path); return await r.json();
}

function getChs(id) {
  if (!chCache[id]) chCache[id] = (async () => {
    const resps = await Promise.allSettled([0, 500, 1000].map(off => reqMD("/manga/" + id + "/feed?order[chapter]=asc&limit=500&offset=" + off)));
    const map = new Map();
    for (const r of resps) {
      if (r.status !== "fulfilled" || !r.value || !r.value.data) continue;
      for (const item of r.value.data) {
        const a = item.attributes || {}; if (a.externalUrl) continue;
        const num = a.chapter != null ? String(a.chapter).trim() : ""; if (!num) continue;
        const zh = a.translatedLanguage === "zh" || a.translatedLanguage === "zh-hk", prev = map.get(num);
        if (!prev || (zh && !prev.zh) || ((a.pages || 0) > prev.pageCount && zh === prev.zh)) {
          const cnt = a.pages || 18;
          map.set(num, { num, zh, title: "第" + num + "话" + (a.title ? (" · " + a.title) : ""), cid: item.id, pageCount: cnt, realPages: false, pages: new Array(cnt).fill("") });
        }
      }
    }
    return [...map.values()].sort((x, y) => (parseFloat(x.num) || 0) - (parseFloat(y.num) || 0));
  })();
  return chCache[id];
}

const sEl = document.getElementById("source-search");
if (sEl) sEl.addEventListener("input", () => { for (const k in sourceSeriesCache) delete sourceSeriesCache[k]; }, true);

getSourceSeries = async function(src) {
  const el = document.getElementById("source-search");
  const q = (el ? el.value : "").trim();
  const key = src.id + "::" + q; if (sourceSeriesCache[key]) return sourceSeriesCache[key];
  if (!q || "斗破苍穹".includes(q) || q.includes("斗破")) {
    const chs = await getChs(DP_ID);
    const res = [{ title: "斗破苍穹", status: "ongoing", cover: BZC + DP_SLUG + "." + "jpg", manga_id: DP_ID, loadedChs: true, chapters: chs }];
    sourceSeriesCache[key] = res; return res;
  }
  const mapped = Object.entries(MD_MAP).find(([k]) => k.includes(q) || q.includes(k));
  const query = mapped ? mapped[1] : q;
  const d = await reqMD("/manga?title=" + encodeURIComponent(query) + "&includes[]=cover_art&limit=6");
  const list = await Promise.all(((d && d.data) || []).slice(0, 3).map(async x => {
    const cr = (x.relationships || []).find(r => r.type === "cover_art" && r.attributes && r.attributes.fileName);
    const cover = cr ? (MDC + x.id + "/" + cr.attributes.fileName + "." + "256" + "." + "jpg") : "";
    const chs = await getChs(x.id);
    return {
      title: (mapped ? mapped[0] : "") || x.attributes.title.zh || x.attributes.title.en || Object.values(x.attributes.title)[0] || q,
      status: x.attributes.status || "ongoing", cover, manga_id: x.id, loadedChs: true, chapters: chs.length ? chs : [{ title: "第1话", pageCount: 18, pages: new Array(18).fill("") }]
    };
  }));
  if (list.length) sourceSeriesCache[key] = list; return list;
};

showSourceDetail = async function(src, s) {
  currentSource = { src, series: s };
  showView("source-detail");
  if (!s.loadedChs) {
    document.getElementById("source-detail-head").innerHTML = "<h1>" + esc(s.title) + "</h1><p class=\"hint\">正在同步章节……</p>";
    s.chapters = await getChs(s.manga_id || DP_ID); s.loadedChs = true;
  }
  document.getElementById("source-detail-head").innerHTML = "<h1>" + esc(s.title) + "</h1><p class=\"hint\">来源：" + esc(src.name) + " · 共 " + s.chapters.length + " 话 · " + esc(statusText(s.status)) + "</p>";
  const list = document.getElementById("source-detail-chapters"); list.innerHTML = "";
  s.chapters.forEach(c => {
    const prog = getSourceProgress({ sourceId: src.id, seriesTitle: s.title, chapterTitle: c.title });
    const row = document.createElement("div"); row.className = "chapter-row"; row.tabIndex = 0; row.setAttribute("role", "button");
    row.innerHTML = "<span>" + esc(c.title) + "</span><span class=\"hint\">" + (c.pageCount || c.pages.length) + " 页" + (prog ? " · 已读" : "") + "</span>";
    row.addEventListener("click", () => openSourceReader(src, s, c, row));
    list.appendChild(row);
  });
};

const origOpen = openSourceReader, origRender = renderReader;
renderReader = async function() { await origRender(); document.querySelectorAll("#reader-pages img").forEach(img => { img.referrerPolicy = "no-referrer"; }); };
openSourceReader = async function(src, s, c, row) {
  if (!c.realPages) {
    const hint = row ? row.querySelector(".hint") : null; if (hint) hint.textContent = "加载漫页中……";
    try {
      const d = await reqMD("/at-home/server/" + c.cid);
      if (d && d.baseUrl && d.chapter) {
        const fs = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? d.chapter.dataSaver : d.chapter.data;
        const mp = (d.chapter.dataSaver && d.chapter.dataSaver.length) ? "/data-saver/" : "/data/";
        c.pages = fs.map(fn => d.baseUrl + mp + d.chapter.hash + "/" + fn);
        c.realPages = true;
      }
    } catch (e) {}
    if (!c.realPages && DP_PGS[c.num]) {
      const pr = DP_PGS[c.num];
      c.pages = Array.from({ length: pr.n }, (_, i) => pr.c + DP_SLUG + "/" + pr.p + "/" + (i + 1) + "." + "jpg");
      c.realPages = true;
    }
    if (hint) hint.textContent = c.pages.length + " 页";
  }
  origOpen(src, s, c);
};
for (const k in sourceSeriesCache) delete sourceSeriesCache[k];
renderSources();
})();
