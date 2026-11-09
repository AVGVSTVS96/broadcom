use std::collections::HashMap;

use chrono::{Days, NaiveTime, TimeZone};
use chrono_tz::Tz;
use serde::Serialize;

use super::Row;
use super::timeframe::at_local;

/// Tokens on one calendar day in the zone.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TokenDay {
    /// The day as YYYY-MM-DD.
    pub day: String,
    pub tokens: f64,
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
}

/// One model's tokens over all history.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
pub struct ModelTokens {
    pub model: String,
    pub tokens: f64,
}

/// Every day with tokens since the first record, and each model's share of them.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
pub struct TokensView {
    pub timezone: String,
    pub days: Vec<TokenDay>,
    pub models: Vec<ModelTokens>,
}

/// Sums rows sorted by time into calendar days in the zone, finding each day's bounds once.
pub fn tokens_view(rows: &[Row], zone: Tz) -> TokensView {
    let mut days: Vec<TokenDay> = Vec::new();
    let mut models: HashMap<&str, f64> = HashMap::new();
    let mut ends = f64::NEG_INFINITY;
    for row in rows {
        let tokens = row.token_total() as f64;
        if row.millis.is_nan() || tokens <= 0.0 {
            continue;
        }
        if row.millis >= ends {
            let Some(at) = zone.timestamp_millis_opt(row.millis as i64).single() else {
                continue;
            };
            let date = at.date_naive();
            let next = date + Days::new(1);
            ends = at_local(zone, next.and_time(NaiveTime::MIN)).timestamp_millis() as f64;
            days.push(TokenDay {
                day: date.format("%Y-%m-%d").to_string(),
                tokens: 0.0,
                input: 0.0,
                output: 0.0,
                cache_read: 0.0,
                cache_write: 0.0,
            });
        }
        let day = days.last_mut().expect("a day was started");
        day.tokens += tokens;
        day.input += row.input_tokens as f64;
        day.output += row.output_tokens as f64;
        day.cache_read += row.cache_read_tokens as f64;
        day.cache_write += row.cache_write_tokens as f64;
        *models.entry(&row.model).or_default() += tokens;
    }
    let mut models: Vec<ModelTokens> = models
        .into_iter()
        .map(|(model, tokens)| ModelTokens {
            model: model.to_string(),
            tokens,
        })
        .collect();
    models.sort_by(|a, b| b.tokens.total_cmp(&a.tokens).then(a.model.cmp(&b.model)));
    TokensView {
        timezone: zone.name().to_string(),
        days,
        models,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    fn row(at: &str, model: &str, input: i64, cache_read: i64) -> Row {
        Row {
            millis: super::super::parse_millis(at),
            proxy: false,
            failed: false,
            cost_known: true,
            cost_usd: 0.0,
            harness: Arc::from("claude"),
            model: Arc::from(model),
            project: Arc::from(""),
            repository: None,
            session_id: Arc::from("s"),
            device_id: Arc::from(""),
            session_title: Arc::from(""),
            entrypoint: Arc::from(""),
            account_id: Arc::from(""),
            input_tokens: input,
            output_tokens: 0,
            cache_read_tokens: cache_read,
            cache_write_tokens: 0,
            unclassified_tokens: 0,
            reasoning_tokens: 0,
            requests: None,
        }
    }

    #[test]
    fn days_follow_the_zone_and_models_rank_by_tokens() {
        let rows = [
            row("2026-11-08T07:30:00Z", "opus", 10, 90),
            row("2026-11-08T09:00:00Z", "haiku", 5, 0),
            row("2026-11-09T12:00:00Z", "opus", 1, 0),
            row("2026-11-09T13:00:00Z", "opus", 0, 0),
        ];
        let view = tokens_view(&rows, chrono_tz::America::Los_Angeles);
        let days: Vec<(&str, f64, f64)> = view
            .days
            .iter()
            .map(|d| (d.day.as_str(), d.tokens, d.cache_read))
            .collect();
        assert_eq!(
            days,
            [
                ("2026-11-07", 100.0, 90.0),
                ("2026-11-08", 5.0, 0.0),
                ("2026-11-09", 1.0, 0.0),
            ]
        );
        let models: Vec<(&str, f64)> = view
            .models
            .iter()
            .map(|m| (m.model.as_str(), m.tokens))
            .collect();
        assert_eq!(models, [("opus", 101.0), ("haiku", 5.0)]);
    }
}
