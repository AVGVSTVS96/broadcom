//! The usage, sessions and credits views, and the live sessions: pure functions over
//! the store's events (merged, reconciled, repriced, sorted by timestamp then id) and
//! the pool's state files.

mod attribution;
mod credits;
mod identity;
mod limits;
mod live;
mod plans;
mod row;
mod schema;
mod sessions;
mod timeframe;
mod tokens;
mod view;

pub use attribution::{AgentSdk, ModelWeights, attribution_reach};
pub use credits::{ApiCredit, CreditUsage, CreditsView, credits, parse_grants};
pub use identity::{Names, Past, Who, load_names, read_past};
pub use limits::{AppendLog, Binding, LimitReading, parse_binding, parse_reading};
pub use live::{Live, LiveSession, Processes, live_map, read_processes, seats_of};
pub use plans::{ConfiguredPlan, Plan, PlanPricing, PlansView, PoolAccount, Tier, plans_of};
pub use row::Row;
pub use schema::schemas;
pub use sessions::{Amount, LimitInputs, Prepared, Session, SessionUsage, prepare, session_usage};
pub use timeframe::{Range, parse_millis};
pub use tokens::{TokensView, tokens_view};
pub use view::{
    Labels, Part, Query, UsageView, parse_query, parts_of, proxy_since, usage_view, with_live,
};

use chrono::TimeZone;
use chrono_tz::Tz;

/// The earliest event time (unix ms) `session_usage` reads for a range: its previous
/// period, and every request its limit rises are split over. Events after now count.
pub fn reads_from(r: Range, zone: Tz, now: i64, readings: &[LimitReading]) -> f64 {
    let frame = timeframe::usage_timeframe(
        r,
        zone,
        zone.timestamp_millis_opt(now)
            .single()
            .expect("one wall time"),
    );
    let previous = frame.previous_start.timestamp_millis() as f64;
    previous.min(attribution_reach(
        readings,
        frame.start.timestamp_millis() as f64,
    ))
}

/// The earliest event time (unix ms) `PlanPricing` needs to price a range: the start of
/// the calendar month its previous period begins in, since a month's rate spreads its
/// fees over all of that month's API value.
pub fn pricing_from(r: Range, zone: Tz, now: i64) -> f64 {
    let frame = timeframe::usage_timeframe(
        r,
        zone,
        zone.timestamp_millis_opt(now)
            .single()
            .expect("one wall time"),
    );
    timeframe::month_start(zone, frame.previous_start.timestamp_millis() as f64).timestamp_millis()
        as f64
}

/// Account labels: each pooled account's email, and each API-credit key named for the
/// account its credit belongs to.
pub fn account_labels(
    accounts: &[PoolAccount],
    grants: &[ApiCredit],
) -> std::collections::HashMap<String, String> {
    let mut labels: std::collections::HashMap<String, String> = accounts
        .iter()
        .filter(|a| !a.label.is_empty())
        .map(|a| (a.id.clone(), a.label.clone()))
        .collect();
    for grant in grants {
        if let Some(email) = labels
            .get(&grant.account)
            .filter(|_| !labels.contains_key(&grant.credential_id))
        {
            let label = format!("{email} API credit");
            labels.insert(grant.credential_id.clone(), label);
        }
    }
    labels
}

#[cfg(test)]
mod label_tests {
    #[test]
    fn api_credit_keys_take_their_accounts_name() {
        let account = |id: &str, label: &str| super::PoolAccount {
            id: id.into(),
            label: label.into(),
            ..Default::default()
        };
        let accounts = [
            account("acct", "me@example.com"),
            account("claude:apikey:abc", ""),
        ];
        let grants = super::parse_grants(
            br#"[{"startsAt":0,"account":"acct","organization":"Org","credentialId":"claude:apikey:abc","remaining":1,"allowance":1,"monthlyCap":1,"observedAt":0,"expiresAt":0,"renewsAt":0}]"#,
        )
        .unwrap();
        let labels = super::account_labels(&accounts, &grants);
        assert_eq!(labels["acct"], "me@example.com");
        assert_eq!(labels["claude:apikey:abc"], "me@example.com API credit");
    }
}
