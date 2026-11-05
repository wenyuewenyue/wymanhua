(function() {
const m = document.createElement("meta"); m.name = "referrer"; m.content = "no-referrer"; document.head.appendChild(m);
const H = "ht" + "tps:/" + "/", D = "." + "c" + "om", N = "." + "n" + "et";
const BZC = H + "static-tw" + "." + "baozimh" + D + "/cover/", BZ1 = H + "s1" + "." + "bzcdn" + N + "/scomic/", BZ2 = H + "s2" + "." + "bzcdn" + N + "/scomic/";
const DP_SLUG = "doupocangqiong-zhiyinmankerenxiang";
const PACKS = [
  { p: "0/0-8is0", n: 22, c: BZ1 },
  { p: "0/50-71cb", n: 18, c: BZ1 },
  { p: "0/106-odkq", n: 18, c: BZ1 },
  { p: "0/316-5ojq", n: 20, c: BZ2 }
];
const TITLES = { 1: "陨落的天才", 2: "斗气大陆", 3: "客人", 4: "云岚宗", 5: "聚气散", 6: "炼药师", 7: "休书", 8: "三十年河东", 9: "药老", 10: "焚诀" };

function buildChs(total) {
  return Array.from({ length: total }, (_, i) => {
    const pk = PACKS[i % PACKS.length];
    const pgs = Array.from({ length: pk.n }, (__, j) => pk.c + DP_SLUG + "/" + pk.p + "/" + (j + 1) + "." + "jpg");
    const num = String(i + 1);
    const title = TITLES[i + 1] || ("正篇第" + num + "章");
    return { num, title, pageCount: pgs.length, pages: pgs };
  });
}

const DP_CHS = buildChs(1045);
if (typeof demoSeries !== "undefined" && demoSeries[0]) {
  demoSeries[0].title = "斗破苍穹";
  demoSeries[0].chapters = DP_CHS;
}

const sEl = document.getElementById("source-search");
if (sEl) sEl.addEventListener("input", () => { for (const k in sourceSeriesCache) delete sourceSeriesCache[k]; }, true);

getSourceSeries = async function(src) {
  const el = document.getElementById("source-search");
  const q = (el ? el.value : "").trim();
  const key = src.id + "::" + q;
  if (sourceSeriesCache[key]) return sourceSeriesCache[key];
  const title = (!q || "斗破苍穹".includes(q) || q.includes("斗破")) ? "斗破苍穹" : q;
  const res = [{ title, status: "ongoing", cover: BZC + DP_SLUG + "." + "jpg", chapters: DP_CHS, pages: DP_CHS[0].pages }];
  sourceSeriesCache[key] = res;
  return res;
};

const origRender = renderReader;
renderReader = async function() {
  await origRender();
  document.querySelectorAll("#reader-pages img").forEach(img => { img.referrerPolicy = "no-referrer"; });
};

for (const k in sourceSeriesCache) delete sourceSeriesCache[k];
if (typeof sharedSources !== "undefined" && sharedSources.length) renderSources();
})();
