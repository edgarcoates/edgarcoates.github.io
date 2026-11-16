// A simulated market for one instrument, built on the order book.
//
// Each step:
//   1. Everyone sees the reference price P: the true value V from the previous step, rounded to a tick.
//   2. Competing dealers quote P - dealerOffset and P + dealerOffset. The market maker then posts
//      one bid and one ask of size 1 at the offsets it chooses (so it queues behind dealers on a tie).
//   3. The true value moves: V += sigma * N(0, 1).
//   4. Takers arrive (Poisson). An informed taker knows the new V and trades only when a quote is
//      mispriced against it. An uninformed taker picks a side at random and pays up to a random
//      distance from P, so tighter quotes are hit more often.
//   5. The market maker's position is marked at the new V.

import { OrderBook } from "./book.js";

export const DEFAULTS = {
  steps: 200,          // steps per episode
  sigma: 1.5,          // standard deviation of the value change per step, in ticks
  arrivals: 1.0,       // average takers per step
  informedShare: 0.4,  // fraction of takers who know the new value
  reach: 1.0,          // average distance (ticks) an uninformed taker will pay away from P
  dealerOffset: 3,     // competing dealers quote this far from P
  dealerSize: 5,
  maxInventory: 8,     // the market maker stops quoting the side that would breach this
  inventoryPenalty: 0.05 // reward penalty per unit of inventory squared, per step
};

export const OFFSETS = [1, 2, 3];
// An action is a pair (bid offset, ask offset). There are 9.
export const ACTIONS = OFFSETS.flatMap((b) => OFFSETS.map((a) => ({ bid: b, ask: a })));

export class Market {
  constructor(rng, params = {}) {
    this.rng = rng;
    this.p = { ...DEFAULTS, ...params };
    this.book = new OrderBook();
    this.reset();
  }

  reset() {
    this.t = 0;
    this.value = 100;
    this.inventory = 0;
    this.cash = 0;
    this.pnl = 0;
    this.book.clear();
    return this.inventory;
  }

  get done() { return this.t >= this.p.steps; }

  // Pass record = true to also get a snapshot of the book before takers arrive (used by the page).
  step(action, record = false) {
    const { rng, p, book } = this;
    const ref = Math.round(this.value);

    book.clear();
    book.limit({ owner: "dealers", side: "buy", price: ref - p.dealerOffset, qty: p.dealerSize });
    book.limit({ owner: "dealers", side: "sell", price: ref + p.dealerOffset, qty: p.dealerSize });
    book.limit({ owner: "dealers", side: "buy", price: ref - p.dealerOffset - 1, qty: p.dealerSize * 2 });
    book.limit({ owner: "dealers", side: "sell", price: ref + p.dealerOffset + 1, qty: p.dealerSize * 2 });
    const quotes = { bid: null, ask: null };
    if (this.inventory < p.maxInventory) {
      quotes.bid = ref - action.bid;
      book.limit({ owner: "mm", side: "buy", price: quotes.bid, qty: 1 });
    }
    if (this.inventory > -p.maxInventory) {
      quotes.ask = ref + action.ask;
      book.limit({ owner: "mm", side: "sell", price: quotes.ask, qty: 1 });
    }
    const depth = record ? { bids: book.depth("buy", "mm"), asks: book.depth("sell", "mm") } : null;

    const newValue = this.value + p.sigma * rng.normal();

    const trades = [];
    let edge = 0;
    const takers = rng.poisson(p.arrivals);
    for (let i = 0; i < takers; i++) {
      let result = null, informed = false;
      if (rng.uniform() < p.informedShare) {
        informed = true;
        const ask = book.bestAsk(), bid = book.bestBid();
        if (ask !== null && newValue > ask) result = book.limit({ owner: "informed", side: "buy", price: ask, qty: 1, ioc: true });
        else if (bid !== null && newValue < bid) result = book.limit({ owner: "informed", side: "sell", price: bid, qty: 1, ioc: true });
      } else {
        const side = rng.uniform() < 0.5 ? "buy" : "sell";
        const reach = Math.floor(rng.exponential(p.reach));
        const price = side === "buy" ? ref + reach : ref - reach;
        result = book.limit({ owner: "uninformed", side, price, qty: 1, ioc: true });
      }
      if (!result) continue;
      for (const f of result.fills) {
        trades.push({ ...f, informed });
        if (f.maker !== "mm") continue;
        if (f.takerSide === "buy") { this.inventory -= f.qty; this.cash += f.price * f.qty; edge += (f.price - newValue) * f.qty; }
        else { this.inventory += f.qty; this.cash -= f.price * f.qty; edge += (newValue - f.price) * f.qty; }
      }
    }

    this.value = newValue;
    this.t += 1;
    const pnl = this.cash + this.inventory * this.value;
    // Learning signal: the edge on each fill against the new value, minus an inventory penalty.
    // It leaves out the revaluation of inventory already held, which averages zero whatever the
    // agent does and only adds noise. Results are always measured on full profit and loss.
    const reward = edge - p.inventoryPenalty * this.inventory * this.inventory;
    this.pnl = pnl;
    return { reward, inventory: this.inventory, pnl, done: this.done, ref, quotes, depth, trades, value: newValue };
  }
}
