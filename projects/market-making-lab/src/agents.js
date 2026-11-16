// Quoting strategies. A strategy maps what the market maker can see (its inventory, and whether
// the market is calm or volatile) to an action index.

import { ACTIONS, Market } from "./market.js";

export const indexOf = (bid, ask) => ACTIONS.findIndex((a) => a.bid === bid && a.ask === ask);

// Always quote the same distance on both sides.
export const fixed = (offset) => () => indexOf(offset, offset);

// A hand-written rule: quote `flat` ticks each side with no position. When long by `threshold`
// or more, quote a 1-tick ask and a 3-tick bid to sell down; mirror that when short.
export const skewRule = (threshold = 1, flat = 2) => (inventory) => {
  if (inventory >= threshold) return indexOf(3, 1);
  if (inventory <= -threshold) return indexOf(1, 3);
  return indexOf(flat, flat);
};

// The skew rule, plus: when the market is volatile, stop opening new positions (quote behind the
// dealers) and only quote to close an existing one.
export const cautiousRule = () => (inventory, volatile) => {
  if (!volatile) return skewRule(1, 2)(inventory);
  if (inventory > 0) return indexOf(3, 1);
  if (inventory < 0) return indexOf(1, 3);
  return indexOf(3, 3);
};

// Tabular Q-learning. The state is inventory (clipped to [-clip, clip]) and, if seesRegime is
// set, whether the market is calm or volatile.
export class QAgent {
  constructor({ clip = 6, seesRegime = true, table = null } = {}) {
    this.clip = clip;
    this.seesRegime = seesRegime;
    this.perRegime = 2 * clip + 1;
    this.states = this.perRegime * (seesRegime ? 2 : 1);
    this.q = table ? table.map((row) => row.slice()) : Array.from({ length: this.states }, () => new Array(ACTIONS.length).fill(0));
  }
  state(inventory, volatile) {
    const i = Math.max(-this.clip, Math.min(this.clip, inventory)) + this.clip;
    return this.seesRegime && volatile ? i + this.perRegime : i;
  }
  greedy(inventory, volatile) {
    const row = this.q[this.state(inventory, volatile)];
    let best = 0;
    for (let a = 1; a < row.length; a++) if (row[a] > row[best]) best = a;
    return best;
  }
  policy() { return (inventory, volatile) => this.greedy(inventory, volatile); }
  // The learned quote for every inventory level, most short first.
  describe(volatile = false) {
    const rows = [];
    for (let inv = -this.clip; inv <= this.clip; inv++) rows.push({ inventory: inv, ...ACTIONS[this.greedy(inv, volatile)] });
    return rows;
  }
}

// Train for `episodes` episodes. Returns a generator so a page can draw progress as it goes.
export function* train(agent, rng, { episodes = 20000, params = {}, alpha = 0.02, gamma = 0.98, epsStart = 1, epsEnd = 0.02, report = 500 } = {}) {
  const market = new Market(rng, params);
  let window = 0;
  for (let ep = 0; ep < episodes; ep++) {
    const eps = Math.max(epsEnd, epsStart - (epsStart - epsEnd) * (ep / (episodes * 0.7)));
    const lr = alpha * (1 - 0.9 * ep / episodes);
    market.reset();
    let s = agent.state(0, market.volatile);
    while (!market.done) {
      const a = rng.uniform() < eps ? rng.int(ACTIONS.length) : agent.greedy(market.inventory, market.volatile);
      const out = market.step(ACTIONS[a]);
      const s2 = agent.state(out.inventory, out.volatile);
      const future = out.done ? 0 : Math.max(...agent.q[s2]);
      agent.q[s][a] += lr * (out.reward + gamma * future - agent.q[s][a]);
      s = s2;
    }
    window += market.pnl;
    if ((ep + 1) % report === 0) {
      yield { episode: ep + 1, episodes, meanPnl: window / report, epsilon: eps };
      window = 0;
    }
  }
}

// Run a strategy over many episodes and summarise the profit at the end of each.
export function evaluate(policy, rng, { episodes = 2000, params = {} } = {}) {
  const market = new Market(rng, params);
  const pnls = [];
  let absInventory = 0, steps = 0, fills = 0;
  for (let ep = 0; ep < episodes; ep++) {
    market.reset();
    while (!market.done) {
      const out = market.step(ACTIONS[policy(market.inventory, market.volatile)]);
      absInventory += Math.abs(out.inventory);
      steps += 1;
      for (const t of out.trades) if (t.maker === "mm") fills += 1;
    }
    pnls.push(market.pnl);
  }
  const mean = pnls.reduce((x, y) => x + y, 0) / pnls.length;
  const sd = Math.sqrt(pnls.reduce((x, y) => x + (y - mean) ** 2, 0) / (pnls.length - 1));
  const sorted = pnls.slice().sort((x, y) => x - y);
  return {
    episodes, mean, sd, ratio: mean / sd,
    p5: sorted[Math.floor(0.05 * sorted.length)],
    lossRate: pnls.filter((x) => x < 0).length / pnls.length,
    meanAbsInventory: absInventory / steps,
    fillsPerEpisode: fills / episodes,
    pnls
  };
}
