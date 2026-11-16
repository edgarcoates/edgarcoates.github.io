import test from "node:test";
import assert from "node:assert/strict";
import { OrderBook } from "../src/book.js";

test("a resting order sets the best price", () => {
  const b = new OrderBook();
  b.limit({ owner: "a", side: "buy", price: 99, qty: 2 });
  b.limit({ owner: "a", side: "sell", price: 101, qty: 2 });
  assert.equal(b.bestBid(), 99);
  assert.equal(b.bestAsk(), 101);
});

test("an order that does not cross rests without trading", () => {
  const b = new OrderBook();
  b.limit({ owner: "a", side: "sell", price: 101, qty: 1 });
  const r = b.limit({ owner: "b", side: "buy", price: 100, qty: 1 });
  assert.equal(r.fills.length, 0);
  assert.equal(b.bestBid(), 100);
});

test("a crossing order trades at the resting order's price", () => {
  const b = new OrderBook();
  b.limit({ owner: "a", side: "sell", price: 101, qty: 1 });
  const r = b.limit({ owner: "b", side: "buy", price: 105, qty: 1 });
  assert.deepEqual(r.fills.map((f) => [f.price, f.qty, f.maker]), [[101, 1, "a"]]);
  assert.equal(b.bestAsk(), null);
});

test("better prices fill first", () => {
  const b = new OrderBook();
  b.limit({ owner: "far", side: "sell", price: 103, qty: 1 });
  b.limit({ owner: "near", side: "sell", price: 101, qty: 1 });
  const r = b.market({ owner: "t", side: "buy", qty: 2 });
  assert.deepEqual(r.fills.map((f) => f.maker), ["near", "far"]);
});

test("at the same price, the older order fills first", () => {
  const b = new OrderBook();
  b.limit({ owner: "first", side: "buy", price: 99, qty: 1 });
  b.limit({ owner: "second", side: "buy", price: 99, qty: 1 });
  const r = b.market({ owner: "t", side: "sell", qty: 1 });
  assert.equal(r.fills[0].maker, "first");
  assert.equal(b.depth("buy")[0].qty, 1);
});

test("a large order walks the book and rests the remainder", () => {
  const b = new OrderBook();
  b.limit({ owner: "a", side: "sell", price: 101, qty: 2 });
  b.limit({ owner: "a", side: "sell", price: 102, qty: 2 });
  const r = b.limit({ owner: "t", side: "buy", price: 102, qty: 5 });
  assert.equal(r.fills.reduce((s, f) => s + f.qty, 0), 4);
  assert.equal(r.unfilled, 1);
  assert.equal(b.bestBid(), 102);
  assert.equal(b.bestAsk(), null);
});

test("an immediate-or-cancel order never rests", () => {
  const b = new OrderBook();
  const r = b.limit({ owner: "t", side: "buy", price: 100, qty: 1, ioc: true });
  assert.equal(r.id, null);
  assert.equal(b.bestBid(), null);
});

test("a market order against an empty book does nothing", () => {
  const b = new OrderBook();
  const r = b.market({ owner: "t", side: "sell", qty: 3 });
  assert.equal(r.fills.length, 0);
  assert.equal(r.unfilled, 3);
});

test("cancel removes the order and its empty level", () => {
  const b = new OrderBook();
  const { id } = b.limit({ owner: "a", side: "buy", price: 99, qty: 1 });
  assert.equal(b.cancel(id), true);
  assert.equal(b.bestBid(), null);
  assert.equal(b.cancel(id), false);
});

test("partial fills keep the remainder at the front of the queue", () => {
  const b = new OrderBook();
  b.limit({ owner: "first", side: "sell", price: 101, qty: 3 });
  b.limit({ owner: "second", side: "sell", price: 101, qty: 1 });
  b.market({ owner: "t", side: "buy", qty: 1 });
  const r = b.market({ owner: "t", side: "buy", qty: 1 });
  assert.equal(r.fills[0].maker, "first");
});

test("depth reports total size and the caller's own size", () => {
  const b = new OrderBook();
  b.limit({ owner: "dealers", side: "buy", price: 99, qty: 5 });
  b.limit({ owner: "mm", side: "buy", price: 99, qty: 1 });
  b.limit({ owner: "mm", side: "buy", price: 100, qty: 1 });
  assert.deepEqual(b.depth("buy", "mm"), [{ price: 100, qty: 1, mine: 1 }, { price: 99, qty: 6, mine: 1 }]);
});

test("invalid orders are rejected", () => {
  const b = new OrderBook();
  assert.throws(() => b.limit({ owner: "a", side: "buy", price: 99, qty: 0 }));
  assert.throws(() => b.limit({ owner: "a", side: "hold", price: 99, qty: 1 }));
});
