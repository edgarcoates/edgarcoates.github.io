// Page code for the Market-Making Lab. The market, the agents and the numbers all come from src/.
import { makeRng } from "./src/rng.js";
import { Market, ACTIONS, DEFAULTS } from "./src/market.js";
import { fixed, cautiousRule, indexOf, QAgent, train, evaluate } from "./src/agents.js";
import results from "./results.js";

const $ = (s, el = document) => el.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (text !== undefined) el.textContent = text;
  return el;
};
const fmt = (x, dp = 1) => { const r = +x.toFixed(dp); return (r >= 0 ? "+" : "−") + Math.abs(r).toFixed(dp); };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Strategies ---------- */
let learned = new QAgent({ table: results.qtable });
const manual = { bid: 2, ask: 2 };
const NAMES = { learned: "Trained agent", cautious: "Hand-written rule", fixed2: "Fixed 2 ticks", manual: "You" };
const policies = {
  learned: () => learned.policy(),
  cautious: () => cautiousRule(),
  fixed2: () => fixed(2),
  manual: () => () => indexOf(manual.bid, manual.ask)
};

/* ---------- Live market ---------- */
// Two copies of the market run on the same seed, so the chosen strategy and a comparison
// strategy face the same prices and the same arriving traders.
const live = { main: null, other: null, key: "learned", otherKey: "fixed2", policy: null, otherPolicy: null, timer: null, playing: false, history: [], fills: 0, episode: 0, speed: 420 };

function resetLive() {
  const seed = (Date.now() + live.episode * 7919) >>> 0;
  live.main = new Market(makeRng(seed));
  live.other = new Market(makeRng(seed));
  live.otherKey = live.key === "learned" ? "fixed2" : "learned";
  live.policy = policies[live.key]();
  live.otherPolicy = policies[live.otherKey]();
  live.history = [{ main: 0, other: 0, volatile: false }];
  live.fills = 0;
  live.episode += 1;
  $("#tape").textContent = "";
  $("#k-main").textContent = NAMES[live.key];
  $("#k-other").textContent = NAMES[live.otherKey];
}

function describeTrade(t, value) {
  const mine = t.maker === "mm";
  const who = t.informed ? "Informed" : "Uninformed";
  const verb = t.takerSide === "buy" ? "buyer" : "seller";
  const at = (mine ? "your " : "a dealer's ") + (t.takerSide === "buy" ? "ask" : "bid") + " at " + t.price;
  let edge = null;
  if (mine) edge = t.takerSide === "buy" ? t.price - value : value - t.price;
  return { text: `${who} ${verb} traded on ${at}`, edge, mine };
}

function renderLadder(out) {
  const body = $("#ladder");
  body.textContent = "";
  const max = DEFAULTS.dealerSize * 2;
  for (let price = out.ref + 4; price >= out.ref - 4; price--) {
    const ask = out.depth.asks.find((d) => d.price === price);
    const bid = out.depth.bids.find((d) => d.price === price);
    const row = document.createElement("div");
    row.className = "lrow" + (price === out.ref ? " ref" : "");
    const cell = (d, side) => {
      const c = document.createElement("div");
      c.className = "lcell " + side;
      if (d) {
        const bar = document.createElement("i");
        bar.style.width = Math.min(100, (d.qty / max) * 100) + "%";
        if (d.mine) bar.className = "mine";
        c.appendChild(bar);
        const n = document.createElement("span");
        n.textContent = d.mine ? (d.qty > d.mine ? `you + ${d.qty - d.mine}` : "you") : d.qty;
        c.appendChild(n);
      }
      return c;
    };
    const p = document.createElement("div");
    p.className = "lprice num";
    p.textContent = price;
    row.append(cell(bid, "bid"), p, cell(ask, "ask"));
    body.appendChild(row);
  }
}

function renderLiveChart() {
  const el = $("#live-chart");
  el.textContent = "";
  const W = 600, H = 170, pad = 6;
  const pts = live.history, n = DEFAULTS.steps;
  let lo = Math.min(0, ...pts.map((p) => Math.min(p.main, p.other))), hi = Math.max(0, ...pts.map((p) => Math.max(p.main, p.other)));
  if (hi - lo < 20) { hi += 10; lo -= 10; }
  const x = (i) => pad + (i / n) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
  // Shade the steps when the market was volatile.
  let start = null;
  for (let i = 1; i <= pts.length; i++) {
    const v = i < pts.length && pts[i].volatile;
    if (v && start === null) start = i - 1;
    if (!v && start !== null) { el.appendChild(svg("rect", { x: x(start), y: 0, width: x(i - 1) - x(start), height: H, class: "vol" })); start = null; }
  }
  el.appendChild(svg("line", { x1: pad, x2: W - pad, y1: y(0), y2: y(0), class: "axis strong" }));
  const line = (key, cls) => el.appendChild(svg("polyline", { class: cls, points: pts.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ") }));
  line("other", "line faint");
  line("main", "line");
  const last = pts[pts.length - 1];
  el.appendChild(svg("circle", { cx: x(pts.length - 1), cy: y(last.main), r: 3.5, class: "dot" }));
  $("#v-main").textContent = fmt(last.main);
  $("#v-other").textContent = fmt(last.other);
}

function tick() {
  if (live.main.done) resetLive();
  const m = live.main, o = live.other;
  const out = m.step(ACTIONS[live.policy(m.inventory, m.volatile)], true);
  const outOther = o.step(ACTIONS[live.otherPolicy(o.inventory, o.volatile)]);
  live.history.push({ main: out.pnl, other: outOther.pnl, volatile: out.wasVolatile });
  renderLadder(out);
  const tape = $("#tape");
  for (const t of out.trades) {
    const d = describeTrade(t, out.value);
    if (d.mine) live.fills += 1;
    const li = document.createElement("li");
    li.className = d.mine ? "mine" : "";
    li.innerHTML = `<span>${d.text}</span>` + (d.edge === null ? "" : `<b class="${+d.edge.toFixed(1) >= 0 ? "pos" : "neg"} num">${fmt(d.edge)}</b>`);
    tape.prepend(li);
  }
  while (tape.children.length > 5) tape.lastChild.remove();
  $("#s-step").textContent = `${m.t} / ${DEFAULTS.steps}`;
  $("#s-inv").textContent = (out.inventory > 0 ? "+" : "") + out.inventory;
  const pnlEl = $("#s-pnl");
  pnlEl.textContent = fmt(out.pnl);
  pnlEl.className = "num " + (out.pnl >= 0 ? "pos" : "neg");
  $("#s-fills").textContent = live.fills;
  $("#s-quote").textContent = (out.quotes.bid === null ? "none" : out.quotes.bid) + " / " + (out.quotes.ask === null ? "none" : out.quotes.ask);
  const regime = $("#s-regime");
  regime.textContent = out.volatile ? "Volatile" : "Calm";
  regime.className = out.volatile ? "badge hot" : "badge";
  renderLiveChart();
}

function setPlaying(on) {
  live.playing = on;
  clearInterval(live.timer);
  if (on) live.timer = setInterval(tick, live.speed);
  const btn = $("#play");
  btn.textContent = on ? "Pause" : "Play";
  btn.setAttribute("aria-pressed", String(on));
}

function initLive() {
  resetLive();
  for (let i = 0; i < 60; i++) tick();           // open on a market already in progress
  $("#play").addEventListener("click", () => setPlaying(!live.playing));
  $("#step").addEventListener("click", () => { setPlaying(false); tick(); });
  $("#restart").addEventListener("click", () => { resetLive(); tick(); });
  $("#strategy").addEventListener("change", (e) => {
    live.key = e.target.value;
    $("#manual").hidden = live.key !== "manual";
    if (live.key === "manual") { live.speed = 900; $("#speed").value = "900"; if (live.playing) setPlaying(true); }
    resetLive();
    tick();
  });
  $("#speed").addEventListener("change", (e) => { live.speed = +e.target.value; if (live.playing) setPlaying(true); });
  document.querySelectorAll("#manual button").forEach((b) => b.addEventListener("click", () => {
    manual[b.dataset.side] = +b.dataset.off;
    document.querySelectorAll(`#manual button[data-side="${b.dataset.side}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  if (!reduceMotion && "IntersectionObserver" in window) {
    let started = false;
    new IntersectionObserver((entries) => {
      const visible = entries[0].isIntersecting;
      if (visible && !started) { started = true; setPlaying(true); }
      else if (!visible && live.playing) { setPlaying(false); started = false; }
    }, { threshold: 0.25 }).observe($("#market-panel"));
  }
}

/* ---------- Learned quotes chart ---------- */
function renderPolicy(el, rows) {
  el.textContent = "";
  rows = rows.filter((r) => Math.abs(r.inventory) <= 4);
  const rowH = 24, W = 300, left = 44, right = 12, top = 26;
  const H = top + rows.length * rowH + 6;
  el.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (off) => left + ((off + 3) / 6) * (W - left - right);
  for (let off = -3; off <= 3; off++) {
    el.appendChild(svg("line", { x1: x(off), x2: x(off), y1: top - 4, y2: H - 4, class: off === 0 ? "axis strong" : "axis" }));
    el.appendChild(svg("text", { x: x(off), y: 12, class: "tick", "text-anchor": "middle" }, off === 0 ? "P" : (off > 0 ? "+" : "−") + Math.abs(off)));
  }
  rows.slice().reverse().forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    el.appendChild(svg("text", { x: left - 14, y: y + 4, class: "tick", "text-anchor": "end" }, (r.inventory > 0 ? "+" : r.inventory < 0 ? "−" : "") + Math.abs(r.inventory)));
    el.appendChild(svg("line", { x1: x(-r.bid), x2: x(r.ask), y1: y, y2: y, class: "span" }));
    el.appendChild(svg("circle", { cx: x(-r.bid), cy: y, r: 5, class: "bidpt" }));
    el.appendChild(svg("circle", { cx: x(r.ask), cy: y, r: 5, class: "askpt" }));
  });
}
const renderPolicies = (calm, volatile) => { renderPolicy($("#policy-calm"), calm); renderPolicy($("#policy-volatile"), volatile); };

/* ---------- Learning curve ---------- */
function renderCurve(points, total) {
  const el = $("#curve");
  el.textContent = "";
  const W = 600, H = 190, l = 40, r = 10, t = 10, b = 24;
  const ys = points.map((p) => p.meanPnl);
  const lo = Math.min(-5, ...ys), hi = Math.max(25, ...ys);
  const x = (ep) => l + (ep / total) * (W - l - r);
  const y = (v) => t + (1 - (v - lo) / (hi - lo)) * (H - t - b);
  for (const v of [lo, 0, hi]) {
    el.appendChild(svg("line", { x1: l, x2: W - r, y1: y(v), y2: y(v), class: v === 0 ? "axis strong" : "axis" }));
    el.appendChild(svg("text", { x: l - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, Math.round(v)));
  }
  el.appendChild(svg("text", { x: l, y: H - 6, class: "tick" }, "0"));
  el.appendChild(svg("text", { x: W - r, y: H - 6, class: "tick", "text-anchor": "end" }, total.toLocaleString("en-GB") + " episodes"));
  if (points.length) {
    el.appendChild(svg("polyline", { class: "line", points: points.map((p) => `${x(p.episode).toFixed(1)},${y(p.meanPnl).toFixed(1)}`).join(" ") }));
    const last = points[points.length - 1];
    el.appendChild(svg("circle", { cx: x(last.episode), cy: y(last.meanPnl), r: 3.5, class: "dot" }));
  }
}

/* ---------- Training in the browser ---------- */
let training = false;
function initTraining() {
  renderCurve(results.curve, results.trainEpisodes);
  renderPolicies(results.policy.calm, results.policy.volatile);
  const share = $("#informed"), shareOut = $("#informed-out");
  const showShare = () => { shareOut.textContent = Math.round(share.value * 100) + "%"; };
  share.addEventListener("input", showShare);
  showShare();
  $("#train").addEventListener("click", () => {
    if (training) return;
    training = true;
    const btn = $("#train"), status = $("#train-status");
    btn.disabled = true;
    const params = { informedShare: +share.value };
    const agent = new QAgent();
    const seed = (Date.now() >>> 0) || 1;
    const episodes = results.trainEpisodes;
    const gen = train(agent, makeRng(seed), { params, episodes, report: 500 });
    const points = [];
    const stepTraining = () => {
      const next = gen.next();
      if (!next.done) {
        points.push(next.value);
        renderCurve(points, episodes);
        renderPolicies(agent.describe(false), agent.describe(true));
        status.textContent = `Training: episode ${next.value.episode.toLocaleString("en-GB")} of ${episodes.toLocaleString("en-GB")}. Still exploring ${Math.round(next.value.epsilon * 100)}% of the time.`;
        setTimeout(stepTraining, 0);
        return;
      }
      const testSeed = seed + 1;
      const a = evaluate(agent.policy(), makeRng(testSeed), { episodes: 1000, params });
      const f = evaluate(fixed(2), makeRng(testSeed), { episodes: 1000, params });
      const calm = agent.describe(false).find((d) => d.inventory === 0), vol = agent.describe(true).find((d) => d.inventory === 0);
      status.innerHTML = `<b>Done.</b> With ${Math.round(params.informedShare * 100)}% informed flow and no position, this agent quotes ${calm.bid} below and ${calm.ask} above when calm, and ${vol.bid} below and ${vol.ask} above when volatile. ` +
        `Over 1,000 new episodes it averaged ${fmt(a.mean)} ticks (standard deviation ${a.sd.toFixed(1)}), against ${fmt(f.mean)} (${f.sd.toFixed(1)}) for a fixed 2-tick quote. ` +
        `The live market above now uses this agent.`;
      learned = agent;
      if (live.key === "learned") live.policy = learned.policy();
      if (live.otherKey === "learned") live.otherPolicy = learned.policy();
      btn.disabled = false;
      btn.textContent = "Train another";
      training = false;
    };
    stepTraining();
  });
}

/* ---------- Results ---------- */
function initResults() {
  const tbody = $("#results-body");
  for (const r of results.results) {
    const tr = document.createElement("tr");
    if (r.key === "learned") tr.className = "hl";
    tr.innerHTML = `<th scope="row">${r.name}</th><td class="num r">${fmt(r.mean)}</td><td class="num r">${r.sd.toFixed(1)}</td>` +
      `<td class="num r">${r.ratio.toFixed(2)}</td><td class="num r">${fmt(r.p5)}</td><td class="num r">${(r.lossRate * 100).toFixed(1)}%</td><td class="num r">${r.meanAbsInventory.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }
  const host = $("#histograms");
  const { lo, hi, bins } = results.histogramRange;
  const peak = Math.max(...results.results.flatMap((r) => r.histogram));
  for (const r of results.results.filter((x) => x.key !== "fixed1")) {
    const fig = document.createElement("figure");
    fig.className = "hist" + (r.key === "learned" ? " hl" : "");
    const cap = document.createElement("figcaption");
    cap.innerHTML = `<b>${r.name}</b><span class="num">mean ${fmt(r.mean)} · sd ${r.sd.toFixed(1)}</span>`;
    const W = 600, H = 70;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H + 16}`, role: "img", "aria-label": `Distribution of end-of-episode profit for ${r.name}: mean ${r.mean}, standard deviation ${r.sd}` });
    const bw = W / bins;
    r.histogram.forEach((c, i) => {
      const h = (c / peak) * H;
      if (c > 0) s.appendChild(svg("rect", { x: (i * bw + 0.5).toFixed(1), y: (H - h).toFixed(1), width: (bw - 1).toFixed(1), height: h.toFixed(1), class: lo + (i + 0.5) * ((hi - lo) / bins) < 0 ? "bar loss" : "bar" }));
    });
    const zx = ((0 - lo) / (hi - lo)) * W;
    s.appendChild(svg("line", { x1: 0, x2: W, y1: H, y2: H, class: "axis strong" }));
    s.appendChild(svg("line", { x1: zx, x2: zx, y1: 0, y2: H + 3, class: "axis strong" }));
    s.appendChild(svg("text", { x: 0, y: H + 14, class: "tick" }, "−200"));
    s.appendChild(svg("text", { x: zx, y: H + 14, class: "tick", "text-anchor": "middle" }, "0"));
    s.appendChild(svg("text", { x: W, y: H + 14, class: "tick", "text-anchor": "end" }, "+200 ticks"));
    fig.append(cap, s);
    host.appendChild(fig);
  }
  const sweep = $("#sweep");
  const top = Math.max(...results.sweep.map((s) => s.mean));
  for (const s of results.sweep) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<div class="cap"><span>${Math.round(s.informedShare * 100)}% of takers informed</span><b>${fmt(s.mean)}</b></div><div class="track"><div class="fill" style="width:${(s.mean / top) * 100}%"></div></div>`;
    sweep.appendChild(row);
  }
}

initLive();
initTraining();
initResults();
