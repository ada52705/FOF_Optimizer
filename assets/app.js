const state = {
  sheet: "Sheet2",
  target: 0.08,
  selected: new Set(),
  metrics: null,
  result: null,
  navHoverIndex: null,
  weightHoverIndex: null,
  riskHoverIndex: null,
  views: {},
};

const RISK_FREE_RATE = 0.0173;
const coreNames = new Set([
  "上证红利指数",
  "中债综合指数",
  "沪深300",
  "招商股票市场中性私募指数",
  "火富牛中证1000指增精选指数",
  "招商CTA私募指数",
  "火富牛套利策略精选指数",
]);

const palette = [
  "#733B73", "#F55654", "#F99551", "#FFD58C", "#91B87C", "#427C80",
  "#2F1A4C", "#636AA2", "#2597A6", "#EC9884", "#C57284", "#8E1D22",
  "#DB8F59", "#929456", "#87490D", "#EAA919", "#588393"
];
const categoryColors = {
  "??": { bg: "rgba(245, 86, 84, 0.13)", fg: "#A73434" },
  "??": { bg: "rgba(145, 184, 124, 0.18)", fg: "#4F7E42" },
  "??": { bg: "rgba(115, 59, 115, 0.13)", fg: "#733B73" },
  "??": { bg: "rgba(249, 149, 81, 0.16)", fg: "#A95F24" },
  "CTA": { bg: "rgba(66, 124, 128, 0.14)", fg: "#2E6D71" },
  "??": { bg: "rgba(255, 213, 140, 0.28)", fg: "#956B22" },
  "FOF": { bg: "rgba(115, 59, 115, 0.10)", fg: "#624062" },
  "??": { bg: "rgba(100, 116, 139, 0.12)", fg: "#475569" },
};

function assetColor(name, index = 0) {
  if (name.includes("??")) return "#FFD58C";
  if (name.includes("??")) return "#F55654";
  if (name.includes("?")) return "#91B87C";
  if (name.includes("??")) return "#733B73";
  if (name.includes("CTA") || name.includes("??")) return "#427C80";
  if (name.includes("??")) return "#F99551";
  if (name.includes("??300")) return "#636AA2";
  if (name.includes("??500")) return "#2597A6";
  if (name.includes("??1000")) return "#DB8F59";
  return palette[index % palette.length];
}
const $ = (id) => document.getElementById(id);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;


function benchmarkInfo() {
  const sheet = getSheet();
  let index = sheet.headers.findIndex((h) => h.includes("沪深300"));
  let fallback = false;
  if (index < 0) {
    index = sheet.headers.findIndex((h) => h.includes("上证综指") || h.includes("上证指数") || h.includes("上证综合"));
    fallback = true;
  }
  if (index < 0) return null;
  return { index, name: sheet.headers[index], fallback };
}

function benchmarkNavs() {
  const info = benchmarkInfo();
  if (!info || !state.metrics) return null;
  const returns = state.metrics.returns.map((row) => row[info.index]);
  return { ...info, navs: maxDrawdown(returns).navs };
}

function navDisplayRange() {
  const r = state.result;
  if (!r || !r.dates.length) return { start: 0, end: 0 };
  const startMonth = $("navStart")?.value;
  const endMonth = $("navEnd")?.value;
  let start = startMonth ? r.dates.findIndex((d) => d.slice(0, 7) >= startMonth) : 0;
  let end = endMonth ? r.dates.findLastIndex((d) => d.slice(0, 7) <= endMonth) : r.dates.length - 1;
  if (start < 0) start = 0;
  if (end < 0) end = r.dates.length - 1;
  if (end < start) end = start;
  return { start, end };
}

function sliceSeries(arr, range) {
  return arr.slice(range.start, range.end + 1);
}

function rebaseNavs(navs) {
  if (!navs.length) return [];
  const base = navs[0] || 1;
  return navs.map((v) => v / base);
}

function statsFromReturns(returns) {
  if (!returns.length) return { ret: 0, annReturn: 0, vol: 0, mdd: 0, sharpe: null };
  const ret = returns.reduce((v, r) => v * (1 + r), 1) - 1;
  const annReturn = cagr(returns);
  const vol = stdev(returns) * Math.sqrt(252);
  const mdd = maxDrawdown(returns).worst;
  const sharpe = vol > 0 ? (annReturn - RISK_FREE_RATE) / vol : null;
  return { ret, annReturn, vol, mdd, sharpe };
}

function categoryOf(name) {
  if (name.includes("债")) return "固收";
  if (name.includes("CTA") || name.includes("期货")) return "CTA";
  if (name.includes("中性")) return "中性";
  if (name.includes("套利")) return "套利";
  if (name.includes("指增")) return "指增";
  if (name.includes("红利") || name.includes("沪深") || name.includes("中证") || name.includes("创业") || name.includes("科创")) return "权益";
  if (name.includes("FOF")) return "FOF";
  return "复合";
}

function isEquityLike(name) {
  return ["权益", "指增"].includes(categoryOf(name));
}

function isBond(name) {
  return categoryOf(name) === "固收";
}

function getSheet() {
  return window.FOF_DATA[state.sheet];
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function cagr(returns) {
  if (!returns.length) return 0;
  const nav = returns.reduce((v, r) => v * (1 + r), 1);
  return nav ** (252 / returns.length) - 1;
}

function maxDrawdown(returns) {
  let nav = 1;
  let peak = 1;
  let worst = 0;
  const navs = [];
  const dds = [];
  for (const r of returns) {
    nav *= 1 + r;
    peak = Math.max(peak, nav);
    const dd = nav / peak - 1;
    worst = Math.min(worst, dd);
    navs.push(nav);
    dds.push(dd);
  }
  return { worst, navs, dds };
}

function historicalVar95(returns) {
  if (!returns.length) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
  return Math.max(0, -sorted[index]);
}

function selectedRiskMode() {
  return $("riskMode")?.value || "covariance";
}

function covarianceMatrix(rows, idx, mode = "covariance") {
  const n = rows.length;
  const m = idx.length;
  if (n < 2 || m === 0) return Array.from({ length: m }, () => Array(m).fill(0));
  if (mode === "semivariance") {
    return idx.map((a) => idx.map((b) => {
      const daily = rows.reduce((s, row) => s + Math.min(row[a], 0) * Math.min(row[b], 0), 0) / (n - 1);
      return daily * 252;
    }));
  }
  const means = idx.map((col) => mean(rows.map((r) => r[col])));
  return idx.map((a, i) => idx.map((b, j) => {
    const daily = rows.reduce((s, row) => s + (row[a] - means[i]) * (row[b] - means[j]), 0) / (n - 1);
    return daily * 252;
  }));
}

function correlationMatrix(rows, idx) {
  const cov = covarianceMatrix(rows, idx);
  return cov.map((row, i) => row.map((v, j) => {
    const denom = Math.sqrt(Math.max(1e-12, cov[i][i] * cov[j][j]));
    return v / denom;
  }));
}

function computeMetrics() {
  const sheet = getSheet();
  const returns = [];
  for (let t = 1; t < sheet.values.length; t += 1) {
    returns.push(sheet.values[t].map((v, i) => v / sheet.values[t - 1][i] - 1));
  }
  const cols = sheet.headers.map((_, i) => returns.map((r) => r[i]));
  const asset = sheet.headers.map((name, i) => ({
    name,
    category: categoryOf(name),
    annReturn: cagr(cols[i]),
    annVol: stdev(cols[i]) * Math.sqrt(252),
    mdd: maxDrawdown(cols[i]).worst,
    dailyVar95: historicalVar95(cols[i]),
  }));
  const allIdx = sheet.headers.map((_, i) => i);
  const cov = covarianceMatrix(returns, allIdx);
  const corr = correlationMatrix(returns, allIdx);
  return { returns, cols, asset, cov, corr };
}

function selectedIdx() {
  const sheet = getSheet();
  return [...state.selected].map((name) => sheet.headers.indexOf(name)).filter((i) => i >= 0);
}

function randomWeights(n) {
  const xs = Array.from({ length: n }, () => -Math.log(Math.max(1e-9, Math.random())));
  const sum = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => x / sum);
}

function normalizeWithCaps(weights, maxWeight) {
  let w = weights.slice();
  for (let pass = 0; pass < 10; pass += 1) {
    let excess = 0;
    const free = [];
    w = w.map((x, i) => {
      if (x > maxWeight) {
        excess += x - maxWeight;
        return maxWeight;
      }
      free.push(i);
      return x;
    });
    const freeSum = free.reduce((s, i) => s + w[i], 0);
    if (excess < 1e-8 || freeSum <= 0) break;
    for (const i of free) w[i] += excess * (w[i] / freeSum);
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / Math.max(1e-12, sum));
}

function constraints() {
  return {
    maxWeight: Number($("maxWeight").value) / 100,
    bondFloor: Number($("bondFloor").value) / 100,
    equityCap: Number($("equityCap").value) / 100,
  };
}

function estimateAssetReturns(rows, idx, fallbackAssetReturns) {
  return idx.map((col, k) => {
    const series = rows.map((r) => r[col]);
    const est = cagr(series);
    return Number.isFinite(est) ? est : fallbackAssetReturns[k];
  });
}

function portfolioReturn(row, idx, w) {
  return w.reduce((s, x, k) => s + x * row[idx[k]], 0);
}

function readViews(idx) {
  const sheet = getSheet();
  return idx.map((col) => {
    const name = sheet.headers[col];
    const saved = state.views[name] || {};
    const retInput = $(`view-ret-${col}`);
    const ddInput = $(`view-dd-${col}`);
    const retRaw = retInput ? retInput.value : saved.ret;
    const ddRaw = ddInput ? ddInput.value : saved.dd;
    const ret = retRaw === "" || retRaw === undefined ? null : Number(retRaw) / 100;
    const dd = ddRaw === "" || ddRaw === undefined ? null : Math.abs(Number(ddRaw) / 100);
    return {
      name,
      ret: Number.isFinite(ret) ? ret : null,
      dd: Number.isFinite(dd) ? dd : null,
    };
  });
}

function expectedReturnsByModel(idx, estimateRows, fallbackReturns) {
  const model = $("modelType").value;
  const historyReturns = estimateAssetReturns(estimateRows, idx, fallbackReturns);
  const views = readViews(idx);
  if (model !== "blackLitterman") return historyReturns;
  return historyReturns.map((prior, i) => views[i].ret === null ? prior : prior * 0.4 + views[i].ret * 0.6);
}

function viewDrawdownPenalty(w, idx) {
  const views = readViews(idx);
  const weightedExpectedDrawdown = w.reduce((s, x, i) => {
    const fallback = Math.abs(state.metrics.asset[idx[i]].mdd);
    return s + x * (views[i].dd ?? fallback);
  }, 0);
  return weightedExpectedDrawdown * 0.18;
}

function riskParityScore(w, cov) {
  const contributions = riskContributions(w, cov);
  if (!contributions.length) return 999;
  const target = 1 / w.length;
  return contributions.reduce((s, x) => s + (x - target) ** 2, 0);
}

function riskContributions(w, cov) {
  const marginal = w.map((_, i) => w.reduce((s, x, j) => s + x * cov[i][j], 0));
  const portVar = w.reduce((s, x, i) => s + x * marginal[i], 0);
  if (portVar <= 1e-12) return w.map(() => 0);
  const raw = w.map((x, i) => Math.max(0, x * marginal[i] / portVar));
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map((x) => x / sum) : w.map(() => 0);
}

function solveWeights(idx, estimateRows, fallbackReturns, options = {}) {
  const sheet = getSheet();
  const n = idx.length;
  if (n < 2) return null;
  const { maxWeight, bondFloor, equityCap } = constraints();
  const model = $("modelType").value;
  const assetReturns = expectedReturnsByModel(idx, estimateRows, fallbackReturns);
  const cov = covarianceMatrix(estimateRows, idx, selectedRiskMode());
  const trials = options.fast ? Math.min(22000, Math.max(6000, n * 1600)) : Math.min(65000, Math.max(16000, n * 4500));
  let best = null;

  for (let t = 0; t < trials; t += 1) {
    const w = normalizeWithCaps(randomWeights(n), maxWeight);
    const bondWeight = w.reduce((s, x, k) => s + (isBond(sheet.headers[idx[k]]) ? x : 0), 0);
    const equityWeight = w.reduce((s, x, k) => s + (isEquityLike(sheet.headers[idx[k]]) ? x : 0), 0);
    if (bondWeight < bondFloor || equityWeight > equityCap) continue;

    const expRet = w.reduce((s, x, k) => s + x * assetReturns[k], 0);
    let variance = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) variance += w[i] * w[j] * cov[i][j];
    }
    const vol = Math.sqrt(Math.max(0, variance));
    const miss = Math.abs(expRet - state.target);
    const ddPenalty = viewDrawdownPenalty(w, idx);
    const score = model === "riskParity"
      ? riskParityScore(w, cov) * 4 + vol * 0.35 + ddPenalty
      : vol + miss * 3.2 + Math.max(0, state.target - expRet) * 1.8 + ddPenalty;
    if (!best || score < best.score) best = { idx, w, expRet, vol, score };
  }

  if (!best) {
    const w = normalizeWithCaps(Array.from({ length: n }, () => 1 / n), maxWeight);
    const expRet = w.reduce((s, x, k) => s + x * assetReturns[k], 0);
    return { idx, w, expRet, vol: 0, score: 999 };
  }
  return best;
}

function isRebalanceDate(prevDate, date, freq) {
  if (!prevDate) return true;
  if (freq === "Q") return quarterKey(prevDate) !== quarterKey(date);
  return prevDate.slice(0, 7) !== date.slice(0, 7);
}

function quarterKey(dateText) {
  const d = new Date(`${dateText}T00:00:00`);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function runDynamicBacktest(staticSolution) {
  const sheet = getSheet();
  const metrics = state.metrics;
  const idx = staticSolution.idx;
  const lookback = Number($("lookbackWindow").value);
  const freq = $("rebalanceFreq").value;
  const fallbackReturns = idx.map((i) => metrics.asset[i].annReturn);
  const portReturns = [];
  const dates = sheet.dates.slice(1);
  const weightTimeline = [];
  const riskTimeline = [];
  const rebalancePoints = [];
  let current = { idx, w: normalizeWithCaps(Array.from({ length: idx.length }, () => 1 / idx.length), constraints().maxWeight) };
  let prevDate = null;

  for (let t = 0; t < metrics.returns.length; t += 1) {
    const date = dates[t];
    const start = Math.max(0, t - lookback);
    const enoughHistory = t >= Math.min(lookback, 60);
    if (enoughHistory && isRebalanceDate(prevDate, date, freq)) {
      const rows = metrics.returns.slice(start, t);
      current = solveWeights(idx, rows, fallbackReturns, { fast: true }) || current;
      const cov = covarianceMatrix(rows, idx, selectedRiskMode());
      const risk = riskContributions(current.w, cov);
      prevDate = date;
      rebalancePoints.push({ date, weights: current.w.slice(), risk });
      riskTimeline.push({ date, contributions: risk });
    }
    const r = portfolioReturn(metrics.returns[t], idx, current.w);
    portReturns.push(r);
    weightTimeline.push({ date, weights: current.w.slice() });
  }

  const dd = maxDrawdown(portReturns);
  const years = yearlyReturns(dates, portReturns);
  const months = monthlyReturns(dates, portReturns);
  const positive = years.filter((y) => y.ret > 0).length / Math.max(1, years.length);
  const stressCorr = buildStressCorr(portReturns, idx);

  return {
    portReturns,
    dates,
    navs: dd.navs,
    drawdowns: dd.dds,
    mdd: dd.worst,
    years,
    months,
    positive,
    annReturn: cagr(portReturns),
    annVol: stdev(portReturns) * Math.sqrt(252),
    weightTimeline,
    riskTimeline,
    rebalancePoints,
    stressCorr,
  };
}

function buildStressCorr(portReturns, idx) {
  const threshold = portReturns.slice().sort((a, b) => a - b)[Math.max(0, Math.floor(portReturns.length * 0.1) - 1)];
  const rows = state.metrics.returns.filter((_, i) => portReturns[i] <= threshold);
  return correlationMatrix(rows, idx);
}

function optimize() {
  const idx = selectedIdx();
  if (idx.length < 2) return null;
  const fallbackReturns = idx.map((i) => state.metrics.asset[i].annReturn);
  const staticSolution = solveWeights(idx, state.metrics.returns, fallbackReturns);
  if (!staticSolution) return null;
  const dynamic = runDynamicBacktest(staticSolution);
  return { ...staticSolution, ...dynamic };
}

function yearlyReturns(dates, returns) {
  const byYear = {};
  dates.forEach((d, i) => {
    const y = d.slice(0, 4);
    byYear[y] = (byYear[y] ?? 1) * (1 + returns[i]);
  });
  return Object.entries(byYear).map(([year, nav]) => ({ year, ret: nav - 1 }));
}

function monthlyReturns(dates, returns) {
  const byMonth = {};
  dates.forEach((d, i) => {
    const m = d.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 1) * (1 + returns[i]);
  });
  return Object.entries(byMonth).map(([month, nav]) => ({ month, ret: nav - 1 }));
}

function renderSheetSwitch() {
  const box = $("sheetSwitch");
  box.innerHTML = "";
  Object.keys(window.FOF_DATA).forEach((name) => {
    const btn = document.createElement("button");
    btn.textContent = name === "Sheet2" ? "核心池" : "全资产池";
    btn.className = name === state.sheet ? "active" : "";
    btn.onclick = () => {
      state.sheet = name;
      resetSelection();
      refreshAll();
    };
    box.appendChild(btn);
  });
}

function resetSelection() {
  const sheet = getSheet();
  state.selected = new Set(sheet.headers.filter((h) => state.sheet === "Sheet2" || coreNames.has(h)));
}

function renderAssetList() {
  const sheet = getSheet();
  const list = $("assetList");
  list.innerHTML = "";
  sheet.headers.forEach((name) => {
    const item = document.createElement("label");
    item.className = "asset-item";
    item.title = name;
    item.innerHTML = `
      <input type="checkbox" ${state.selected.has(name) ? "checked" : ""} />
      <span class="asset-name">${name}</span>
      <span class="tag" style="--tag-bg:${categoryColors[categoryOf(name)]?.bg || categoryColors["??"].bg};--tag-fg:${categoryColors[categoryOf(name)]?.fg || categoryColors["??"].fg}">${categoryOf(name)}</span>
    `;
    item.querySelector("input").onchange = (e) => {
      if (e.target.checked) state.selected.add(name);
      else state.selected.delete(name);
      renderViewInputs();
      refreshCalc();
    };
    list.appendChild(item);
  });
}

function renderViewInputs() {
  const sheet = getSheet();
  const box = $("viewInputs");
  const idx = selectedIdx();
  box.innerHTML = `
    <div class="view-row header">
      <span>资产</span>
      <span>收益%</span>
      <span>回撤%</span>
    </div>
  `;
  idx.forEach((col) => {
    const name = sheet.headers[col];
    const saved = state.views[name] || {};
    const fallbackRet = state.metrics ? (state.metrics.asset[col].annReturn * 100).toFixed(1) : "";
    const fallbackDd = state.metrics ? (Math.abs(state.metrics.asset[col].mdd) * 100).toFixed(1) : "";
    const row = document.createElement("label");
    row.className = "view-row";
    row.title = name;
    row.innerHTML = `
      <span>${shortName(name)}</span>
      <input id="view-ret-${col}" type="number" step="0.5" value="${saved.ret ?? ""}" placeholder="${fallbackRet}" />
      <input id="view-dd-${col}" type="number" step="0.5" value="${saved.dd ?? ""}" placeholder="${fallbackDd}" />
    `;
    row.querySelectorAll("input").forEach((input) => {
      input.onchange = () => {
        state.views[name] = {
          ret: $(`view-ret-${col}`).value,
          dd: $(`view-dd-${col}`).value,
        };
        refreshCalc();
      };
    });
    box.appendChild(row);
  });
}

function renderKpis() {
  const r = state.result;
  const sharpe = r && r.annVol > 0 ? (r.annReturn - RISK_FREE_RATE) / r.annVol : null;
  $("kpiReturn").textContent = r ? pct(r.annReturn) : "--";
  $("kpiVol").textContent = r ? pct(r.annVol) : "--";
  $("kpiMdd").textContent = r ? pct(r.mdd) : "--";
  $("kpiSharpe").textContent = sharpe === null ? "--" : sharpe.toFixed(2);
  $("kpiPositive").textContent = r ? pct(r.positive, 0) : "--";
}

function renderLogic() {
  const freq = $("rebalanceFreq").value === "M" ? "月度" : "季度";
  const lookbackLabel = $("lookbackWindow").selectedOptions[0].textContent;
  const modelText = $("modelType").selectedOptions[0].textContent;
  const riskText = $("riskMode").selectedOptions[0].textContent;
  $("logicText").innerHTML = `采用 <span class="logic-param">${modelText}</span>，在每个 <span class="logic-param">${freq}</span> 调仓日，用过去 <span class="logic-param">${lookbackLabel}</span> 数据和 <span class="logic-param">${riskText}</span> 风险口径估计组合；约束为单资产上限 <span class="logic-param">${$("maxWeight").value}%</span>、债券底仓下限 <span class="logic-param">${$("bondFloor").value}%</span>、权益方向上限 <span class="logic-param">${$("equityCap").value}%</span>，目标收益 <span class="logic-param">${pct(state.target)}</span>。`;
}

function renderWeightChart() {
  const r = state.result;
  const canvas = $("weightChart");
  const ctx = setupCanvas(canvas, 280);
  if (!r) return;
  const rows = r.idx.map((idx, i) => ({ name: shortName(getSheet().headers[idx]), value: r.w[i], color: assetColor(getSheet().headers[idx], i) })).sort((a, b) => b.value - a.value);
  drawBarChart(ctx, canvas, rows, { horizontal: true, valueFormatter: (v) => pct(v), min: 0, max: Math.max(0.4, ...rows.map((x) => x.value)) });
}

function renderYearChart() {
  const r = state.result;
  const canvas = $("yearChart");
  const ctx = setupCanvas(canvas, 280);
  if (!r) return;
  const lastDate = r.dates.at(-1);
  const rows = r.years.map((y) => ({ name: yearLabel(y.year, lastDate), value: y.ret, color: y.ret >= 0 ? "#c7443e" : "#23825a" }));
  drawBarChart(ctx, canvas, rows, { horizontal: false, valueFormatter: (v) => pct(v), min: Math.min(0, ...rows.map((x) => x.value)), max: Math.max(0.01, ...rows.map((x) => x.value)) });
}

function yearLabel(year, lastDate) {
  return lastDate && year === lastDate.slice(0, 4) && !lastDate.endsWith("12-31") ? `${year}*` : year;
}

function renderWeightTimeline() {
  const r = state.result;
  const canvas = $("weightTimelineChart");
  const ctx = setupCanvas(canvas, 310);
  $("weightLegend").innerHTML = "";
  if (!r) return;
  r.idx.forEach((idx, i) => {
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${assetColor(getSheet().headers[idx], i)}"></i>${shortName(getSheet().headers[idx])}`;
    $("weightLegend").appendChild(item);
  });

  const rect = canvas.getBoundingClientRect();
  const pad = { l: 44, r: 16, t: 18, b: 30 };
  const w = rect.width - pad.l - pad.r;
  const h = 310 - pad.t - pad.b;
  drawGrid(ctx, pad, w, h, 4);
  const range = navDisplayRange();
  const series = sliceSeries(r.weightTimeline, range);
  if (!series.length) return;
  const step = Math.max(1, Math.floor(series.length / Math.max(80, rect.width / 7)));
  for (let t = 0; t < series.length; t += step) {
    const x = pad.l + (t / Math.max(1, series.length - 1)) * w;
    const nextT = Math.min(series.length - 1, t + step);
    const x2 = pad.l + (nextT / Math.max(1, series.length - 1)) * w;
    let top = pad.t + h;
    series[t].weights.forEach((weight, i) => {
      const bh = weight * h;
      ctx.fillStyle = assetColor(getSheet().headers[r.idx[i]], i);
      ctx.fillRect(x, top - bh, Math.max(1, x2 - x + 1), bh);
      top -= bh;
    });
  }
  if (state.weightHoverIndex !== null && series[state.weightHoverIndex]) {
    const x = pad.l + (state.weightHoverIndex / Math.max(1, series.length - 1)) * w;
    ctx.strokeStyle = "rgba(23, 33, 28, 0.36)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + h);
    ctx.stroke();
  }
  ctx.fillStyle = "#6e7772";
  ctx.font = "12px Microsoft YaHei, Arial";
  ctx.fillText("100%", 6, pad.t + 4);
  ctx.fillText("0%", 14, pad.t + h);
  for (let i = 0; i <= 4; i += 1) {
    const idx = Math.round((series.length - 1) * (i / 4));
    const x = pad.l + (idx / Math.max(1, series.length - 1)) * w;
  ctx.fillText(series[idx].date.slice(0, 7), Math.min(x, pad.l + w - 42), 302);
  }
}

function renderRiskContributionChart() {
  const r = state.result;
  const canvas = $("riskContributionChart");
  const ctx = setupCanvas(canvas, 310);
  $("riskLegend").innerHTML = "";
  if (!r || !r.riskTimeline.length) return;
  r.idx.forEach((idx, i) => {
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${assetColor(getSheet().headers[idx], i)}"></i>${shortName(getSheet().headers[idx])}`;
    $("riskLegend").appendChild(item);
  });

  const rect = canvas.getBoundingClientRect();
  const pad = { l: 44, r: 16, t: 18, b: 30 };
  const w = rect.width - pad.l - pad.r;
  const h = 310 - pad.t - pad.b;
  const range = navDisplayRange();
  const startDate = r.dates[range.start];
  const endDate = r.dates[range.end];
  const series = r.riskTimeline.filter((p) => p.date >= startDate && p.date <= endDate);
  if (!series.length) return;
  drawGrid(ctx, pad, w, h, 4);
  const step = Math.max(1, Math.floor(series.length / Math.max(60, rect.width / 10)));
  for (let t = 0; t < series.length; t += step) {
    const x = pad.l + (t / Math.max(1, series.length - 1)) * w;
    const nextT = Math.min(series.length - 1, t + step);
    const x2 = pad.l + (nextT / Math.max(1, series.length - 1)) * w;
    let top = pad.t + h;
    series[t].contributions.forEach((value, i) => {
      const bh = value * h;
      ctx.fillStyle = assetColor(getSheet().headers[r.idx[i]], i);
      ctx.fillRect(x, top - bh, Math.max(1, x2 - x + 1), bh);
      top -= bh;
    });
  }
  if (state.riskHoverIndex !== null && series[state.riskHoverIndex]) {
    const x = pad.l + (state.riskHoverIndex / Math.max(1, series.length - 1)) * w;
    ctx.strokeStyle = "rgba(23, 33, 28, 0.36)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + h);
    ctx.stroke();
  }
  ctx.fillStyle = "#6e7772";
  ctx.font = "12px Microsoft YaHei, Arial";
  ctx.fillText("100%", 6, pad.t + 4);
  ctx.fillText("0%", 14, pad.t + h);
  for (let i = 0; i <= 4; i += 1) {
    const idx = Math.round((series.length - 1) * (i / 4));
    const x = pad.l + (idx / Math.max(1, series.length - 1)) * w;
    ctx.fillText(series[idx].date.slice(0, 7), Math.min(x, pad.l + w - 42), 302);
  }
}

function renderHeatmap(targetId, matrix) {
  const sheet = getSheet();
  const r = state.result;
  const box = $(targetId);
  box.innerHTML = "";
  if (!r) return;
  box.style.setProperty("--n", r.idx.length);
  box.appendChild(document.createElement("span"));
  r.idx.forEach((idx) => {
    const label = document.createElement("div");
    label.className = "heat-label";
    label.textContent = shortName(sheet.headers[idx]);
    box.appendChild(label);
  });
  r.idx.forEach((rowIdx, localRow) => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "heat-label";
    rowLabel.textContent = shortName(sheet.headers[rowIdx]);
    box.appendChild(rowLabel);
    r.idx.forEach((_, localCol) => {
      const v = matrix[localRow]?.[localCol] ?? 0;
      const cell = document.createElement("div");
      cell.className = "heat-cell";
      cell.style.background = corrColor(v);
      cell.style.color = Math.abs(v) > 0.55 ? "#fff" : "#17211c";
      cell.textContent = Number.isFinite(v) ? v.toFixed(2) : "--";
      box.appendChild(cell);
    });
  });
}

function renderCorrelationPanels() {
  const r = state.result;
  if (!r) return;
  const normalRows = state.metrics.returns;
  renderHeatmap("corrHeatmap", correlationMatrix(normalRows, r.idx));
  renderHeatmap("stressCorrHeatmap", r.stressCorr);
}

function corrColor(v) {
  if (v >= 0) {
    const a = Math.min(1, v);
    return `rgba(199, 68, 62, ${0.12 + a * 0.78})`;
  }
  const a = Math.min(1, Math.abs(v));
  return `rgba(35, 130, 90, ${0.12 + a * 0.78})`;
}

function shortName(name) {
  return name.replace("火富牛", "").replace("招商", "").replace("精选指数", "").replace("私募指数", "");
}

function renderMonthlyGrid() {
  const r = state.result;
  const box = $("monthGrid");
  box.innerHTML = "";
  if (!r) return;
  const start = $("rangeStart").value || r.months[0]?.month;
  const end = $("rangeEnd").value || r.months.at(-1)?.month;
  const rows = r.months.filter((m) => (!start || m.month >= start) && (!end || m.month <= end));
  const maxAbs = Math.max(0.01, ...rows.map((m) => Math.abs(m.ret)));
  const byYear = {};
  rows.forEach((m) => {
    const year = m.month.slice(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(m);
  });
  Object.entries(byYear).forEach(([year, months]) => {
    const row = document.createElement("div");
    row.className = "month-year-row";
    row.innerHTML = `<div class="month-year-label">${year}</div><div class="month-cells"></div>`;
    const cells = row.querySelector(".month-cells");
    months.forEach((m) => {
      const cell = document.createElement("div");
      const intensity = Math.min(1, Math.abs(m.ret) / maxAbs);
      cell.className = `month-cell ${m.ret < 0 ? "loss" : "gain"}`;
      cell.style.setProperty("--alpha", 0.14 + intensity * 0.62);
      cell.innerHTML = `<span>${m.month.slice(5)}</span><strong>${pct(m.ret)}</strong>`;
      cells.appendChild(cell);
    });
    const total = months.reduce((v, m) => v * (1 + m.ret), 1) - 1;
    const totalCell = document.createElement("div");
    const totalIntensity = Math.min(1, Math.abs(total) / maxAbs);
    totalCell.className = `month-cell total ${total < 0 ? "loss" : "gain"}`;
    totalCell.style.setProperty("--alpha", 0.18 + totalIntensity * 0.62);
    totalCell.innerHTML = `<span>年度</span><strong>${pct(total)}</strong>`;
    cells.appendChild(totalCell);
    box.appendChild(row);
  });
}

function assetYearlyReturns(assetIndex) {
  const dates = getSheet().dates.slice(1);
  const returns = state.metrics.returns.map((row) => row[assetIndex]);
  return yearlyReturns(dates, returns);
}

function miniReturnCell(value, maxAbs) {
  const width = Math.max(3, Math.min(50, Math.abs(value) / Math.max(0.01, maxAbs) * 50));
  const cls = value < 0 ? "negative" : "positive";
  return `<div class="mini-return ${cls}"><span>${pct(value)}</span><i style="width:${width}%"></i></div>`;
}

function renderTable() {
  const sheet = getSheet();
  const thead = $("assetTableHead");
  const tbody = $("assetTable");
  tbody.innerHTML = "";
  const weights = new Map();
  if (state.result) state.result.idx.forEach((idx, i) => weights.set(idx, state.result.w[i]));
  const selected = state.metrics.asset.map((a, i) => ({ ...a, index: i })).filter((a) => state.selected.has(sheet.headers[a.index]));
  const years = [...new Set(selected.flatMap((a) => assetYearlyReturns(a.index).map((y) => y.year)))];
  thead.innerHTML = `
    <tr>
      <th>资产</th>
      <th>类别</th>
      <th>年化收益</th>
      <th>年化波动</th>
      <th>最大回撤</th>
      <th>当前权重</th>
      <th>日度 VaR (95%)</th>
      ${years.map((y) => `<th>${y}</th>`).join("")}
    </tr>
  `;
  const yearMaxAbs = {};
  years.forEach((year) => {
    yearMaxAbs[year] = Math.max(0.01, ...selected.map((a) => Math.abs(assetYearlyReturns(a.index).find((y) => y.year === year)?.ret ?? 0)));
  });
  selected.forEach((a) => {
    const yearly = new Map(assetYearlyReturns(a.index).map((y) => [y.year, y.ret]));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.name}</td>
      <td><span class="category-pill">${a.category}</span></td>
      <td>${miniReturnCell(a.annReturn, Math.max(...selected.map((x) => Math.abs(x.annReturn)), 0.01))}</td>
      <td>${pct(a.annVol)}</td>
      <td>${pct(a.mdd)}</td>
      <td>${pct(weights.get(a.index) || 0)}</td>
      <td>${pct(a.dailyVar95)}</td>
      ${years.map((year) => `<td>${miniReturnCell(yearly.get(year) ?? 0, yearMaxAbs[year])}</td>`).join("")}
    `;
    tbody.appendChild(tr);
  });
}

function drawNavChart() {
  const canvas = $("navChart");
  const ctx = setupCanvas(canvas, 300);
  const r = state.result;
  if (!r) return;
  const rect = canvas.getBoundingClientRect();
  const pad = { l: 42, r: 50, t: 20, b: 34 };
  const w = rect.width - pad.l - pad.r;
  const h = 300 - pad.t - pad.b;
  const range = navDisplayRange();
  const dates = sliceSeries(r.dates, range);
  const navs = rebaseNavs(sliceSeries(r.navs, range));
  const rangeReturns = sliceSeries(r.portReturns, range);
  const drawdowns = maxDrawdown(rangeReturns).dds;
  const benchFull = benchmarkNavs();
  const bench = benchFull ? { ...benchFull, navs: rebaseNavs(sliceSeries(benchFull.navs, range)) } : null;
  renderNavRangeStats(statsFromReturns(rangeReturns));
  const allNavs = bench ? navs.concat(bench.navs) : navs;
  const ddMinRaw = Math.min(...drawdowns, -0.01);
  const ddMin = Math.min(ddMinRaw, -0.04);
  const ddBandTop = pad.t + h * 0.50;
  const ddBandH = h * 0.46;
  const navSpan = Math.max(0.05, ...allNavs.map((v) => Math.abs(v - 1)));
  const navMin = 1 - navSpan;
  const navMax = 1 + navSpan;
  const legend = $("benchmarkLegend");
  if (legend) {
    legend.innerHTML = `<i class="line-gold"></i>${bench ? `${bench.name}${bench.fallback ? "（临时代标）" : ""}` : "沪深300"}`;
  }
  drawGrid(ctx, pad, w, h, 4);
  drawQuarterTicks(ctx, dates, pad, w, h);
  ctx.save();
  ctx.strokeStyle = "rgba(30, 90, 168, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, ddBandTop);
  ctx.lineTo(pad.l + w, ddBandTop);
  ctx.stroke();
  ctx.restore();
  drawDrawdownArea(ctx, drawdowns, pad, w, ddBandTop, ddBandH, ddMin);
  if (bench) drawLine(ctx, bench.navs, pad, w, h, navMin, navMax, "#F99551", 1.6);
  drawLine(ctx, navs, pad, w, h, navMin, navMax, "#1E5AA8", 3.6);

  if (state.navHoverIndex !== null && navs[state.navHoverIndex] !== undefined) {
    const x = pad.l + (state.navHoverIndex / Math.max(1, navs.length - 1)) * w;
    const navY = pad.t + (1 - (navs[state.navHoverIndex] - navMin) / Math.max(1e-9, navMax - navMin)) * h;
    ctx.strokeStyle = "rgba(23, 33, 28, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + h);
    ctx.stroke();
    drawPoint(ctx, x, navY, "#1E5AA8");
    if (bench && bench.navs[state.navHoverIndex] !== undefined) {
      const benchY = pad.t + (1 - (bench.navs[state.navHoverIndex] - navMin) / Math.max(1e-9, navMax - navMin)) * h;
      drawPoint(ctx, x, benchY, "#F99551");
    }
  }

  ctx.fillStyle = "#6e7772";
  ctx.font = "12px Microsoft YaHei, Arial";
  ctx.fillText(navMax.toFixed(2), 6, pad.t + 4);
  ctx.fillText("1.00", 6, ddBandTop + 4);
  ctx.fillText(navMin.toFixed(2), 6, pad.t + h + 4);
  ctx.fillText("0%", pad.l + w + 8, ddBandTop + 4);
  ctx.fillText(pct(ddMin), pad.l + w + 8, ddBandTop + ddBandH);
}

function drawDrawdownArea(ctx, drawdowns, pad, w, top, height, min) {
  ctx.save();
  const baseline = top;
  ctx.beginPath();
  drawdowns.forEach((v, i) => {
    const x = pad.l + (i / Math.max(1, drawdowns.length - 1)) * w;
    const y = top + (Math.abs(v) / Math.max(1e-9, Math.abs(min))) * height;
    if (i === 0) ctx.moveTo(x, baseline);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.l + w, baseline);
  ctx.closePath();
  ctx.fillStyle = "rgba(100, 116, 139, 0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 116, 139, 0.34)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawQuarterTicks(ctx, dates, pad, w, h) {
  ctx.save();
  ctx.strokeStyle = "rgba(100, 116, 139, 0.24)";
  ctx.fillStyle = "#64748b";
  ctx.font = "11px Microsoft YaHei, Arial";
  const seen = new Set();
  dates.forEach((date, i) => {
    const month = date.slice(5, 7);
    const key = date.slice(0, 7);
    if (![ "01", "04", "07", "10" ].includes(month) || seen.has(key)) return;
    seen.add(key);
    const x = pad.l + (i / Math.max(1, dates.length - 1)) * w;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + h + 4);
    ctx.stroke();
    ctx.fillText(key, Math.min(x + 3, pad.l + w - 42), pad.t + h + 20);
  });
  ctx.restore();
}

function drawPoint(ctx, x, y, color) {
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function setupCanvas(canvas, height) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, height);
  return ctx;
}

function drawGrid(ctx, pad, w, h, lines) {
  ctx.strokeStyle = "#edf1ee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= lines; i += 1) {
    const y = pad.t + (h * i) / lines;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }
}

function drawLine(ctx, arr, pad, w, h, min, max, color, lineWidth) {
  ctx.beginPath();
  arr.forEach((v, i) => {
    const x = pad.l + (i / Math.max(1, arr.length - 1)) * w;
    const y = pad.t + (1 - (v - min) / Math.max(1e-9, max - min)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawBarChart(ctx, canvas, rows, opts) {
  const rect = canvas.getBoundingClientRect();
  const height = Number(canvas.getAttribute("height")) || 280;
  const pad = opts.horizontal ? { l: 92, r: 44, t: 12, b: 18 } : { l: 42, r: 16, t: 18, b: 38 };
  const w = rect.width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  ctx.fillStyle = "#6e7772";
  ctx.font = "12px Microsoft YaHei, Arial";

  if (opts.horizontal) {
    const gap = 8;
    const bh = Math.max(12, (h - gap * (rows.length - 1)) / Math.max(1, rows.length));
    rows.forEach((row, i) => {
      const y = pad.t + i * (bh + gap);
      const bw = (row.value / opts.max) * w;
      ctx.fillStyle = "#edf1ee";
      ctx.fillRect(pad.l, y, w, bh);
      ctx.fillStyle = row.color;
      ctx.fillRect(pad.l, y, bw, bh);
      ctx.fillStyle = "#39443e";
      ctx.fillText(row.name, 8, y + bh - 3);
      ctx.fillText(opts.valueFormatter(row.value), pad.l + w + 8, y + bh - 3);
    });
    return;
  }

  const max = opts.max;
  const min = opts.min;
  const zeroY = pad.t + (1 - (0 - min) / Math.max(1e-9, max - min)) * h;
  drawGrid(ctx, pad, w, h, 4);
  ctx.strokeStyle = "#9aa49e";
  ctx.beginPath();
  ctx.moveTo(pad.l, zeroY);
  ctx.lineTo(pad.l + w, zeroY);
  ctx.stroke();
  const gap = 12;
  const bw = Math.max(18, (w - gap * (rows.length - 1)) / Math.max(1, rows.length));
  rows.forEach((row, i) => {
    const x = pad.l + i * (bw + gap);
    const y = pad.t + (1 - (row.value - min) / Math.max(1e-9, max - min)) * h;
    ctx.fillStyle = row.color;
    ctx.fillRect(x, Math.min(y, zeroY), bw, Math.max(2, Math.abs(zeroY - y)));
    ctx.fillStyle = "#39443e";
    ctx.fillText(row.name, x, height - 14);
    ctx.fillText(opts.valueFormatter(row.value), x - 2, Math.min(y, zeroY) - 5);
  });
}

function refreshCalc() {
  renderLogic();
  state.result = optimize();
  renderKpis();
  renderWeightChart();
  renderYearChart();
  renderWeightTimeline();
  renderRiskContributionChart();
  renderCorrelationPanels();
  renderMonthlyGrid();
  renderTable();
  drawNavChart();
}

function refreshAll() {
  const sheet = getSheet();
  state.metrics = computeMetrics();
  $("dateRange").textContent = `${sheet.dates[0]} - ${sheet.dates.at(-1)}`;
  $("yearCutoff").textContent = sheet.dates.at(-1);
  const firstMonth = sheet.dates[1]?.slice(0, 7) || sheet.dates[0].slice(0, 7);
  const lastMonth = sheet.dates.at(-1).slice(0, 7);
  $("rangeStart").min = firstMonth;
  $("rangeStart").max = lastMonth;
  $("rangeEnd").min = firstMonth;
  $("rangeEnd").max = lastMonth;
  $("rangeStart").value = firstMonth;
  $("rangeEnd").value = lastMonth;
  $("navStart").min = firstMonth;
  $("navStart").max = lastMonth;
  $("navEnd").min = firstMonth;
  $("navEnd").max = lastMonth;
  $("navStart").value = firstMonth;
  $("navEnd").value = lastMonth;
  renderNavYearSelect(firstMonth, lastMonth);
  renderSheetSwitch();
  renderAssetList();
  renderViewInputs();
  refreshCalc();
}

function renderNavRangeStats(stats) {
  const box = $("navRangeStats");
  if (!box) return;
  box.innerHTML = `
    <div class="range-stat"><span>区间收益</span><strong>${pct(stats.ret)}</strong></div>
    <div class="range-stat"><span>区间最大回撤</span><strong>${pct(stats.mdd)}</strong></div>
    <div class="range-stat"><span>区间年化波动</span><strong>${pct(stats.vol)}</strong></div>
  `;
}

function renderNavRangeStats(stats) {
  const box = $("navRangeStats");
  if (!box) return;
  box.innerHTML = `
    <div class="range-stat"><span>区间收益</span><strong>${pct(stats.ret)}</strong></div>
    <div class="range-stat"><span>区间年化收益</span><strong>${pct(stats.annReturn)}</strong></div>
    <div class="range-stat"><span>区间最大回撤</span><strong>${pct(stats.mdd)}</strong></div>
    <div class="range-stat"><span>区间年化波动</span><strong>${pct(stats.vol)}</strong></div>
    <div class="range-stat"><span>区间夏普</span><strong>${stats.sharpe === null ? "--" : stats.sharpe.toFixed(2)}</strong></div>
  `;
}

function renderNavYearSelect(firstMonth, lastMonth) {
  const select = $("navYearSelect");
  if (!select) return;
  const firstYear = Number(firstMonth.slice(0, 4));
  const lastYear = Number(lastMonth.slice(0, 4));
  select.innerHTML = `<option value="all">全部</option>${Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((y) => `<option value="${y}">${y}</option>`).join("")}<option value="custom">自定义</option>`;
  select.value = "all";
}

function exportResult() {
  const r = state.result;
  if (!r) return;
  const lines = [
    `目标收益,${pct(state.target)}`,
    `调仓频率,${$("rebalanceFreq").selectedOptions[0].textContent}`,
    `回看窗口,${$("lookbackWindow").selectedOptions[0].textContent}`,
    `风险口径,${$("riskMode").selectedOptions[0].textContent}`,
    `组合模型,${$("modelType").selectedOptions[0].textContent}`,
    `样本年化收益,${pct(r.annReturn)}`,
    `年化波动,${pct(r.annVol)}`,
    `最大回撤,${pct(r.mdd)}`,
    `夏普值(无风险收益1.73%),${r.annVol > 0 ? ((r.annReturn - RISK_FREE_RATE) / r.annVol).toFixed(2) : "--"}`,
    `年度正收益概率,${pct(r.positive, 0)}`,
    "",
    "资产,当前建议权重",
    ...r.idx.map((idx, i) => `${getSheet().headers[idx]},${pct(r.w[i])}`),
  ];
  navigator.clipboard?.writeText(lines.join("\n"));
  $("exportBtn").textContent = "已复制";
  setTimeout(() => ($("exportBtn").textContent = "导出结果"), 1200);
}

function handleNavHover(event) {
  const r = state.result;
  if (!r) return;
  const canvas = $("navChart");
  const rect = canvas.getBoundingClientRect();
  const pad = { l: 42, r: 50, t: 20, b: 28 };
  const w = rect.width - pad.l - pad.r;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tooltip = $("navTooltip");
  if (x < pad.l || x > pad.l + w || y < pad.t || y > 300 - pad.b) {
    state.navHoverIndex = null;
    tooltip.style.display = "none";
    drawNavChart();
    return;
  }
  const range = navDisplayRange();
  const dates = sliceSeries(r.dates, range);
  const navs = rebaseNavs(sliceSeries(r.navs, range));
  const drawdowns = maxDrawdown(sliceSeries(r.portReturns, range)).dds;
  const idx = Math.round(((x - pad.l) / Math.max(1, w)) * (navs.length - 1));
  state.navHoverIndex = Math.max(0, Math.min(navs.length - 1, idx));
  const date = dates[state.navHoverIndex];
  const nav = navs[state.navHoverIndex];
  const dd = drawdowns[state.navHoverIndex];
  const benchFull = benchmarkNavs();
  const bench = benchFull ? { ...benchFull, navs: rebaseNavs(sliceSeries(benchFull.navs, range)) } : null;
  const benchText = bench && bench.navs[state.navHoverIndex] !== undefined ? `<br/>${bench.name}${bench.fallback ? "（临时代标）" : ""}：${bench.navs[state.navHoverIndex].toFixed(4)}` : "";
  tooltip.innerHTML = `<strong>${date}</strong><br/>组合净值：${nav.toFixed(4)}${benchText}<br/>回撤：${pct(dd, 2)}`;
  tooltip.style.display = "block";
  tooltip.style.left = `${Math.min(rect.width - 168, Math.max(8, x + 14))}px`;
  tooltip.style.top = `${Math.min(250, Math.max(8, y + 14))}px`;
  drawNavChart();
}

function clearNavHover() {
  state.navHoverIndex = null;
  $("navTooltip").style.display = "none";
  drawNavChart();
}

function handleWeightHover(event) {
  const r = state.result;
  if (!r || !r.weightTimeline.length) return;
  const canvas = $("weightTimelineChart");
  const rect = canvas.getBoundingClientRect();
  const pad = { l: 44, r: 16, t: 18, b: 30 };
  const w = rect.width - pad.l - pad.r;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tooltip = $("weightTooltip");
  if (x < pad.l || x > pad.l + w || y < pad.t || y > 310 - pad.b) {
    clearWeightHover();
    return;
  }
  const idx = Math.round(((x - pad.l) / Math.max(1, w)) * (r.weightTimeline.length - 1));
  state.weightHoverIndex = Math.max(0, Math.min(r.weightTimeline.length - 1, idx));
  const point = r.weightTimeline[state.weightHoverIndex];
  const range = navDisplayRange();
  const nav = rebaseNavs(sliceSeries(r.navs, range))[state.weightHoverIndex] ?? 1;
  const items = point.weights.map((weight, i) => ({
    name: shortName(getSheet().headers[r.idx[i]]),
    value: weight,
    color: assetColor(getSheet().headers[r.idx[i]], i),
  })).sort((a, b) => b.value - a.value);
  tooltip.innerHTML = `
    <strong>${point.date}</strong><br/>
    组合净值：${nav.toFixed(4)}
    <div class="tooltip-list">
      ${items.map((item) => `<div><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color};margin-right:5px"></i>${item.name}</span><strong>${pct(item.value, 1)}</strong></div>`).join("")}
    </div>
  `;
  tooltip.style.display = "block";
  tooltip.style.left = `${Math.min(rect.width - 326, Math.max(8, x + 14))}px`;
  tooltip.style.top = `${Math.min(250, Math.max(8, y + 14))}px`;
  renderWeightTimeline();
}

function clearWeightHover() {
  state.weightHoverIndex = null;
  $("weightTooltip").style.display = "none";
  renderWeightTimeline();
}

function handleRiskHover(event) {
  const r = state.result;
  if (!r || !r.riskTimeline.length) return;
  const canvas = $("riskContributionChart");
  const rect = canvas.getBoundingClientRect();
  const pad = { l: 44, r: 16, t: 18, b: 30 };
  const w = rect.width - pad.l - pad.r;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tooltip = $("riskTooltip");
  if (x < pad.l || x > pad.l + w || y < pad.t || y > 310 - pad.b) {
    clearRiskHover();
    return;
  }
  const idx = Math.round(((x - pad.l) / Math.max(1, w)) * (r.riskTimeline.length - 1));
  state.riskHoverIndex = Math.max(0, Math.min(r.riskTimeline.length - 1, idx));
  const point = r.riskTimeline[state.riskHoverIndex];
  const items = point.contributions.map((value, i) => ({
    name: shortName(getSheet().headers[r.idx[i]]),
    value,
    color: assetColor(getSheet().headers[r.idx[i]], i),
  })).sort((a, b) => b.value - a.value);
  tooltip.innerHTML = `
    <strong>${point.date}</strong><br/>
    风险贡献占比
    <div class="tooltip-list">
      ${items.map((item) => `<div><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${item.color};margin-right:5px"></i>${item.name}</span><strong>${pct(item.value, 1)}</strong></div>`).join("")}
    </div>
  `;
  tooltip.style.display = "block";
  tooltip.style.left = `${Math.min(rect.width - 326, Math.max(8, x + 14))}px`;
  tooltip.style.top = `${Math.min(250, Math.max(8, y + 14))}px`;
  renderRiskContributionChart();
}

function clearRiskHover() {
  state.riskHoverIndex = null;
  $("riskTooltip").style.display = "none";
  renderRiskContributionChart();
}

function init() {
  resetSelection();
  $("targetSlider").oninput = (e) => {
    state.target = Number(e.target.value) / 100;
    $("targetLabel").textContent = pct(state.target);
    document.querySelectorAll(".target-presets button").forEach((b) => b.classList.toggle("active", Number(b.dataset.target) === Number(e.target.value)));
    refreshCalc();
  };
  document.querySelectorAll(".target-presets button").forEach((btn) => {
    btn.onclick = () => {
      $("targetSlider").value = btn.dataset.target;
      $("targetSlider").dispatchEvent(new Event("input"));
    };
  });
  ["maxWeight", "bondFloor", "equityCap", "rebalanceFreq", "lookbackWindow", "riskMode", "modelType"].forEach((id) => $(id).onchange = refreshCalc);
  ["rangeStart", "rangeEnd"].forEach((id) => $(id).onchange = renderMonthlyGrid);
  ["navStart", "navEnd"].forEach((id) => $(id).onchange = () => {
    $("navYearSelect").value = "custom";
    state.navHoverIndex = null;
    drawNavChart();
    renderWeightTimeline();
    renderRiskContributionChart();
  });
  $("navYearSelect").onchange = () => {
    const value = $("navYearSelect").value;
    const first = $("navStart").min;
    const last = $("navEnd").max;
    if (value === "all") {
      $("navStart").value = first;
      $("navEnd").value = last;
    } else if (value !== "custom") {
      $("navStart").value = `${value}-01`;
      $("navEnd").value = `${value}-12` > last ? last : `${value}-12`;
    }
    state.navHoverIndex = null;
    drawNavChart();
    renderWeightTimeline();
    renderRiskContributionChart();
  };
  $("rebalanceBtn").onclick = refreshCalc;
  $("exportBtn").onclick = exportResult;
  $("navChart").addEventListener("mousemove", handleNavHover);
  $("navChart").addEventListener("mouseleave", clearNavHover);
  $("weightTimelineChart").addEventListener("mousemove", handleWeightHover);
  $("weightTimelineChart").addEventListener("mouseleave", clearWeightHover);
  $("riskContributionChart").addEventListener("mousemove", handleRiskHover);
  $("riskContributionChart").addEventListener("mouseleave", clearRiskHover);
  $("selectCore").onclick = () => {
    state.selected = new Set(getSheet().headers.filter((h) => coreNames.has(h)));
    renderAssetList();
    renderViewInputs();
    refreshCalc();
  };
  window.addEventListener("resize", () => {
    drawNavChart();
    renderWeightChart();
    renderYearChart();
    renderWeightTimeline();
    renderRiskContributionChart();
  });
  refreshAll();
}

init();
