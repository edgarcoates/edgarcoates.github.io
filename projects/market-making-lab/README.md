# Market-Making Lab

A small simulated market for studying how a market maker should quote.

- **`src/book.js`** A limit order book with price-time priority: resting, crossing, partial fills, immediate-or-cancel and cancel.
- **`src/market.js`** A market built on the book. A hidden true value follows a random walk. Informed takers trade only when a quote is mispriced against the new value; uninformed takers trade at random and hit tighter quotes more often; competing dealers quote three ticks wide.
- **`src/agents.js`** Quoting strategies: fixed quotes, a hand-written inventory-skew rule, and a tabular Q-learning agent whose only input is its own inventory.
- **`app.js`** The page code. The live page is at https://edgarcoates.github.io/projects/market-making-lab.html and runs this same code in the browser.

No dependencies. Needs Node 20 or later.

## Run it

```bash
npm test
```

```bash
npm run experiment
```

`npm test` runs 20 tests of the order book, the market's accounting and the agents. `npm run experiment` trains the agent, tests every strategy on the same 5,000 episodes, and rewrites `results.json` and `results.js`, which hold every number shown on the page. Runs are seeded, so the output is the same each time.

## Results

Ticks of profit per 200-step episode, 5,000 test episodes, 40% of takers informed.

| Strategy | Mean | Std dev | Mean ÷ sd | 5th percentile | Episodes lost | Avg abs. inventory |
|---|---:|---:|---:|---:|---:|---:|
| Fixed, 1 tick each side | 14.43 | 88.41 | 0.16 | −141.51 | 39.1% | 3.37 |
| Fixed, 2 ticks each side | 24.21 | 71.64 | 0.34 | −99.83 | 29.9% | 2.56 |
| Hand-written skew rule (from 2 units) | 20.66 | 24.86 | 0.83 | −19.89 | 19.6% | 0.90 |
| Trained agent | 16.74 | 14.86 | 1.13 | −7.50 | 12.5% | 0.42 |

The agent learned to quote two ticks each side when flat and, from one unit of inventory, to tighten the side that reduces the position to one tick and widen the other to three. The hand-written rule with its threshold moved from two units to one gives identical results, so the agent matched a well-tuned rule rather than beating it.

## How the agent learns

- **State:** inventory, clipped to −6…+6 (13 states).
- **Actions:** a bid offset and an ask offset, each 1, 2 or 3 ticks from the reference price (9 actions).
- **Reward:** the edge on each fill against the new true value, minus 0.05 × inventory². The revaluation of inventory already held is left out of the reward: it averages zero whatever the agent does and only adds noise. Results are always measured on full profit and loss.
- **Training:** 10,000 episodes of 200 steps, ε-greedy exploration falling from 100% to 2%, learning rate falling from 0.02.

## Limits

This is a simulation, not market data, and the results are in ticks, not money. One instrument, one-lot orders, a random-walk value, dealers that never adapt, and quotes replaced every step so queue position does not persist. The agent sees only its own inventory. The inventory penalty is a chosen parameter, and a different value gives a different balance of profit and risk.
