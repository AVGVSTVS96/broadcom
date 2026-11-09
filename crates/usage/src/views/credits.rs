use std::path::Path;

use serde::{Deserialize, Serialize};

use super::timeframe::parse_millis;
use crate::event::Event;

/// A free-credit grant (like the monthly API credit a Max or Ultra plan includes, which costs
/// nothing, unlike paid extra usage) and its last balance read off Console, which no API key can query.
/// Operators keep these non-secret observations in the pool state folder (credits.json).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiCredit {
    pub starts_at: i64,
    pub account: String,
    pub organization: String,
    pub credential_id: String,
    pub remaining: f64,
    pub allowance: f64,
    pub monthly_cap: f64,
    pub observed_at: i64,
    pub expires_at: i64,
    pub renews_at: i64,
}

/// The grant carried forward from its Console reading: `remaining` is that reading
/// less what the proxy priced on the credential since.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreditUsage {
    #[serde(flatten)]
    pub grant: ApiCredit,
    pub recorded: f64,
    pub proxy_usd: f64,
    pub requests: usize,
    pub unpriced: usize,
    pub last_request_at: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, schemars::JsonSchema)]
pub struct CreditsView {
    pub api: Vec<CreditUsage>,
}

const INVALID: &str = "Credit observations are invalid.";

/// The grants in credits.json; none when the file doesn't exist.
pub fn read_grants(path: &Path) -> Result<Vec<ApiCredit>, String> {
    match std::fs::read(path) {
        Ok(data) => serde_json::from_slice(&data).map_err(|_| INVALID.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(_) => Err("Credit observations could not be read.".into()),
    }
}

/// Once `renews_at` has passed (and before `expires_at`), the grant is a fresh period: the
/// allowance is back as of the renewal, unless a Console reading came after it, and `renews_at`
/// moves to the next monthly renewal, or to none when that falls at or past expiry.
fn renew(g: &mut ApiCredit, now: i64) {
    let at = |ms: i64| chrono::DateTime::from_timestamp_millis(ms);
    if g.renews_at <= 0 || g.renews_at > now || g.renews_at >= g.expires_at {
        return;
    }
    let Some(anchor) = at(g.renews_at) else {
        return;
    };
    let boundary = |k: u32| anchor.checked_add_months(chrono::Months::new(k));
    let mut k = 0;
    while let Some(next) = boundary(k + 1) {
        if next.timestamp_millis() > now || next.timestamp_millis() >= g.expires_at {
            break;
        }
        k += 1;
    }
    let Some(start) = boundary(k).map(|t| t.timestamp_millis()) else {
        return;
    };
    if g.observed_at < start {
        g.remaining = g.allowance;
        g.observed_at = start;
    }
    g.renews_at = boundary(k + 1)
        .map(|t| t.timestamp_millis())
        .filter(|next| *next < g.expires_at)
        .unwrap_or(0);
}

/// Counts only matching proxy receipts during each grant; failed requests are not
/// billed. Needs every proxy event since the earliest grant's `starts_at`. `now` is unix ms.
pub fn credits(grants: &[ApiCredit], events: &[Event], now: i64) -> Result<CreditsView, String> {
    let mut view = CreditsView::default();
    for g in grants {
        if g.account.is_empty()
            || g.organization.is_empty()
            || g.credential_id.is_empty()
            || g.starts_at <= 0
            || g.starts_at > g.observed_at
            || g.observed_at <= 0
            || g.observed_at > now
            || g.expires_at <= g.observed_at
            || g.remaining < 0.0
            || g.allowance <= 0.0
            || g.remaining > g.allowance
            || g.monthly_cap < 0.0
        {
            return Err(INVALID.into());
        }
        let mut g = g.clone();
        renew(&mut g, now);
        let mut item = CreditUsage {
            grant: g.clone(),
            recorded: g.remaining,
            proxy_usd: 0.0,
            requests: 0,
            unpriced: 0,
            last_request_at: None,
        };
        for e in events {
            let at = parse_millis(&e.timestamp);
            if !e.is_proxy()
                || e.account_id != g.credential_id
                || at.is_nan()
                || at < g.starts_at as f64
                || at >= g.expires_at as f64
                || at > now as f64
            {
                continue;
            }
            item.requests += 1;
            if e.cost_known {
                item.proxy_usd += e.cost_usd;
                if at >= g.observed_at as f64 {
                    item.grant.remaining -= e.cost_usd;
                }
            } else if !e.failed {
                item.unpriced += 1;
            }
            if item.last_request_at.is_none_or(|last| at as i64 > last) {
                item.last_request_at = Some(at as i64);
            }
        }
        item.grant.remaining = item.grant.remaining.max(0.0);
        view.api.push(item);
    }
    Ok(view)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn remaining_follows_proxy_spend_after_the_console_reading() {
        let hour = 3_600_000;
        let now = 1_800_000_000_000;
        let (start, observed) = (now - 2 * hour, now - hour);
        let grant = ApiCredit {
            account: "a".into(),
            organization: "o".into(),
            credential_id: "key".into(),
            remaining: 150.0,
            allowance: 200.0,
            monthly_cap: 200.0,
            starts_at: start,
            observed_at: observed,
            expires_at: now + hour,
            renews_at: 0,
        };
        let at = |ms: i64| {
            chrono::DateTime::from_timestamp_millis(ms)
                .unwrap()
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        };
        let proxy = |ms: i64, cost: f64, known: bool, failed: bool| Event {
            source: "proxy".into(),
            account_id: "key".into(),
            timestamp: at(ms),
            cost_usd: cost,
            cost_known: known,
            failed,
            ..Default::default()
        };
        let minute = 60_000;
        let events = [
            proxy(start + minute, 50.0, true, false),
            proxy(observed + minute, 30.0, true, false),
            proxy(observed + 2 * minute, 0.0, false, true),
            proxy(observed + 3 * minute, 0.0, false, false),
        ];
        let got = &credits(&[grant], &events, now).unwrap().api[0];
        assert_eq!(
            (
                got.grant.remaining,
                got.recorded,
                got.proxy_usd,
                got.requests,
                got.unpriced
            ),
            (120.0, 150.0, 80.0, 4, 1)
        );
    }

    #[test]
    fn a_credit_past_its_renewal_starts_a_fresh_period() {
        let hour = 3_600_000;
        let now = 1_800_000_000_000;
        let renewed = now - hour;
        let grant = ApiCredit {
            account: "a".into(),
            organization: "o".into(),
            credential_id: "key".into(),
            remaining: 0.0,
            allowance: 200.0,
            monthly_cap: 200.0,
            starts_at: now - 5 * hour,
            observed_at: now - 4 * hour,
            expires_at: now + 24 * 40 * hour,
            renews_at: renewed,
        };
        let at = |ms: i64| {
            chrono::DateTime::from_timestamp_millis(ms)
                .unwrap()
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        };
        let proxy = |ms: i64, cost: f64| Event {
            source: "proxy".into(),
            account_id: "key".into(),
            timestamp: at(ms),
            cost_usd: cost,
            cost_known: true,
            ..Default::default()
        };
        let events = [proxy(renewed - 60_000, 40.0), proxy(renewed + 60_000, 15.0)];
        let got = &credits(&[grant], &events, now).unwrap().api[0];
        assert_eq!(got.grant.remaining, 185.0);
        assert_eq!(got.recorded, 200.0);
        assert!(got.grant.renews_at > now);
    }

    fn renewal_grant(now: i64) -> ApiCredit {
        let hour = 3_600_000;
        ApiCredit {
            account: "a".into(),
            organization: "o".into(),
            credential_id: "key".into(),
            remaining: 0.0,
            allowance: 200.0,
            monthly_cap: 200.0,
            starts_at: now - 5 * hour,
            observed_at: now - 4 * hour,
            expires_at: now + 24 * 40 * hour,
            renews_at: now - hour,
        }
    }

    #[test]
    fn a_reading_after_the_renewal_is_kept() {
        let now = 1_800_000_000_000;
        let mut g = renewal_grant(now);
        g.observed_at = g.renews_at + 1000;
        g.remaining = 70.0;
        let got = &credits(&[g], &[], now).unwrap().api[0];
        assert_eq!(got.grant.remaining, 70.0);
    }

    #[test]
    fn nothing_renews_at_or_past_expiry() {
        let now = 1_800_000_000_000;
        let mut g = renewal_grant(now);
        g.expires_at = g.renews_at;
        let got = &credits(&[g.clone()], &[], now).unwrap().api[0];
        assert_eq!(
            (got.grant.remaining, got.grant.renews_at),
            (0.0, g.renews_at)
        );
        g.expires_at = now + 1000;
        let got = &credits(&[g], &[], now).unwrap().api[0];
        assert_eq!((got.grant.remaining, got.grant.renews_at), (200.0, 0));
    }

    #[test]
    fn renewal_dates_do_not_drift_on_short_months() {
        let at = |y, m, d| {
            chrono::Utc
                .with_ymd_and_hms(y, m, d, 0, 0, 0)
                .unwrap()
                .timestamp_millis()
        };
        let mut g = renewal_grant(at(2026, 3, 29));
        g.renews_at = at(2026, 1, 31);
        g.starts_at = at(2026, 1, 1);
        g.observed_at = at(2026, 1, 2);
        g.expires_at = at(2027, 1, 1);
        let got = &credits(&[g], &[], at(2026, 3, 29)).unwrap().api[0];
        assert_eq!(got.grant.renews_at, at(2026, 3, 31));
    }
}
