# Football Slots — Paytable Mathematical Integrity Analysis

## Executive Summary

**Verdict: The game is exploit-proof. Neither betting strategy can overcome the 4.762% house edge.**

The Football Slots game engine uses a "Flat Equal-EV" paytable design where every symbol has identical Expected Value per unit staked. This was confirmed by analyzing the source code in `game.rs` and `weighted_rng.rs`, and verified through analytic proof and a 5-million-spin Monte Carlo simulation.

| Metric | Strategy 1 (4 Common) | Strategy 2 (Rare + Jackpot) |
|--------|----------------------|----------------------------|
| Hit rate | 76.19% | 4.76% |
| RTP | 95.238% | 95.238% |
| House edge | 4.762% | 4.762% |
| EV per unit staked | −0.047619 | −0.047619 |
| Std dev per spin | 2.13 | 10.74 |

---

## 1. The Paytable

Source: `football-slots-api/src/domain/models/game.rs` — `PAYTABLE_V1`

| Symbol | Multiplier | Tier | P(hit) | Avg spins between hits |
|--------|-----------|------|--------|----------------------|
| Barcelona | x5 | common | 19.048% | 5.2 |
| Real Madrid | x5 | common | 19.048% | 5.2 |
| Man City | x5 | common | 19.048% | 5.2 |
| Liverpool | x5 | common | 19.048% | 5.2 |
| Paris SG | x10 | mid | 9.524% | 10.5 |
| Arsenal | x10 | mid | 9.524% | 10.5 |
| Bayern Munchen | x25 | rare | 3.810% | 26.3 |
| UCL Trophy | x100 | jackpot | 0.952% | 105.0 |

**Key**: The wheel has 24 positions (7×7 perimeter), but the wheel layout is **purely visual**. The actual probabilities are determined by the weighted RNG in `weighted_rng.rs`, which assigns `weight = RTP / multiplier` to each symbol.

---

## 2. The RTP Formula

Source: `weighted_rng.rs` — `WeightedRng::implied_rtp()`

```rust
pub fn implied_rtp(paytable: &Paytable) -> f64 {
    let sum_inverse: f64 = paytable.iter().map(|(_, m)| 1.0 / *m as f64).sum();
    1.0 / sum_inverse
}
```

The RTP is **derived** from the multipliers, never hardcoded:

$$\text{RTP} = \frac{1}{\sum_{i=1}^{8} \frac{1}{m_i}} = \frac{1}{\frac{4}{5} + \frac{2}{10} + \frac{1}{25} + \frac{1}{100}} = \frac{1}{1.05} = \frac{20}{21} \approx 95.238\%$$

Each symbol's win probability is set so that `P(symbol) × multiplier(symbol) = RTP`:

$$P_i = \frac{\text{RTP}}{m_i}$$

This is the **Flat Equal-EV property**: every symbol has identical expected value per unit staked.

---

## 3. Anti-Exploit Proof

### Theorem

For any subset S ⊆ {all 8 symbols} where a player bets 1 unit on each symbol in S, the RTP is exactly 95.238% regardless of which symbols are chosen.

### Proof

$$\text{RTP}(S) = \frac{\sum_{i \in S} P(i) \times m_i}{|S|} = \frac{\sum_{i \in S} \frac{\text{RTP}}{m_i} \times m_i}{|S|} = \frac{\sum_{i \in S} \text{RTP}}{|S|} = \frac{|S| \times \text{RTP}}{|S|} = \text{RTP}$$

**Q.E.D.** Every symbol contributes exactly RTP to the numerator. The multiplier cancels with the probability's denominator. The subset size cancels out. The result is always RTP = 95.238%.

### Code Evidence

This is enforced in `weighted_rng.rs`:

```rust
pub fn weight_table(paytable: &Paytable) -> [WeightedEntry; 8] {
    let rtp = Self::implied_rtp(paytable);
    // ...
    weight: rtp / *multiplier as f64,  // Equal-EV assignment
}
```

The test `no_single_symbol_beats_the_others` (400K spins per symbol) verifies that no single symbol's realized RTP deviates more than 5% from the target.

---

## 4. Strategy 1: High-Frequency / Low-Variance

**Setup**: Bet 1 unit on each of the 4 common symbols (Barcelona, Real Madrid, Man City, Liverpool). Total stake = 4 units per spin.

### Analytics

- **Hit rate**: P(any common) = 4 × (RTP/5) = 4 × 0.047619 = **76.19%**
- **When hit**: gross = 1 × 5 = 5, net = 5 − 4 = **+1 unit** (76.19% of spins)
- **When miss**: gross = 0, net = 0 − 4 = **−4 units** (23.81% of spins)

### Expected Value

$$\text{EV} = 0.7619 \times (+1) + 0.2381 \times (-4) = 0.7619 - 0.9524 = \mathbf{-0.190476 \text{ units/spin}}$$

$$\text{RTP} = \frac{4 \times \text{RTP}}{4} = \text{RTP} = 95.238\%$$

### Simulation Results (5,000,000 spins)

- Total staked: 20,000,000 units
- Total payout: 19,050,710 units
- Net loss: **−949,290 units** (realized RTP: 95.25%)
- Max losing streak: 10 consecutive losses (−40 units)
- Std dev per spin: 2.13 units

### Psychological Effect

This strategy creates the illusion of profitability. The player wins 76% of rounds, which feels like "winning a lot." But each win only recovers 25% of the total stake, while each loss wipes 100%. The bankroll bleeds slowly and steadily — "death by a thousand cuts." The smooth, predictable decline is visible in the bankroll trajectory chart.

---

## 5. Strategy 2: Low-Frequency / High-Variance

**Setup**: Bet 1 unit on Bayern (x25) and UCL Trophy (x100). Total stake = 2 units per spin.

### Analytics

- **Hit rate**: P(bayern) + P(trophy) = RTP/25 + RTP/100 = 0.038095 + 0.009524 = **4.76%**
- **Bayern hit**: gross = 25, net = **+23 units** (3.81% of spins)
- **Trophy hit**: gross = 100, net = **+98 units** (0.95% of spins)
- **Miss**: gross = 0, net = **−2 units** (95.24% of spins)

### Expected Value

$$\text{EV} = 0.038095 \times 23 + 0.009524 \times 98 + 0.952381 \times (-2) = 0.876 + 0.933 - 1.905 = \mathbf{-0.095238 \text{ units/spin}}$$

$$\text{RTP} = \frac{2 \times \text{RTP}}{2} = \text{RTP} = 95.238\%$$

### Simulation Results (5,000,000 spins)

- Total staked: 10,000,000 units
- Total payout: 9,513,000 units
- Net loss: **−487,000 units** (realized RTP: 95.13%)
- Max losing streak: **288 consecutive losses** (−576 units)
- Std dev per spin: 10.74 units

### Psychological Effect

This strategy creates dramatic swings. The player loses 95% of the time, but occasionally wins big (+23 or +98 units). The massive payouts feel life-changing in the moment, creating the illusion that "one big hit will make it all back." But the big hits are precisely calibrated to keep RTP at 95.238%. The bankroll trajectory is extremely volatile — large spikes upward followed by long grinding losses.

---

## 6. Volatility vs Expected Value

### Volatility (Session Feel)

| Aspect | Strategy 1 | Strategy 2 |
|--------|-----------|-----------|
| Hit frequency | 76.2% | 4.8% |
| Typical outcome | +1 unit (small win) | −2 units (small loss) |
| Big outcome | −4 units (loss) | +98 units (jackpot) |
| Max losing streak | 10 spins | 288 spins |
| Std dev per spin | 2.13 | 10.74 |
| Coefficient of variation | 11.2 | 112.8 |
| **Feel** | "I'm winning most rounds" | "I just need one big hit" |

Strategy 2 is **5.0× more volatile** than Strategy 1. The coefficient of variation (std dev / |EV|) is 10× higher, meaning the noise-to-signal ratio is dramatically worse.

### Expected Value (Long-Term Profitability)

| Metric | Strategy 1 | Strategy 2 |
|--------|-----------|-----------|
| RTP | 95.238% | 95.238% |
| House edge | 4.762% | 4.762% |
| EV per unit staked | −0.047619 | −0.047619 |
| Loss per 1,000 units staked | 47.62 | 47.62 |

**The EV is identical.** Volatility controls how the session *feels*, but Expected Value controls the long-term outcome. In a Flat Equal-EV paytable, the house edge is baked into the RTP formula and cannot be circumvented by any combination of symbol selection.

### The Key Insight

> **Volatility is a psychological tool; Expected Value is a mathematical fact.**
>
> Strategy 1 exploits the "gambler's fallacy" — players mistake high win frequency for profitability.
> Strategy 2 exploits the "near-miss effect" — players chase the rare big win, ignoring that it's already priced into the RTP.
>
> Both strategies lose at exactly the same rate per unit staked. The difference is purely in the emotional experience of the loss.

---

## 7. Visual Evidence

See the generated charts:
- **Bankroll Trajectory** (`bankroll_trajectory.png`): Shows both strategies over 200,000 spins. Strategy 1 (green) declines smoothly and predictably. Strategy 2 (red) is extremely volatile but converges to the same loss rate.
- **Mathematical Proof** (`mathematical_proof.png`): Complete derivation of the RTP formula and anti-exploit proof.

---

## 8. Conclusion

The Football Slots game engine's Flat Equal-EV paytable is mathematically sound and exploit-proof:

1. **RTP = 95.238% for ALL betting strategies** — proven analytically and verified by Monte Carlo simulation.
2. **No subset of symbols can produce positive EV** — the anti-exploit proof shows RTP(S) = RTP for any subset S.
3. **The weighted RNG correctly implements the design** — each symbol's probability is `RTP / multiplier`, ensuring equal EV.
4. **The test suite enforces this invariant** — `no_single_symbol_beats_the_others` and `observed_frequency_matches_analytic_weight` catch any regression.
5. **The provably fair system (HMAC-SHA256 commit-reveal)** ensures the house cannot manipulate outcomes without detection.

The game is designed to be entertaining (through volatility and visual excitement) while being mathematically fair (through the Flat Equal-EV property). The 4.762% house edge is consistent across all possible betting strategies.
