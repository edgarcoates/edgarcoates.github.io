import test from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../src/rng.js";
import { Market, ACTIONS } from "../src/market.js";
import { fixed, skewRule, cautiousRule, QAgent, train, evaluate } from "../src/agents.js";

test("the same seed gives the same episode", () => {
  const run = () => {
    const m = new Market(makeRng(42));
    while (!m.done) m.step(ACTIONS[4]);
    return [m.pnl, m.inventory];
  };
  assert.deepEqual(run(), run());
});

test("cash, inventory and profit stay consistent with the fills", () => {
  const m = new Market(makeRng(3));
  let inv = 0, cash = 0;
  while (!m.done) {
    const out = m.step(ACTIONS[0]);
    for (const f of out.trades) {
      if (f.maker !== "mm") continue;
      if (f.takerSide === "buy") { inv -= f.qty; cash += f.price * f.qty; } else { inv += f.qty; cash -= f.price * f.qty; }
    }
    assert.equal(out.inventory, inv);
    assert.ok(Math.abs(out.pnl - (cash + inv * out.value)) < 1e-9);
  }
});

test("inventory never passes the limit", () => {
  const m = new Market(makeRng(5), { maxInventory: 3 });
  for (let ep = 0; ep < 20; ep++) {
    m.reset();
    while (!m.done) assert.ok(Math.abs(m.step(ACTIONS[0]).inventory) <= 3);
  }
});

test("informed takers only trade when the quote is mispriced", () => {
  const m = new Market(makeRng(9), { informedShare: 1 });
  while (!m.done) {
    const out = m.step(ACTIONS[0]);
    for (const f of out.trades) {
      if (f.takerSide === "buy") assert.ok(out.value > f.price); else assert.ok(out.value < f.price);
    }
  }
});

test("with no informed takers, quoting earns the spread on average", () => {
  const r = evaluate(fixed(1), makeRng(1), { episodes: 300, params: { informedShare: 0 } });
  assert.ok(r.mean > 0);
});

test("quoting behind the dealers gets almost no fills", () => {
  const r = evaluate(fixed(3), makeRng(1), { episodes: 100 });
  assert.ok(r.fillsPerEpisode < 0.5);
});

test("the skew rule carries less inventory than a fixed quote", () => {
  const a = evaluate(fixed(2), makeRng(2), { episodes: 300 });
  const b = evaluate(skewRule(1), makeRng(2), { episodes: 300 });
  assert.ok(b.meanAbsInventory < a.meanAbsInventory);
});

test("the market spends time both calm and volatile, and moves more when volatile", () => {
  const m = new Market(makeRng(11));
  const moves = { calm: [], volatile: [] };
  for (let ep = 0; ep < 50; ep++) {
    m.reset();
    let last = m.value;
    while (!m.done) {
      const out = m.step(ACTIONS[8]);
      (out.wasVolatile ? moves.volatile : moves.calm).push(Math.abs(out.value - last));
      last = out.value;
    }
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(moves.calm.length > 1000 && moves.volatile.length > 1000);
  assert.ok(avg(moves.volatile) > 1.5 * avg(moves.calm));
});

test("two strategies on the same seed face the same value path", () => {
  const path = (policy) => {
    const m = new Market(makeRng(21));
    const values = [];
    while (!m.done) values.push(m.step(ACTIONS[policy(m.inventory, m.volatile)]).value);
    return values;
  };
  assert.deepEqual(path(fixed(1)), path(cautiousRule()));
});

test("the cautious rule does not open positions when the market is volatile", () => {
  const rule = cautiousRule();
  assert.deepEqual(ACTIONS[rule(0, true)], { bid: 3, ask: 3 });
  assert.deepEqual(ACTIONS[rule(2, true)], { bid: 3, ask: 1 });
});

test("the trained agent learns to lean against its inventory", () => {
  const agent = new QAgent({ seesRegime: false });
  for (const _ of train(agent, makeRng(1), { episodes: 4000 })) { /* run to the end */ }
  const long = ACTIONS[agent.greedy(2)], short = ACTIONS[agent.greedy(-2)];
  assert.ok(long.ask < long.bid, "when long, the ask should be tighter than the bid");
  assert.ok(short.bid < short.ask, "when short, the bid should be tighter than the ask");
});

test("an agent that can see volatility learns to step back when the market is volatile", () => {
  const agent = new QAgent();
  for (const _ of train(agent, makeRng(1), { episodes: 12000 })) { /* run to the end */ }
  const calm = ACTIONS[agent.greedy(0, false)], volatile = ACTIONS[agent.greedy(0, true)];
  assert.ok(volatile.bid + volatile.ask > calm.bid + calm.ask);
});
