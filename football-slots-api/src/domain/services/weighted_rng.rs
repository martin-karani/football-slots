use rand::Rng;
use crate::domain::models::game::Symbol;

pub struct WeightedRng;

impl WeightedRng {
    /// Returns (Symbol, Payout_Multiplier) based on hidden weights.
    /// RTP is pre-calculated at ~95% to guarantee profitability.
    ///
    /// Weight distribution:
    /// - 80%: Common symbols (x5) → Barcelona, Real Madrid, Man City, Liverpool
    /// - 15%: Mid symbols (x10-30 random) → Chelsea, Arsenal, BayernMunchen
    /// -  5%: Jackpot (x120) → UCL Trophy
    pub fn weighted_spin() -> (Symbol, u16) {
        let mut rng = rand::thread_rng();
        let roll = rng.gen_range(0..100);

        if roll < 5 {
            return (Symbol::UclTrophy, 120);
        } else if roll < 20 {
            let multiplier = rng.gen_range(10..=30);
            let mid_symbols = [Symbol::BayernMunchen, Symbol::Chelsea, Symbol::Arsenal];
            let idx = rng.gen_range(0..mid_symbols.len());
            return (mid_symbols[idx], multiplier);
        } else {
            let common_symbols = [
                Symbol::Barcelona,
                Symbol::RealMadrid,
                Symbol::ManCity,
                Symbol::Liverpool,
            ];
            let idx = rng.gen_range(0..common_symbols.len());
            return (common_symbols[idx], 5);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_symbol_reasonable_distribution() {
        let mut common = 0u32;
        let mut mid = 0u32;
        let mut jackpot = 0u32;

        for _ in 0..10_000 {
            let (sym, mult) = WeightedRng::weighted_spin();
            match sym {
                Symbol::UclTrophy => {
                    assert_eq!(mult, 120);
                    jackpot += 1;
                }
                Symbol::BayernMunchen | Symbol::Chelsea | Symbol::Arsenal => {
                    assert!((10..=30).contains(&mult), "mid multiplier out of range: {}", mult);
                    mid += 1;
                }
                _ => {
                    assert_eq!(mult, 5);
                    common += 1;
                }
            }
        }

        assert!(common > 7500, "Expected ~80% common, got {}", common);
        assert!(mid >= 1000 && mid <= 2000, "Expected ~15% mid, got {}", mid);
        assert!(jackpot >= 200 && jackpot <= 800, "Expected ~5% jackpot, got {}", jackpot);
    }
}
