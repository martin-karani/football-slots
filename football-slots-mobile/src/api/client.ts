import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AuthResponse, SpinResult, PaytableResponse, WalletBalance, LedgerEntry, GameRound, WithdrawResponse } from '../types';

// Android Emulator uses 10.0.2.2 to reach the host machine's localhost
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const API_BASE = __DEV__
  ? `http://${DEV_HOST}:3000/api/v1`
  : 'https://api.football-slots.com/api/v1';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Auth interceptor
client.interceptors.request.use(async (config) => {
  console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error interceptor – log errors but do NOT auto-delete the token.
// Token cleanup is handled explicitly by the session restore logic.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default client;

// ============================================================
// Auth API
// ============================================================

export const authApi = {
  sendOtp: (phoneNumber: string) =>
    client.post('/auth/send-otp', { phone_number: phoneNumber }),

  verifyOtp: (phoneNumber: string, code: string) =>
    client.post('/auth/verify-otp', { phone_number: phoneNumber, code }) as Promise<{ data: AuthResponse }>,

  /** Validates the stored JWT and returns the current user info. */
  me: () =>
    client.get('/auth/me') as Promise<{ data: { user_id: string; phone_number: string; kyc_status: string } }>,
};

// ============================================================
// Game API
// ============================================================

export const gameApi = {
  spin: (currency: string, bets: Record<string, number>, clientSeed: string) =>
    client.post('/game/spin', { currency, bets, client_seed: clientSeed }) as Promise<{ data: SpinResult }>,

  history: (limit = 50, offset = 0) =>
    client.get('/game/history', { params: { limit, offset } }) as Promise<{ data: { rounds: GameRound[]; total: number } }>,

  verify: (serverSeed: string, clientSeed: string, nonce: number, expectedSymbol: string, paytableVersion: number) =>
    client.post('/game/verify', {
      server_seed: serverSeed,
      client_seed: clientSeed,
      nonce,
      expected_symbol: expectedSymbol,
      paytable_version: paytableVersion,
    }),

  paytable: () =>
    client.get('/game/paytable') as Promise<{ data: PaytableResponse }>,
};

// ============================================================
// Wallet API
// ============================================================

export const walletApi = {
  balance: (currency: string) =>
    client.get('/wallet/balance', { params: { currency } }) as Promise<{ data: WalletBalance }>,

  ledger: (currency: string, limit = 20, offset = 0) =>
    client.get('/wallet/ledger', { params: { currency, limit, offset } }) as Promise<{ data: { entries: LedgerEntry[]; total: number } }>,

  topupVirtual: () =>
    client.post('/wallet/topup-virtual') as Promise<{ data: WalletBalance }>,
};

// ============================================================
// M-Pesa API
// ============================================================

export const mpesaApi = {
  deposit: (phoneNumber: string, amountMinor: number) =>
    client.post('/mpesa/deposit', { phone_number: phoneNumber, amount_minor: amountMinor }),

  withdraw: (phoneNumber: string, amountMinor: number) =>
    client.post('/mpesa/withdraw', { phone_number: phoneNumber, amount_minor: amountMinor }) as Promise<{ data: WithdrawResponse }>,
};

// ============================================================
// Auth helpers
// ============================================================

export const authStorage = {
  setToken: (token: string) => SecureStore.setItemAsync('auth_token', token),
  getToken: () => SecureStore.getItemAsync('auth_token'),
  clearToken: () => SecureStore.deleteItemAsync('auth_token'),
};
