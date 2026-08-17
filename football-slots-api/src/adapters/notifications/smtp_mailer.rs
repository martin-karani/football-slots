use async_trait::async_trait;
use lettre::Transport;
use secrecy::ExposeSecret;

use crate::config::SmtpConfig;
use crate::domain::models::errors::{DomainError, DomainResult};
use crate::ports::notifications::{EmailGatewayPort, OutboundEmail};

/// SMTP email gateway adapter.
///
/// Connects to whatever `SMTP_HOST` says. In dev that's Buggregator's fake
/// SMTP catcher (no auth, no TLS); in prod it's a real relay with STARTTLS.
pub struct SmtpMailer {
    config: SmtpConfig,
}

impl SmtpMailer {
    pub fn new(config: SmtpConfig) -> Self {
        tracing::info!(
            host = %config.host,
            port = config.port,
            use_tls = config.use_tls,
            has_auth = !config.username.is_empty(),
            "SMTP mailer initialized"
        );
        Self { config }
    }
}

#[async_trait]
impl EmailGatewayPort for SmtpMailer {
    async fn send_email(&self, email: OutboundEmail) -> DomainResult<()> {
        tracing::info!(
            to = %email.to,
            subject = %email.subject,
            "Sending email via SMTP"
        );

        // Build the email message
        let email_message = lettre::Message::builder()
            .from(
                format!("{} <{}>", self.config.from_name, self.config.from_address)
                    .parse()
                    .map_err(|e| {
                        DomainError::Repository(anyhow::anyhow!("Invalid from_address: {e}"))
                    })?,
            )
            .to(email.to.parse().map_err(|e| {
                DomainError::Repository(anyhow::anyhow!("Invalid to address: {e}"))
            })?)
            .subject(&email.subject)
            .body(email.html_body)
            .map_err(|e| {
                DomainError::Repository(anyhow::anyhow!("Failed to build email: {e}"))
            })?;

        // Build the async transport (lettre 0.11 API)
        let mailer = if self.config.username.is_empty() && !self.config.use_tls {
            // Dev mode: direct unencrypted connection (Buggregator)
            let mut builder = lettre::transport::smtp::SmtpTransport::builder_dangerous(
                self.config.host.as_str(),
            );
            builder = builder.port(self.config.port);
            builder.build()
        } else {
            // Prod mode: relay with STARTTLS + credentials
            let mut builder = lettre::transport::smtp::SmtpTransport::relay(
                &self.config.host,
            ).map_err(|e| {
                DomainError::Repository(anyhow::anyhow!("Invalid relay host: {e}"))
            })?;
            builder = builder.port(self.config.port);
            let creds = lettre::transport::smtp::authentication::Credentials::new(
                self.config.username.clone(),
                self.config.password.expose_secret().clone(),
            );
            builder = builder.credentials(creds);
            builder.build()
        };

        // Send the email on a blocking thread (lettre sync transport)
        let email_clone = email_message.clone();
        let mailer_clone = mailer.clone();
        tokio::task::spawn_blocking(move || {
            mailer_clone.send(&email_clone)
        })
        .await
        .map_err(|e| DomainError::Repository(anyhow::anyhow!("SMTP send task panicked: {e}")))?
        .map_err(|e| {
            tracing::error!(error = %e, "SMTP send failed");
            DomainError::Repository(anyhow::anyhow!("SMTP send failed: {e}"))
        })?;

        tracing::info!(to = %email.to, "Email sent successfully");
        Ok(())
    }
}
