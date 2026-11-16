// Quoting strategies. A strategy maps the market maker's inventory to an action index.

import { ACTIONS, Market } from "./market.js";

const indexOf = (bid, ask) => ACTIONS.findIndex((a) => a.bid === bid && a.ask === ask);

// Always quote the same distance on both sides.
export const fixed = (offset) => () => indexOf(offset, offset);

// A hand-written rule: quote 2 ticks each side when flat. When long, quote a tighter ask and a
// wider bid to sell down; mirror that when short.
export const skewRule = (threshold = 2) => (inventory) => {
  if (inventory >= threshold) return indexOf(3, 1);
  if (inventory <= -threshold) return indexOf(1, 3);
  return indexOf(2, 2);
};

// Tabular Q-learning. The state is inventory, clipped to [-clip, clip].
export class QAgent {
  constructor({ clip = 6, table = null } = {}) {
    this.clip = clip;
    this.states = 2 * clip + 1;
    this.q = table ? table.map((row) => row.slice()) : Array.from({ length: this.states }, () => new Array(ACTIONS.length).fill(0));
  }
  state(inventory) { return Math.max(-this.clip, Math.min(this.clip, inventory)) + this.clip; }
  greedy(inventory) {
    const row = this.q[this.state(inventory)];
    let best = 0;
    for (let a = 1; a < row.length; a++) if (row[a] > row[best]) best = a;
    return best;
  }
  policy() { return (inventory) => this.greedy(inventory); }
  // The learned quote for every inventory level, most short first.
  describe() {
    const rows = [];
    for (let inv = -this.clip; inv <= this.clip; inv++) rows.push({ inventory: inv, ...ACTIONS[this.greedy(inv)] });
    return rows;
  }
}

// Train for `episodes` episodes. Returns a generator so a page can draw progress as it goes.
export function* train(agent, rng, { episodes = 10000, params = {}, alpha = 0.02, gamma = 0.98, epsStart = 1, epsEnd = 0.02, report = 500 } = {}) {
  const market = new Market(rng, params);
  let window = 0;
  for (let ep = 0; ep < episodes; ep++) {
    const eps = Math.max(epsEnd, epsStart - (epsStart - epsEnd) * (ep / (episodes * 0.7)));
    const lr = alpha * (1 - 0.9 * ep / episodes);
    market.reset();
    let s = agent.state(0);
    while (!market.done) {
      const a = rng.uniform() < eps ? rng.int(ACTIONS.length) : agent.greedy(market.inventory);
      const out = market.step(ACTIONS[a]);
      const s2 = agent.state(out.inventory);
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
      const out = market.step(ACTIONS[policy(market.inventory)]);
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
