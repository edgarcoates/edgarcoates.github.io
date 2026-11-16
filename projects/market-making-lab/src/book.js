// A limit order book with price-time priority.
// Prices are integer ticks. Each price level is a first-in, first-out queue.

export class OrderBook {
  constructor() {
    this.levels = { buy: new Map(), sell: new Map() };
    this.orders = new Map();
    this.nextId = 1;
  }

  best(side) {
    const prices = this.levels[side];
    if (prices.size === 0) return null;
    let best = null;
    for (const p of prices.keys()) {
      if (best === null || (side === "buy" ? p > best : p < best)) best = p;
    }
    return best;
  }
  bestBid() { return this.best("buy"); }
  bestAsk() { return this.best("sell"); }

  // Send a limit order. It trades against resting orders at the resting order's price while it
  // crosses, best price first and oldest order first within a price. Whatever is left rests in
  // the book, unless ioc (immediate-or-cancel) is set.
  limit({ owner, side, price, qty, ioc = false }) {
    if (!(qty > 0) || !Number.isInteger(qty)) throw new Error("qty must be a positive integer");
    if (side !== "buy" && side !== "sell") throw new Error("side must be buy or sell");
    const opposite = side === "buy" ? "sell" : "buy";
    const fills = [];
    let left = qty;
    while (left > 0) {
      const bestPrice = this.best(opposite);
      if (bestPrice === null) break;
      const crosses = side === "buy" ? price >= bestPrice : price <= bestPrice;
      if (!crosses) break;
      const queue = this.levels[opposite].get(bestPrice);
      const maker = queue[0];
      const traded = Math.min(left, maker.qty);
      maker.qty -= traded;
      left -= traded;
      fills.push({ price: bestPrice, qty: traded, maker: maker.owner, makerId: maker.id, taker: owner, takerSide: side });
      if (maker.qty === 0) {
        queue.shift();
        this.orders.delete(maker.id);
        if (queue.length === 0) this.levels[opposite].delete(bestPrice);
      }
    }
    let id = null;
    if (left > 0 && !ioc) {
      if (!Number.isFinite(price)) throw new Error("a resting order needs a finite price");
      id = this.nextId++;
      const order = { id, owner, side, price, qty: left };
      if (!this.levels[side].has(price)) this.levels[side].set(price, []);
      this.levels[side].get(price).push(order);
      this.orders.set(id, order);
    }
    return { id, fills, unfilled: left };
  }

  // A market order takes whatever is available and never rests.
  market({ owner, side, qty }) {
    return this.limit({ owner, side, qty, price: side === "buy" ? Infinity : -Infinity, ioc: true });
  }

  cancel(id) {
    const order = this.orders.get(id);
    if (!order) return false;
    const queue = this.levels[order.side].get(order.price);
    queue.splice(queue.indexOf(order), 1);
    if (queue.length === 0) this.levels[order.side].delete(order.price);
    this.orders.delete(id);
    return true;
  }

  clear() {
    this.levels.buy.clear();
    this.levels.sell.clear();
    this.orders.clear();
  }

  // Resting size per price, best price first. `mine` is the size owned by `owner`.
  depth(side, owner = null) {
    const rows = [];
    for (const [price, queue] of this.levels[side]) {
      let qty = 0, mine = 0;
      for (const o of queue) { qty += o.qty; if (o.owner === owner) mine += o.qty; }
      rows.push({ price, qty, mine });
    }
    rows.sort((a, b) => (side === "buy" ? b.price - a.price : a.price - b.price));
    return rows;
  }
}
