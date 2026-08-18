use async_trait::async_trait;
use lettre::Transport;
use secrecy::ExposeSecret;

use crate::config::SmtpConfig;
use crate::domain::models::errors::{DomainError, DomainResult};
use crate::ports::notifications::{EmailGatewayPort, OutboundEmail};

/// SMTP email gateway adapter.
pub struct SmtpMailer {
    config: SmtpConfig,
}

impl SmtpMailer {
    pub fn new(config: SmtpConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl EmailGatewayPort for SmtpMailer {
    async fn send_email(&self, email: OutboundEmail) -> DomainResult<()> {
        

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

        let mailer = if self.config.username.is_empty() && !self.config.use_tls {
            let mut builder = lettre::transport::smtp::SmtpTransport::builder_dangerous(
                self.config.host.as_str(),
            );
            builder = builder.port(self.config.port);
            builder.build()
        } else {
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

        
        Ok(())
    }
}
