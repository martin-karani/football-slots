use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::config::{Config, PAYMENT_CURRENCY};
use crate::domain::models::errors::{DomainError, DomainResult};
use crate::domain::models::payment::{PaymentProvider, PaymentTransaction};
use crate::ports::payments::{PaymentProviderPort, ProviderEvent, ProviderSubmission, TxLookup};
use crate::ports::repositories::{PaymentRepository, SettlementOutcome, UserRepository, WalletRepository};

/// PaymentGateway — orchestrates deposits, withdrawals, and webhook processing.
///
/// All business decisions live here: validation, limits, idempotency, amount
/// verification, lookup resolution. The adapters do outbound HTTP; the
/// repository executes atomic settlement.
pub struct PaymentGateway {
    payment_repo: Arc<dyn PaymentRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
    user_repo: Arc<dyn UserRepository>,
    adapters: HashMap<PaymentProvider, Arc<dyn PaymentProviderPort>>,
    config: Config,
}

impl PaymentGateway {
    pub fn new(
        payment_repo: Arc<dyn PaymentRepository>,
        wallet_repo: Arc<dyn WalletRepository>,
        user_repo: Arc<dyn UserRepository>,
        adapters: HashMap<PaymentProvider, Arc<dyn PaymentProviderPort>>,
        config: Config,
    ) -> Self {
        Self {
            payment_repo,
            wallet_repo,
            user_repo,
            adapters,
            config,
        }
    }

    fn adapter(&self, provider: PaymentProvider) -> DomainResult<&Arc<dyn PaymentProviderPort>> {
        self.adapters
            .get(&provider)
            .ok_or_else(|| DomainError::ProviderNotEnabled(provider.as_str().to_string()))
    }

    /// Generate a request fingerprint for idempotency validation.
    fn request_fingerprint(provider: &str, direction: &str, amount_minor: i64, currency: &str, phone: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(format!("{provider}:{direction}:{amount_minor}:{currency}:{phone}").as_bytes());
        hex::encode(h.finalize())
    }

    /// Check idempotency key against existing transaction.
    async fn check_idempotency(
        &self,
        user_id: Uuid,
        idempotency_key: &Option<String>,
        provider: &str,
        direction: &str,
        amount_minor: i64,
        currency: &str,
        phone: &str,
    ) -> DomainResult<Option<PaymentTransaction>> {
        if let Some(key) = idempotency_key {
            if let Some(existing) = self.payment_repo.find_by_idempotency_key(user_id, key).await? {
                let expected = Self::request_fingerprint(provider, direction, amount_minor, currency, phone);
                if existing.request_fingerprint.as_deref() == Some(expected.as_str()) {
                    return Ok(Some(existing)); // true idempotent replay
                }
                return Err(DomainError::IdempotencyConflict); // same key, different request
            }
        }
        Ok(None)
    }

    // ============================================================
    // Deposit
    // ============================================================

    pub async fn deposit(
        &self,
        user_id: Uuid,
        provider: PaymentProvider,
        phone: &str,
        amount_minor: i64,
        idempotency_key: Option<String>,
    ) -> DomainResult<PaymentTransaction> {
        if amount_minor <= 0 {
            return Err(DomainError::Validation("Amount must be positive".into()));
        }

        let adapter = self.adapter(provider)?.clone();

        let user = self.user_repo.find_by_id(user_id).await?.ok_or(DomainError::UserNotFound)?;
        user.can_deposit(chrono::Utc::now())?;

        // Idempotency check
        if let Some(existing) = self.check_idempotency(
            user_id, &idempotency_key, provider.as_str(), "deposit", amount_minor, PAYMENT_CURRENCY, phone,
        ).await? {
            return Ok(existing);
        }

        // Daily deposit limit
        let daily_limit = user.daily_deposit_limit_minor
            .unwrap_or(self.config.payments.daily_deposit_limit_minor);
        let deposited_today = self.wallet_repo.get_today_deposits(user_id).await.unwrap_or(0);
        if deposited_today + amount_minor > daily_limit {
            return Err(DomainError::DepositLimitExceeded { limit_minor: daily_limit });
        }

        let fp = Self::request_fingerprint(provider.as_str(), "deposit", amount_minor, PAYMENT_CURRENCY, phone);
        let pending = PaymentTransaction {
            id: Uuid::new_v4(),
            user_id,
            provider: provider.as_str().to_string(),
            direction: "deposit".to_string(),
            status: "pending".to_string(),
            currency: PAYMENT_CURRENCY.to_string(),
            amount_minor,
            phone_number: phone.to_string(),
            client_idempotency_key: idempotency_key,
            request_fingerprint: Some(fp),
            provider_checkout_id: None,
            provider_merchant_id: None,
            provider_receipt: None,
            provider_conversation_id: None,
            provider_reference: None,
            result_code: None,
            result_desc: None,
            raw_callback: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let saved = self.payment_repo.create_deposit_pending(&pending).await?;

        match adapter.initiate_deposit(&saved).await {
            ProviderSubmission::Accepted(init) => {
                self.payment_repo.set_provider_checkout_ids(
                    saved.id, init.provider_checkout_id, init.provider_merchant_id,
                ).await.ok();
                Ok(saved)
            }
            ProviderSubmission::Rejected(reason) => {
                self.payment_repo.fail_deposit(saved.id, None, Some(reason.clone()), None).await.ok();
                Err(DomainError::ProviderRejected(reason))
            }
            ProviderSubmission::Unknown(reason) => {
                tracing::warn!(
                    "Deposit submission ambiguous for tx={}: {} — left pending for reconciliation",
                    saved.id, reason
                );
                Ok(saved)
            }
        }
    }

    // ============================================================
    // Withdrawal
    // ============================================================

    pub async fn withdraw(
        &self,
        user_id: Uuid,
        provider: PaymentProvider,
        phone: &str,
        amount_minor: i64,
        idempotency_key: Option<String>,
    ) -> DomainResult<PaymentTransaction> {
        let adapter = self.adapter(provider)?.clone();

        let user = self.user_repo.find_by_id(user_id).await?.ok_or(DomainError::UserNotFound)?;
        let norm_user_phone = crate::adapters::payments::mpesa::MpesaAdapter::normalize_phone(&user.phone_number);
        let norm_req_phone = crate::adapters::payments::mpesa::MpesaAdapter::normalize_phone(phone);
        if norm_user_phone != norm_req_phone {
            return Err(DomainError::WithdrawalPhoneMismatch);
        }
        user.can_withdraw(chrono::Utc::now())?;

        // Idempotency check
        if let Some(existing) = self.check_idempotency(
            user_id, &idempotency_key, provider.as_str(), "withdrawal", amount_minor, PAYMENT_CURRENCY, &norm_req_phone,
        ).await? {
            return Ok(existing);
        }

        // Limits
        if amount_minor <= 0 || amount_minor < self.config.payments.min_withdrawal_minor {
            return Err(DomainError::MinimumWithdrawalNotMet {
                minimum_minor: self.config.payments.min_withdrawal_minor,
            });
        }
        if amount_minor > self.config.payments.max_withdrawal_minor {
            return Err(DomainError::MaximumWithdrawalExceeded {
                maximum_minor: self.config.payments.max_withdrawal_minor,
            });
        }

        let daily_limit = user.daily_withdrawal_limit_minor
            .unwrap_or(self.config.payments.daily_withdrawal_limit_minor);
        let already_withdrawn_today = self.wallet_repo.get_today_withdrawals(user_id).await?;
        if already_withdrawn_today + amount_minor > daily_limit {
            return Err(DomainError::WithdrawalLimitExceeded { limit_minor: daily_limit });
        }

        // Gateway mints the payout idempotency key up front.
        let conversation_id = Uuid::new_v4().to_string();
        let fp = Self::request_fingerprint(provider.as_str(), "withdrawal", amount_minor, PAYMENT_CURRENCY, &norm_req_phone);

        let tx = PaymentTransaction {
            id: Uuid::new_v4(),
            user_id,
            provider: provider.as_str().to_string(),
            direction: "withdrawal".to_string(),
            status: "processing".to_string(),
            currency: PAYMENT_CURRENCY.to_string(),
            amount_minor,
            phone_number: norm_req_phone,
            client_idempotency_key: idempotency_key,
            request_fingerprint: Some(fp),
            provider_checkout_id: None,
            provider_merchant_id: None,
            provider_receipt: None,
            provider_conversation_id: Some(conversation_id),
            provider_reference: None,
            result_code: None,
            result_desc: None,
            raw_callback: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        // FIX #2: single atomic transaction — INSERT(processing) + debit + ledger.
        let saved = self.payment_repo.create_withdrawal_and_hold(&tx).await?;

        match adapter.initiate_withdrawal(&saved).await {
            ProviderSubmission::Accepted(_) => Ok(saved),
            ProviderSubmission::Rejected(reason) => {
                // Definitive rejection — give held funds back.
                self.payment_repo.reverse_withdrawal(saved.id, None, Some(reason.clone()), None).await.ok();
                Err(DomainError::ProviderRejected(reason))
            }
            ProviderSubmission::Unknown(reason) => {
                // FIX #1: NEVER reverse on ambiguous/network error.
                tracing::warn!(
                    "Withdrawal submission ambiguous for tx={}: {} — left processing for reconciliation",
                    saved.id, reason
                );
                Ok(saved)
            }
        }
    }

    // ============================================================
    // Webhook processing
    // ============================================================

    pub async fn handle_webhook(
        &self,
        provider: PaymentProvider,
        webhook: &str,
        payload: serde_json::Value,
        event_id: Uuid,
    ) -> DomainResult<()> {
        let adapter = self.adapter(provider)?.clone();

        let Some(event) = adapter.process_webhook(webhook, payload.clone()).await? else {
            // Internal webhook (Account Balance, B2B) — already handled
            self.payment_repo.update_webhook_event(
                event_id, None, None, None, "processed", None,
            ).await?;
            return Ok(());
        };

        self.apply_event(provider, &event, event_id).await
    }

    async fn apply_event(
        &self,
        provider: PaymentProvider,
        event: &ProviderEvent,
        event_id: Uuid,
    ) -> DomainResult<()> {
        let provider_str = provider.as_str();

        match event {
            ProviderEvent::DepositSucceeded { lookup, user_id, amount_minor, receipt, reference, masked_msisdn, raw } => {
                // #region debug-point H1+H5:deposit-event-entry
                tracing::info!(
                    debug_session = "mpesa-deposit-balance",
                    hypothesis = "H1,H5",
                    location = "payment_gateway.rs:apply_event:deposit_succeeded",
                    event_lookup = ?lookup,
                    event_amount_minor = %amount_minor,
                    event_receipt = ?receipt,
                    msg = "[DEBUG] DepositSucceeded event received at gateway"
                );
                // #endregion

                match lookup {
                    TxLookup::Checkout(checkout_id) => {
                        let tx = self.payment_repo.find_by_checkout_id(provider_str, checkout_id).await?
                            .ok_or_else(|| DomainError::Payment("Checkout deposit not found".into()))?;

                        // #region debug-point H5:checkout-lookup-result
                        tracing::info!(
                            debug_session = "mpesa-deposit-balance",
                            hypothesis = "H5",
                            location = "payment_gateway.rs:apply_event:checkout_lookup",
                            checkout_id = %checkout_id,
                            tx_found = true,
                            tx_id = %tx.id,
                            tx_user_id = %tx.user_id,
                            tx_status = %tx.status,
                            tx_amount_minor_stored = %tx.amount_minor,
                            tx_provider_checkout_id = ?tx.provider_checkout_id,
                            msg = "[DEBUG] Checkout lookup found transaction"
                        );
                        // #endregion

                        // Amount verification
                        if *amount_minor != tx.amount_minor {
                            // #region debug-point H1:amount-mismatch-triggered
                            tracing::error!(
                                debug_session = "mpesa-deposit-balance",
                                hypothesis = "H1",
                                location = "payment_gateway.rs:apply_event:amount_check",
                                checkout_id = %checkout_id,
                                event_amount_minor = %amount_minor,
                                tx_amount_minor = %tx.amount_minor,
                                delta = %(*amount_minor as i128 - tx.amount_minor as i128),
                                msg = "[DEBUG] AMOUNT MISMATCH triggered — settlement ABORTED"
                            );
                            // #endregion
                            return Err(DomainError::AmountMismatch {
                                provider: *amount_minor,
                                expected: tx.amount_minor,
                            });
                        }

                        // #region debug-point H1:amount-match-ok
                        tracing::info!(
                            debug_session = "mpesa-deposit-balance",
                            hypothesis = "H1",
                            location = "payment_gateway.rs:apply_event:amount_match",
                            checkout_id = %checkout_id,
                            amount_minor = %amount_minor,
                            msg = "[DEBUG] Amount verification passed — proceeding to settlement"
                        );
                        // #endregion

                        let settlement = self.payment_repo.complete_checkout_deposit(
                            tx.id, receipt.clone(), None, Some(raw.clone()),
                        ).await;

                        // #region debug-point H5:settlement-result
                        tracing::info!(
                            debug_session = "mpesa-deposit-balance",
                            hypothesis = "H5",
                            location = "payment_gateway.rs:apply_event:settlement_result",
                            checkout_id = %checkout_id,
                            tx_id = %tx.id,
                            settlement_outcome = ?settlement.as_ref().map(|s| format!("{:?}", s)),
                            settlement_err = ?settlement.as_ref().err(),
                            msg = "[DEBUG] complete_checkout_deposit settlement result"
                        );
                        // #endregion

                        match settlement? {
                            SettlementOutcome::Applied { .. } => {
                                self.payment_repo.update_webhook_event(
                                    event_id, Some(tx.id), Some(checkout_id.clone()),
                                    Some("deposit_success".to_string()), "processed", None,
                                ).await?;
                            }
                            SettlementOutcome::AlreadySettled => {
                                self.payment_repo.update_webhook_event(
                                    event_id, Some(tx.id), Some(checkout_id.clone()),
                                    Some("deposit_success".to_string()), "ignored", None,
                                ).await?;
                            }
                            SettlementOutcome::InvalidState => {
                                tracing::warn!("Deposit checkout {} in unexpected state", tx.id);
                                self.payment_repo.update_webhook_event(
                                    event_id, Some(tx.id), Some(checkout_id.clone()),
                                    Some("deposit_success".to_string()), "failed",
                                    Some("InvalidState".to_string()),
                                ).await?;
                            }
                        }
                    }
                    TxLookup::Receipt(receipt_str) => {
                        // Manual/unsolicited deposit
                        if let Some(uid) = user_id {
                            match self.payment_repo.complete_manual_deposit(
                                *uid, provider_str, *amount_minor, PAYMENT_CURRENCY,
                                receipt_str, reference.as_deref(), Some(raw.clone()),
                            ).await? {
                                SettlementOutcome::Applied { .. } => {
                                    self.payment_repo.update_webhook_event(
                                        event_id, None, Some(receipt_str.clone()),
                                        Some("manual_deposit".to_string()), "processed", None,
                                    ).await?;
                                }
                                SettlementOutcome::AlreadySettled => {
                                    self.payment_repo.update_webhook_event(
                                        event_id, None, Some(receipt_str.clone()),
                                        Some("manual_deposit".to_string()), "ignored", None,
                                    ).await?;
                                }
                                _ => {}
                            }
                        } else {
                            // Quarantine
                            self.payment_repo.record_unmatched_deposit(
                                provider_str, receipt_str, reference.as_deref(),
                                masked_msisdn.as_deref(), PAYMENT_CURRENCY, *amount_minor, raw.clone(),
                            ).await?;

                            self.payment_repo.update_webhook_event(
                                event_id, None, Some(receipt_str.clone()),
                                Some("unmatched_deposit".to_string()), "processed", None,
                            ).await?;

                            tracing::error!(
                                "Unmatched deposit quarantined: receipt={} amount={} provider={}",
                                receipt_str, amount_minor, provider_str
                            );
                        }
                    }
                    TxLookup::Conversation(_) => {
                        // Unexpected for deposit
                        self.payment_repo.update_webhook_event(
                            event_id, None, None, None, "failed",
                            Some("Conversation lookup for deposit".to_string()),
                        ).await?;
                    }
                }
            }
            ProviderEvent::DepositFailed { lookup, result_code, result_desc, raw } => {
                match lookup {
                    TxLookup::Checkout(checkout_id) => {
                        let tx = self.payment_repo.find_by_checkout_id(provider_str, checkout_id).await?
                            .ok_or_else(|| DomainError::Payment("Checkout deposit not found".into()))?;

                        match self.payment_repo.fail_deposit(
                            tx.id, *result_code, result_desc.clone(), Some(raw.clone()),
                        ).await? {
                            SettlementOutcome::Applied { .. } | SettlementOutcome::AlreadySettled => {
                                self.payment_repo.update_webhook_event(
                                    event_id, Some(tx.id), Some(checkout_id.clone()),
                                    Some("deposit_failed".to_string()), "processed", None,
                                ).await?;
                            }
                            SettlementOutcome::InvalidState => {
                                self.payment_repo.update_webhook_event(
                                    event_id, Some(tx.id), Some(checkout_id.clone()),
                                    Some("deposit_failed".to_string()), "failed",
                                    Some("InvalidState".to_string()),
                                ).await?;
                            }
                        }
                    }
                    _ => {
                        self.payment_repo.update_webhook_event(
                            event_id, None, None, None, "ignored", None,
                        ).await?;
                    }
                }
            }
            ProviderEvent::WithdrawalSucceeded { lookup, receipt, raw } => {
                let TxLookup::Conversation(conversation_id) = lookup else {
                    self.payment_repo.update_webhook_event(
                        event_id, None, None, None, "failed",
                        Some("Expected Conversation lookup for withdrawal".to_string()),
                    ).await?;
                    return Ok(());
                };

                let tx = self.payment_repo.find_by_conversation_id(provider_str, conversation_id).await?
                    .ok_or_else(|| DomainError::Payment("Withdrawal not found by conversation_id".into()))?;

                match self.payment_repo.complete_withdrawal(
                    tx.id, receipt.clone(), None, Some(raw.clone()),
                ).await? {
                    SettlementOutcome::Applied { .. } => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_success".to_string()), "processed", None,
                        ).await?;
                    }
                    SettlementOutcome::AlreadySettled => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_success".to_string()), "ignored", None,
                        ).await?;
                    }
                    SettlementOutcome::InvalidState => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_success".to_string()), "failed",
                            Some("InvalidState".to_string()),
                        ).await?;
                    }
                }
            }
            ProviderEvent::WithdrawalFailed { lookup, result_code, result_desc, raw } => {
                let TxLookup::Conversation(conversation_id) = lookup else {
                    self.payment_repo.update_webhook_event(
                        event_id, None, None, None, "failed",
                        Some("Expected Conversation lookup for withdrawal failure".to_string()),
                    ).await?;
                    return Ok(());
                };

                let tx = self.payment_repo.find_by_conversation_id(provider_str, conversation_id).await?
                    .ok_or_else(|| DomainError::Payment("Withdrawal not found by conversation_id".into()))?;

                match self.payment_repo.reverse_withdrawal(
                    tx.id, *result_code, result_desc.clone(), Some(raw.clone()),
                ).await? {
                    SettlementOutcome::Applied { .. } => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_failed".to_string()), "processed", None,
                        ).await?;
                    }
                    SettlementOutcome::AlreadySettled => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_failed".to_string()), "ignored", None,
                        ).await?;
                    }
                    SettlementOutcome::InvalidState => {
                        self.payment_repo.update_webhook_event(
                            event_id, Some(tx.id), Some(conversation_id.clone()),
                            Some("withdrawal_failed".to_string()), "failed",
                            Some("InvalidState".to_string()),
                        ).await?;
                    }
                }
            }
        }

        Ok(())
    }
}
