# 🏈 Football Slots

A football-themed slot machine game platform with virtual and real-money wagering support.

## Project Structure

```
football-shots/
├── football-slots-api/     # Rust/Axum backend (PostgreSQL)
│   ├── src/
│   │   ├── domain/         # Business logic & models
│   │   ├── ports/          # Trait definitions
│   │   └── adapters/       # PostgreSQL, HTTP, M-Pesa
│   ├── migrations/         # SQL migrations
│   └── Cargo.toml
│
└── football-slots-mobile/  # React Native frontend (Expo)
    └── src/
        ├── screens/        # Game, Login, Wallet screens
        ├── components/     # Wheel, Betting panel, Gamble modal
        ├── hooks/          # useGame, useWallet
        └── store/          # Zustand game state
```

## Quick Start

### Backend

```bash
# 1. Start PostgreSQL database with Docker
docker compose up -d

# 2. Enter backend directory & configure environment
cd football-slots-api
cp .env.example .env  # Configure DATABASE_URL, JWT_SECRET, M-Pesa credentials

# 3. Run the server
cargo run
```

### Frontend

```bash
cd football-slots-mobile
npm install
npx expo start
```

## Architecture

### Backend (Rust/Axum + PostgreSQL)

- **Clean Architecture**: domain → ports → adapters
- **Dual ledgers**: Virtual and real money wallets, never merged
- **Provably fair RNG**: HMAC-SHA256 with commit-reveal seed scheme
- **M-Pesa integration**: Daraja STK Push for deposits
- **Phone-first auth**: Passwordless OTP login

### Frontend (React Native + Expo)

- **Zustand** for game state management
- **Axios** for API communication
- **Expo SecureStore** for JWT token persistence
- Mobile-first responsive UI

## Game Mechanics

- **14-position wheel** with 8 football symbols
- Fixed x5 (Whistle) through x120 (Captain's Armband)
- **Home/Away gamble** for post-win double-or-nothing
- Supports both virtual (free) and real-money play

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust, Axum 0.7, SQLx 0.7 |
| Database | PostgreSQL 14+ |
| Frontend | React Native, Expo, Zustand |
| Payments | M-Pesa Daraja API |
| Auth | JWT, OTP (SMS) |

## Documentation

- [Backend API Docs](football-slots-api/README.md)
- [Frontend Setup](football-slots-mobile/README.md)

## License

Proprietary. All rights reserved.
