use std::path::Path;

use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use super::credits::ApiCredit;
use super::sessions::Prepared;
use super::timeframe::{month_start, next_month, parse_millis};

/// One paid subscription seat on a plan.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Seat {
    /// The pooled account it is; none for a configured plan.
    pub account: Option<String>,
    pub label: String,
    pub tier: String,
    pub monthly_usd: f64,
    /// None until the account's profile reports when it started, and Plan $ leaves it out until then.
    pub since: Option<f64>,
}

/// A subscription that covers its providers' usage.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
pub struct Plan {
    pub name: String,
    pub providers: Vec<String>,
    pub seats: Vec<Seat>,
}

/// A pooled account on a tier no price is known for.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
pub struct UnpricedSeat {
    pub account: String,
    pub label: String,
    pub tier: String,
}

/// Every plan and its seats, and the pooled accounts left out for want of a price.
#[derive(Debug, Clone, Default, PartialEq, Serialize, schemars::JsonSchema)]
pub struct PlansView {
    pub plans: Vec<Plan>,
    pub unpriced: Vec<UnpricedSeat>,
}

/// A plan from config (`usage.plans`), like a ChatGPT subscription.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConfiguredPlan {
    pub name: String,
    pub providers: Vec<String>,
    #[serde(rename = "monthlyUSD", alias = "monthly-usd")]
    pub monthly_usd: f64,
    pub since: String,
}

/// A Claude plan tier's name and monthly price, by the tier id its profile reports.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tier {
    pub tier: String,
    pub name: String,
    #[serde(rename = "monthlyUSD")]
    pub monthly_usd: f64,
}

/// The built-in tiers, under the configured ones.
fn tiers_over(configured: &[Tier]) -> Vec<Tier> {
    let built_in = [
        ("default_claude_max_20x", "Max 20x", 200.0),
        ("default_claude_max_5x", "Max 5x", 100.0),
        ("default_claude_ai", "Pro", 20.0),
    ]
    .map(|(tier, name, monthly_usd)| Tier {
        tier: tier.into(),
        name: name.into(),
        monthly_usd,
    });
    let mut tiers = configured.to_vec();
    tiers.extend(
        built_in
            .into_iter()
            .filter(|b| !configured.iter().any(|c| c.tier == b.tier)),
    );
    tiers
}

pub(crate) fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

#[derive(Deserialize, Default)]
pub(crate) struct AccountList {
    #[serde(default)]
    pub accounts: Vec<ListedAccount>,
}

#[derive(Deserialize)]
pub(crate) struct ListedAccount {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub tier: Option<String>,
}

#[derive(Deserialize, Default)]
struct SavedPlan {
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    since: Option<f64>,
}

/// The pooled Claude accounts' plans, from the pool's account list (accounts.json) and the
/// tier each profile reported (`<state>/plans/<id>.json`), priced by `tiers` over the
/// built-in ones; then the configured plans.
pub fn read_plans(
    accounts_file: Option<&Path>,
    state_dir: Option<&Path>,
    configured: &[ConfiguredPlan],
    tiers: &[Tier],
) -> PlansView {
    let tiers = tiers_over(tiers);
    let list: AccountList = accounts_file.and_then(read_json).unwrap_or_default();
    let mut view = PlansView::default();
    let mut seats = Vec::new();
    for account in list.accounts {
        let saved: SavedPlan = state_dir
            .and_then(|dir| read_json(&dir.join("plans").join(format!("{}.json", account.id))))
            .unwrap_or_default();
        let priced = match (&saved.tier, &account.tier) {
            (Some(id), _) => tiers.iter().find(|t| t.tier == *id),
            (None, Some(name)) => tiers.iter().find(|t| t.name.eq_ignore_ascii_case(name)),
            (None, None) => None,
        };
        let Some(tier) = priced else {
            if let Some(tier) = saved.tier.or(account.tier).filter(|t| !t.is_empty()) {
                view.unpriced.push(UnpricedSeat {
                    account: account.id,
                    label: account.email,
                    tier,
                });
            }
            continue;
        };
        seats.push(Seat {
            account: Some(account.id),
            label: account.email,
            tier: tier.name.clone(),
            monthly_usd: tier.monthly_usd,
            since: saved.since.filter(|s| *s != 0.0),
        });
    }
    if !seats.is_empty() {
        view.plans.push(Plan {
            name: "Claude".into(),
            providers: vec!["anthropic".into()],
            seats,
        });
    }
    for plan in configured {
        view.plans.push(Plan {
            name: plan.name.clone(),
            providers: plan.providers.clone(),
            seats: vec![Seat {
                account: None,
                label: plan.name.clone(),
                tier: plan.name.clone(),
                monthly_usd: plan.monthly_usd,
                since: Some(parse_millis(&plan.since)),
            }],
        });
    }
    view
}

/// Go's math.Min and Max, where NaN wins.
fn go_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}

fn go_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}

#[derive(Debug, Clone, Copy)]
struct Month {
    start: f64,
    end: f64,
}

fn overlap(start: f64, end: f64, from: f64, to: f64) -> f64 {
    go_max(0.0, go_min(end, to) - go_max(start, from))
}

/// A seat with a known start, as pricing needs it.
#[derive(Debug, Clone, Copy)]
struct Started {
    monthly_usd: f64,
    since: f64,
}

/// A plan's providers and its seats that have started.
#[derive(Debug, Clone)]
struct Covering {
    providers: Vec<String>,
    seats: Vec<Started>,
}

/// A seat accrues its monthly price evenly across each calendar month it was active.
fn seat_fees(seat: Started, m: Month, from: f64, to: f64) -> f64 {
    seat.monthly_usd * overlap(m.start, m.end, go_max(from, seat.since), to) / (m.end - m.start)
}

/// Requests on an API-key credential run on no plan seat.
fn is_api_key(event: &Prepared) -> bool {
    event.account_id.contains(":apikey:")
}

/// Spreads each plan's monthly fees over the API value its usage had that calendar
/// month, so a request's plan $ is its API $ times that month's rate. It needs every
/// event of each month it prices, and every event after now.
#[derive(Debug, Clone)]
pub struct PlanPricing {
    active: Vec<Covering>,
    covers: Vec<f64>,
    months: Vec<Month>,
    grants: Vec<ApiCredit>,
    rate: Vec<Vec<f64>>,
    now: f64,
}

impl PlanPricing {
    /// `now` is unix ms.
    pub fn new(
        plans: &[Plan],
        grants: &[ApiCredit],
        events: &[Prepared],
        zone: Tz,
        now: i64,
    ) -> Self {
        let now = now as f64;
        let mut active = Vec::new();
        let mut covers = Vec::new();
        for plan in plans {
            let seats: Vec<Started> = plan
                .seats
                .iter()
                .filter_map(|seat| {
                    Some(Started {
                        monthly_usd: seat.monthly_usd,
                        since: seat.since?,
                    })
                })
                .collect();
            if seats.is_empty() {
                continue;
            }
            covers.push(
                seats
                    .iter()
                    .fold(f64::INFINITY, |cover, seat| go_min(cover, seat.since)),
            );
            active.push(Covering {
                providers: plan.providers.clone(),
                seats,
            });
        }
        let from = covers.iter().fold(now, |from, cover| go_min(from, *cover));
        let mut months = Vec::new();
        if !from.is_nan() {
            let mut cursor = month_start(zone, from);
            while (cursor.timestamp_millis() as f64) <= now {
                let next = next_month(cursor);
                months.push(Month {
                    start: cursor.timestamp_millis() as f64,
                    end: next.timestamp_millis() as f64,
                });
                cursor = next;
            }
        }
        let mut pricing = PlanPricing {
            active,
            covers,
            months,
            grants: grants.to_vec(),
            rate: Vec::new(),
            now,
        };
        let mut api = vec![vec![0.0; pricing.months.len()]; pricing.active.len()];
        for event in events {
            if !event.cost_known || event.cost_usd <= 0.0 {
                continue;
            }
            if let (Some(plan), Some(m)) = (pricing.plan_of(event), pricing.month_of(event.millis))
            {
                api[plan][m] += event.cost_usd;
            }
        }
        pricing.rate = pricing
            .active
            .iter()
            .zip(&api)
            .map(|(plan, api)| {
                pricing
                    .months
                    .iter()
                    .zip(api)
                    .map(|(m, api)| {
                        let fees: f64 = plan
                            .seats
                            .iter()
                            .fold(0.0, |fees, seat| fees + seat_fees(*seat, *m, m.start, now));
                        if *api > 0.0 { fees / api } else { 0.0 }
                    })
                    .collect()
            })
            .collect();
        pricing
    }

    fn month_of(&self, millis: f64) -> Option<usize> {
        let (mut low, mut high) = (0isize, self.months.len() as isize - 1);
        while low <= high {
            let i = isize::midpoint(low, high);
            let m = self.months[i as usize];
            if millis < m.start {
                high = i - 1;
            } else if millis >= m.end {
                low = i + 1;
            } else {
                return Some(i as usize);
            }
        }
        if millis >= self.now {
            self.months.len().checked_sub(1)
        } else {
            None
        }
    }

    /// The plan covering a request; none for an API key, which no seat covers.
    fn plan_of(&self, event: &Prepared) -> Option<usize> {
        if is_api_key(event) {
            return None;
        }
        (0..self.active.len()).find(|&i| {
            self.active[i].providers.iter().any(|p| p == event.provider)
                && event.millis >= self.covers[i]
        })
    }

    /// A request on a grant from credits.json, inside the grant's window, ran on free credit.
    fn is_free(&self, event: &Prepared) -> bool {
        is_api_key(event)
            && self.grants.iter().any(|g| {
                *event.account_id == *g.credential_id
                    && event.millis >= g.starts_at as f64
                    && event.millis < g.expires_at as f64
            })
    }

    /// A request's plan $; free API credit costs nothing and any other API key its full price.
    pub fn price(&self, event: &Prepared) -> f64 {
        if self.is_free(event) {
            return 0.0;
        }
        match (self.plan_of(event), self.month_of(event.millis)) {
            (Some(plan), Some(m)) => event.cost_usd * self.rate[plan][m],
            _ => event.cost_usd,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::Event;
    use crate::views::Row;
    use crate::views::sessions::prepare;
    use chrono::TimeZone;

    #[test]
    fn plan_rate_spreads_monthly_fees() {
        let utc: Tz = "UTC".parse().unwrap();
        let now = utc.with_ymd_and_hms(2026, 10, 16, 0, 0, 0).unwrap();
        let since = utc
            .with_ymd_and_hms(2026, 9, 1, 0, 0, 0)
            .unwrap()
            .timestamp_millis() as f64;
        let plans = [Plan {
            name: "Claude".into(),
            providers: vec!["anthropic".into()],
            seats: vec![Seat {
                account: None,
                label: String::new(),
                tier: String::new(),
                monthly_usd: 310.0,
                since: Some(since),
            }],
        }];
        let event = |model: &str, at: &str, cost: f64| Event {
            model: model.into(),
            timestamp: at.into(),
            cost_usd: cost,
            cost_known: true,
            ..Default::default()
        };
        let events = [
            event("claude-opus-4-5", "2026-09-10T00:00:00Z", 600.0),
            event("claude-opus-4-5", "2026-10-10T00:00:00Z", 50.0),
            event("gpt-5", "2026-10-10T00:00:00Z", 70.0),
        ];
        let rows = events.map(|e| Row::from(&e));
        let prepared = prepare(&rows);
        let p = PlanPricing::new(&plans, &[], &prepared, utc, now.timestamp_millis());
        assert!((p.price(&prepared[0]) - 310.0).abs() < 1e-9);
        assert!((p.price(&prepared[1]) - 150.0).abs() < 1e-9);
        assert_eq!(p.price(&prepared[2]), 70.0);
    }

    #[test]
    fn api_key_requests_do_not_take_the_plan_rate() {
        let utc: Tz = "UTC".parse().unwrap();
        let now = utc.with_ymd_and_hms(2026, 10, 16, 0, 0, 0).unwrap();
        let since = utc
            .with_ymd_and_hms(2026, 9, 1, 0, 0, 0)
            .unwrap()
            .timestamp_millis() as f64;
        let plans = [Plan {
            name: "Claude".into(),
            providers: vec!["anthropic".into()],
            seats: vec![Seat {
                account: None,
                label: String::new(),
                tier: String::new(),
                monthly_usd: 300.0,
                since: Some(since),
            }],
        }];
        let event = |account: &str, cost: f64| Event {
            model: "claude-opus-4-5".into(),
            timestamp: "2026-09-10T00:00:00Z".into(),
            cost_usd: cost,
            cost_known: true,
            account_id: account.into(),
            ..Default::default()
        };
        let grants = [ApiCredit {
            credential_id: "claude:apikey:f8bd1a2f93d9".into(),
            starts_at: since as i64,
            expires_at: since as i64 + 60 * 86_400_000,
            ..Default::default()
        }];
        let events = [
            event("", 300.0),
            event("claude:apikey:f8bd1a2f93d9", 200.0),
            event("claude:apikey:paid00000000", 80.0),
        ];
        let rows = events.map(|e| Row::from(&e));
        let prepared = prepare(&rows);
        let p = PlanPricing::new(&plans, &grants, &prepared, utc, now.timestamp_millis());
        assert!((p.price(&prepared[0]) - 300.0).abs() < 1e-9);
        assert_eq!(p.price(&prepared[1]), 0.0);
        assert_eq!(p.price(&prepared[2]), 80.0);
    }

    #[test]
    fn seats_are_priced_by_tier_and_unknown_tiers_are_listed() {
        let root = std::env::temp_dir().join(format!("views-plans-{}", std::process::id()));
        std::fs::create_dir_all(root.join("plans")).unwrap();
        let accounts = root.join("accounts.json");
        std::fs::write(
            &accounts,
            r#"{"accounts":[{"id":"a","email":"a@x","tier":"max 5x"},{"id":"b","email":"b@x"},{"id":"c","email":"c@x"},{"id":"d","email":"d@x"}]}"#,
        )
        .unwrap();
        for (id, saved) in [
            ("b", r#"{"tier":"default_claude_max_20x","since":5}"#),
            ("c", r#"{"tier":"default_claude_team","since":5}"#),
        ] {
            std::fs::write(root.join(format!("plans/{id}.json")), saved).unwrap();
        }
        let seats = |view: &PlansView| {
            view.plans[0]
                .seats
                .iter()
                .map(|s| {
                    (
                        s.account.clone().unwrap(),
                        s.tier.clone(),
                        s.monthly_usd,
                        s.since,
                    )
                })
                .collect::<Vec<_>>()
        };

        let view = read_plans(Some(&accounts), Some(&root), &[], &[]);
        assert_eq!(
            seats(&view),
            [
                ("a".into(), "Max 5x".into(), 100.0, None),
                ("b".into(), "Max 20x".into(), 200.0, Some(5.0)),
            ]
        );
        assert_eq!(
            view.unpriced,
            [UnpricedSeat {
                account: "c".into(),
                label: "c@x".into(),
                tier: "default_claude_team".into(),
            }]
        );

        let team = Tier {
            tier: "default_claude_team".into(),
            name: "Team".into(),
            monthly_usd: 30.0,
        };
        let view = read_plans(Some(&accounts), Some(&root), &[], &[team]);
        assert_eq!(
            seats(&view)[2],
            ("c".into(), "Team".into(), 30.0, Some(5.0))
        );
        assert_eq!(view.unpriced, []);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_seat_with_no_start_adds_no_fees() {
        let utc: Tz = "UTC".parse().unwrap();
        let now = utc.with_ymd_and_hms(2026, 10, 16, 0, 0, 0).unwrap();
        let seat = |since: Option<f64>| Seat {
            account: Some(String::new()),
            label: String::new(),
            tier: String::new(),
            monthly_usd: 200.0,
            since,
        };
        let since = utc
            .with_ymd_and_hms(2026, 9, 1, 0, 0, 0)
            .unwrap()
            .timestamp_millis() as f64;
        let plan = |seats| Plan {
            name: "Claude".into(),
            providers: vec!["anthropic".into()],
            seats,
        };
        let events = [Event {
            model: "claude-opus-4-5".into(),
            timestamp: "2026-09-10T00:00:00Z".into(),
            cost_usd: 400.0,
            cost_known: true,
            ..Default::default()
        }];
        let rows = events.map(|e| Row::from(&e));
        let prepared = prepare(&rows);
        let price = |plans: &[Plan]| {
            PlanPricing::new(plans, &[], &prepared, utc, now.timestamp_millis()).price(&prepared[0])
        };
        let one = price(&[plan(vec![seat(Some(since))])]);
        assert!((one - 200.0).abs() < 1e-9);
        assert_eq!(price(&[plan(vec![seat(Some(since)), seat(None)])]), one);
    }
}
