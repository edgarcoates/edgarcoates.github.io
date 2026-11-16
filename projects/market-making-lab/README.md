# Market-Making Lab

A simulated market in which a trading agent learns how to quote prices.

- **`src/book.js`** A limit order book with price-time priority: resting, crossing, partial fills, immediate-or-cancel and cancel.
- **`src/market.js`** A market built on the book. A hidden true value moves at random, by more in volatile periods than in calm ones. Informed traders trade only when a quote is on the wrong side of the new value. Uninformed traders trade at random and take closer quotes more often. Competing dealers quote 3 ticks wide.
- **`src/agents.js`** Quoting strategies: fixed quotes, two hand-written rules, and a tabular Q-learning agent.
- **`app.js`** The page code. The live page is at https://edgarcoates.github.io/projects/market-making-lab.html and runs this same code in the browser.

No dependencies. Needs Node 20 or later.

## Run it

```bash
npm test
```

```bash
npm run experiment
```

`npm test` runs 24 tests of the order book, the market's accounting and the agents. `npm run experiment` trains the agents, tests every strategy on the same 5,000 episodes, and rewrites `results.json` and `results.js`, which hold every number shown on the page. Runs are seeded, so the output is the same each time.

## Results

Ticks of profit per 200-step episode, 5,000 test episodes, 40% of traders informed.

| Strategy | Mean | Std dev | Mean ÷ sd | 5th percentile | Episodes lost | Avg abs. inventory |
|---|---:|---:|---:|---:|---:|---:|
| Fixed, 1 tick each side | 6.34 | 108.47 | 0.06 | −198.27 | 41.9% | 3.36 |
| Fixed, 2 ticks each side | 15.22 | 89.24 | 0.17 | −142.13 | 36.1% | 2.60 |
| Rule: lean against inventory | 10.09 | 18.74 | 0.54 | −22.00 | 27.7% | 0.43 |
| Rule: lean, and step back when volatile | 13.35 | 10.32 | 1.29 | −2.00 | 7.2% | 0.20 |
| Agent that sees inventory only | 0.00 | 0.04 | 0.01 | 0.00 | 0.0% | 0.00 |
| Agent that also sees volatility | 13.35 | 10.32 | 1.29 | −2.00 | 7.2% | 0.20 |

In this market the agent that sees volatility learned the same quotes as the second hand-written rule, so their results are identical. The agent that cannot see volatility learned not to trade.

### When the market changes

The rule is left as written. A new agent is trained for each market.

| Traders informed | Agent mean | Agent mean ÷ sd | Rule mean | Rule mean ÷ sd |
|---:|---:|---:|---:|---:|
| 0% | 44.34 | 2.44 | 25.62 | 1.95 |
| 10% | 35.20 | 1.92 | 22.29 | 1.81 |
| 20% | 19.20 | 1.66 | 19.20 | 1.66 |
| 30% | 16.19 | 1.50 | 16.19 | 1.50 |
| 40% | 13.35 | 1.29 | 13.35 | 1.29 |
| 50% | 10.45 | 1.10 | 10.45 | 1.10 |
| 60% | 7.41 | 0.84 | 7.41 | 0.84 |

With few informed traders the agent keeps quoting 2 ticks each side through volatile periods, where the rule steps back, and it beats the rule on both measures. From 20% upwards it arrives at the rule's quotes. A rule retuned by hand for each market could match it; the agent needs no retuning.

## How the agent learns

- **What it sees:** inventory, clipped to −6…+6, and whether the market is calm or volatile (26 situations).
- **What it chooses:** a bid distance and an ask distance, each 1, 2 or 3 ticks from the reference price (9 quotes).
- **Score:** the profit on each fill against the new true value, minus 0.2 × inventory². The change in value of inventory already held is left out of the score: it averages zero whatever the agent does and only adds noise. Results are always measured on full profit and loss.
- **Training:** 20,000 episodes of 200 steps. Random quoting falls from 100% to 2% of steps. The learning rate falls from 0.02.

## Limits

This is a simulation. It uses no market data and the results are in ticks, not money. There is one instrument, one-lot orders, and dealers that never change their quotes. Quotes are replaced every step, so a place in the queue does not carry over. The agent is told whether the market is calm or volatile; a real trader would have to estimate that. The inventory penalty is a chosen number. A smaller penalty gives an agent that earns more and takes more risk than the rule.
