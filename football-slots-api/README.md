# 🏈 Football Slots API

A provably fair, football-themed slot machine game backend built with Rust/Axum and PostgreSQL.

## Architecture

Clean Architecture with three layers:

```
domain/     — Business logic, models, services (no framework dependencies)
ports/      — Trait definitions (abstraction boundaries)
adapters/   — PostgreSQL repos, Axum HTTP handlers, M-Pesa integration
```

## Features

- **14-position wheel** with 8 football symbol types (Whistle, Boot, Glove, Jersey, Trophy, Star Player, Golden Ball, Captain's Armband)
- **Provably fair RNG** using HMAC-SHA256(server_seed, client_seed:nonce) → position 1-14
- **Dual ledgers**: Virtual and Real money wallets, never merged
- **Home/Away gamble**: Post-win double-or-nothing (1-7 vs 8-14)
- **M-Pesa Daraja STK Push** integration for real-money deposits
- **Phone-first OTP auth** (Betika-style passwordless login)
- **KYC + self-exclusion** gates for real-money play
- **Append-only wallet ledger** for full audit trail

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Rust 2021 edition |
| Web Framework | Axum 0.7 |
| Database | PostgreSQL 14+ |
| ORM | SQLx 0.7 (runtime-checked queries) |
| Async Runtime | Tokio |
| Auth | JWT (jsonwebtoken) |
| Payments | M-Pesa Daraja API |

## Quick Start

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- PostgreSQL 14+
- `sqlx-cli`: `cargo install sqlx-cli`

### Setup

```bash
# 1. Start PostgreSQL database with Docker Compose
docker compose up -d

# 2. Enter directory & configure environment
cd football-slots-api
cp .env.example .env

# 3. Run the server with auto-reload on code changes (using cargo-watch)
cargo watch -x run

# Or standard run:
# cargo run
```

The API starts on `http://0.0.0.0:3000`.

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/ready` | Readiness probe |
| GET | `/health/alive` | Liveness probe |

### Auth (Public)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/send-otp` | Request OTP code |
| POST | `/api/v1/auth/verify-otp` | Verify OTP, get JWT |

### Game (Authenticated)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/game/spin` | Place bets and spin the wheel |
| POST | `/api/v1/game/gamble` | Home/Away double-or-nothing |
| GET | `/api/v1/game/history` | Recent game rounds |
| POST | `/api/v1/game/verify` | Verify provably fair result |

### Wallet (Authenticated)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/wallet/balance?currency=virtual` | Get wallet balance |
| GET | `/api/v1/wallet/ledger?currency=virtual` | Transaction history |

### M-Pesa
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mpesa/deposit` | Initiate STK Push deposit |
| POST | `/api/v1/mpesa/callback` | M-Pesa webhook (public) |

## Game Mechanics

### Wheel Layout (14 positions)

| Position | Symbol | Multiplier | Side |
|----------|--------|-----------|------|
| 1 | Whistle | x5 | Home |
| 2 | Boot | x10 | Home |
| 3 | Glove | x15 | Home |
| 4 | Jersey | x18 | Home |
| 5 | Trophy | x20 | Home |
| 6 | Star Player | x30 | Home |
| 7 | Golden Ball | x35 | Home |
| 8 | Whistle | x5 | Away |
| 9 | Boot | x12 | Away |
| 10 | Glove | x16 | Away |
| 11 | Jersey | x20 | Away |
| 12 | Trophy | x25 | Away |
| 13 | Star Player | x35 | Away |
| 14 | Captain's Armband | x120 | Away |

### Betting

Players place bets on any of the 8 symbol types. When the wheel lands on a position:
- If the player bet on that symbol: `payout = bet_amount × position_multiplier`
- Net result = `gross_payout - total_stake`

### Home/Away Gamble

After a winning spin, players can gamble their winnings:
- Choose **Home** (1-7) or **Away** (8-14)
- A fresh 1-14 draw is made
- Correct guess: winnings doubled
- Wrong guess: winnings forfeited

### Provably Fair System

1. Server generates a random seed and publishes its SHA-256 hash **before** the spin
2. Client provides their own seed (or gets a random one)
3. Position is calculated: `HMAC-SHA256(server_seed, client_seed || nonce) % 14 + 1`
4. After 1000 spins, the server seed is revealed for verification
5. Any round can be independently verified via `/api/v1/game/verify`

## Database Schema

```
users          — Phone-based accounts with KYC status
wallets        — One row per (user, currency_type)
wallet_ledger  — Append-only transaction history
game_rounds    — One row per spin with full audit data
gamble_rounds  — Home/Away gamble records
server_seeds   — Rotating provably fair seed pool
mpesa_transactions — STK Push lifecycle tracking
otp_codes      — Ephemeral OTP storage
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing key | Required |
| `PORT` | HTTP port | 3000 |
| `HOST` | Bind address | 0.0.0.0 |
| `VIRTUAL_INITIAL_BALANCE` | Starting virtual balance (minor units) | 100000 |
| `REAL_MIN_STAKE` | Minimum real-money bet | 50 |
| `REAL_MAX_STAKE` | Maximum real-money bet | 500000 |
| `MPESA_CONSUMER_KEY` | Daraja API consumer key | — |
| `MPESA_CONSUMER_SECRET` | Daraja API consumer secret | — |
| `MPESA_PASSKEY` | Daraja passkey | — |
| `MPESA_SHORTCODE` | Paybill/Till number | 174379 |

## Testing

```bash
# Run all tests
DATABASE_URL=postgres://user@localhost/football_slots cargo test

# Run with output
DATABASE_URL=postgres://user@localhost/football_slots cargo test -- --nocapture
```

## Development Notes

- **Minor units**: All monetary values use minor units (cents) to avoid floating-point issues
- **Currency types**: `virtual` (free play), `real` (M-Pesa funded)
- **KYC gating**: Real-money play requires `kyc_status = 'verified'`
- **Self-exclusion**: Users can set `self_excluded_until` to block real-money play
- **No club trademarks**: Uses generic football iconography (not real club badges)

## Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Configure production M-Pesa credentials
- [ ] Set up OTP SMS service (Africa's Talking / Twilio)
- [ ] Configure production database with backups
- [ ] Set up reverse proxy (nginx/Caddy) with TLS
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerting
- [ ] Obtain gambling license for real-money operation
- [ ] Negotiate club badge licensing (if using real crests)

## License

Proprietary. All rights reserved.
