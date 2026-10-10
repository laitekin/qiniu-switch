//! Public model metadata used by https://www.qiniu.com/ai/models.
//!
//! Endpoints and protocol aliases were verified against the site's `BNxZ` module
//! on 2026-09-29. The catalog requires its public Origin/Referer but no Cookie,
//! API key, or AK/SK. Model availability for a user's key is checked separately.
use chrono::{Local, NaiveDate, Utc};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;
use url::Url;

const SOURCE_URL: &str = "https://www.qiniu.com/ai/models";
const PLAN_SOURCE_URL: &str = "https://www.qiniu.com/ai/plan";
const CATALOG_URL: &str =
    "https://web-api.qiniu.com/api/proxy/ai-inference/inapi/v2/models?sort=rank&order=asc";
const DETAIL_BASE: &str = "https://api.qnaigc.com/v1/market/model/";
const RESPONSE_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QiniuMarketPrice {
    label: String,
    value: String,
    unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_range: Option<Vec<u64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_range: Option<Vec<u64>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QiniuMarketModel {
    id: String,
    name: String,
    vendor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor_icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    capabilities: Vec<String>,
    prices: Vec<QiniuMarketPrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_window: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output: Option<String>,
    is_new: bool,
    supports_chat: bool,
    available: bool,
    detail_url: String,
    api_ids: Vec<String>,
    protocols: Vec<String>,
    retired: bool,
    input_modalities: Vec<String>,
    output_modalities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    overview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    integration_doc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    announcement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    documentation_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retirement_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QiniuMarketCatalog {
    models: Vec<QiniuMarketModel>,
    source_url: &'static str,
    fetched_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QiniuTokenPlanCatalog {
    models: Vec<String>,
    source_url: &'static str,
    fetched_at: String,
}

/// Public Token Plan model list from Qiniu's server-rendered plan page. This
/// describes the published plan, not the entitlements of a particular key.
#[tauri::command]
pub async fn qiniu_market_token_plan_models() -> Result<QiniuTokenPlanCatalog, String> {
    let html = plan_page_request().await?;
    Ok(QiniuTokenPlanCatalog {
        models: parse_plan_models(&html)?,
        source_url: PLAN_SOURCE_URL,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

async fn plan_page_request() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "qiniu_plan_connection_failed")?;
    let mut response = client
        .get(PLAN_SOURCE_URL)
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|_| "qiniu_plan_connection_failed")?;
    if !response.status().is_success() {
        return Err(format!("qiniu_plan_http_{}", response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > RESPONSE_LIMIT as u64)
    {
        return Err("qiniu_plan_response_too_large".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "qiniu_plan_connection_failed")?
    {
        if body.len() + chunk.len() > RESPONSE_LIMIT {
            return Err("qiniu_plan_response_too_large".into());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "qiniu_plan_invalid_response".into())
}

fn parse_plan_models(html: &str) -> Result<Vec<String>, String> {
    let marker = "id=\"__NEXT_DATA__\"";
    let script = &html[html.find(marker).ok_or("qiniu_plan_invalid_response")? + marker.len()..];
    let payload = &script[script.find('>').ok_or("qiniu_plan_invalid_response")? + 1..];
    let payload = &payload[..payload
        .find("</script>")
        .ok_or("qiniu_plan_invalid_response")?];
    let page: Value = serde_json::from_str(payload).map_err(|_| "qiniu_plan_invalid_response")?;
    let plan = page
        .pointer("/props/pageProps/planData")
        .ok_or("qiniu_plan_invalid_response")?;
    let has_enterprise_s = plan
        .pointer("/pricing/plans")
        .and_then(Value::as_array)
        .is_some_and(|plans| {
            plans
                .iter()
                .any(|tier| tier.get("id").and_then(Value::as_str) == Some("Enterprise-s"))
        });
    if !has_enterprise_s {
        return Err("qiniu_plan_invalid_response".into());
    }
    let groups = plan
        .pointer("/models/groups")
        .and_then(Value::as_array)
        .ok_or("qiniu_plan_invalid_response")?;
    let mut seen = HashSet::new();
    let mut models = Vec::new();
    for group in groups {
        let entries = group
            .get("models")
            .and_then(Value::as_array)
            .ok_or("qiniu_plan_invalid_response")?;
        for entry in entries {
            let id = entry
                .as_str()
                .or_else(|| entry.get("name").and_then(Value::as_str));
            if let Some(id) = id
                .map(str::trim)
                .filter(|id| model_url(DETAIL_BASE, id, false).is_ok())
            {
                if seen.insert(id.to_owned()) {
                    models.push(id.to_owned());
                }
            }
        }
    }
    if models.is_empty() {
        return Err("qiniu_plan_invalid_response".into());
    }
    Ok(models)
}

#[tauri::command]
pub async fn qiniu_market_models() -> Result<QiniuMarketCatalog, String> {
    let response = public_request(Url::parse(CATALOG_URL).expect("constant catalog URL")).await?;
    Ok(QiniuMarketCatalog {
        models: parse_catalog(&response, Local::now().date_naive())?,
        source_url: SOURCE_URL,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn qiniu_market_model_detail(model_id: String) -> Result<QiniuMarketModel, String> {
    let response = public_request(model_url(DETAIL_BASE, &model_id, true)?).await?;
    let data = response_data(&response)?;
    // Prevent accepting an unrelated response as the selected model's details.
    if data.get("id").and_then(Value::as_str) != Some(model_id.as_str()) {
        return Err("qiniu_market_invalid_response".into());
    }
    normalize_model(data, Local::now().date_naive())
}

async fn public_request(url: Url) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "qiniu_market_connection_failed")?;
    let mut response = client
        .get(url)
        .header("Accept", "application/json")
        .header("Origin", "https://www.qiniu.com")
        .header("Referer", "https://www.qiniu.com/")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "qiniu_market_timeout"
            } else {
                "qiniu_market_connection_failed"
            }
        })?;
    if !response.status().is_success() {
        return Err(format!("qiniu_market_http_{}", response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > RESPONSE_LIMIT as u64)
    {
        return Err("qiniu_market_response_too_large".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "qiniu_market_connection_failed")?
    {
        if body.len() + chunk.len() > RESPONSE_LIMIT {
            return Err("qiniu_market_response_too_large".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "qiniu_market_invalid_response".into())
}

fn response_data(response: &Value) -> Result<&Value, String> {
    if response.get("status").and_then(Value::as_bool) != Some(true) {
        return Err("qiniu_market_invalid_response".into());
    }
    response
        .get("data")
        .filter(|value| !value.is_null())
        .ok_or_else(|| "qiniu_market_invalid_response".into())
}

fn parse_catalog(response: &Value, today: NaiveDate) -> Result<Vec<QiniuMarketModel>, String> {
    let models = response_data(response)?
        .as_array()
        .ok_or("qiniu_market_invalid_response")?;
    let mut seen = HashSet::new();
    models
        .iter()
        .filter(|model| model.get("private").and_then(Value::as_bool) != Some(true))
        .map(|model| normalize_model(model, today))
        .filter(|result| match result {
            Ok(model) => seen.insert(model.id.clone()),
            Err(_) => true,
        })
        .collect()
}

fn text(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn strings(value: &Value) -> Vec<String> {
    let mut seen = HashSet::new();
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && seen.insert((*value).to_owned()))
        .map(str::to_owned)
        .collect()
}

fn model_url(base: &str, id: &str, detail: bool) -> Result<Url, String> {
    // IDs are supplied by the catalog; each slash-separated part is encoded as a
    // path segment. Do not allow navigation or query strings from an IPC caller.
    if id.is_empty()
        || id.len() > 256
        || id.split('/').any(|part| {
            part.is_empty()
                || part == "."
                || part == ".."
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
        })
    {
        return Err("qiniu_market_invalid_model".into());
    }
    let mut url = Url::parse(base).expect("constant model URL");
    {
        let mut path = url.path_segments_mut().expect("HTTPS base URL");
        path.pop_if_empty().extend(id.split('/'));
        if detail {
            path.push("detail");
        }
    }
    Ok(url)
}

fn qiniu_url(value: Option<String>) -> Option<String> {
    let value = value?;
    let url = Url::parse(&value).ok()?;
    let host = url.host_str()?;
    (url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && (host == "qiniu.com" || host.ends_with(".qiniu.com") || host == "www-static.qbox.me"))
        .then_some(value)
}

fn normalize_protocols(value: &Value, output: &[String]) -> Vec<String> {
    let mut protocols = Vec::new();
    for protocol in strings(value) {
        let mapped: Vec<&str> = match protocol.as_str() {
            "openai" => vec!["openai-chat"],
            "anthropic" => vec!["anthropic-messages"],
            "openai_image" => vec!["openai-image"],
            "openai_video" => vec!["openai-video"],
            "qiniu_asr" => vec!["qiniu-asr"],
            "qiniu_tts" => vec!["qiniu-tts"],
            "qiniu_ocr" => vec!["qiniu-ocr"],
            "google" | "fal_ai" => {
                let mapped: Vec<_> = output
                    .iter()
                    .filter_map(|modality| match (protocol.as_str(), modality.as_str()) {
                        ("google", "text") => Some("vertex-bypass"),
                        ("google", "video") => Some("veo-video"),
                        ("fal_ai", "image") => Some("fal-image"),
                        ("fal_ai", "video") => Some("fal-video"),
                        _ => None,
                    })
                    .collect();
                if mapped.is_empty() {
                    vec![protocol.as_str()]
                } else {
                    mapped
                }
            }
            _ => vec![protocol.as_str()],
        };
        for protocol in mapped {
            if !protocols.iter().any(|item| item == protocol) {
                protocols.push(protocol.to_owned());
            }
        }
    }
    protocols
}

fn token_count(value: &Value) -> Option<String> {
    value.as_u64().filter(|number| *number > 0).map(|number| {
        if number % 1_000_000 == 0 {
            format!("{}M", number / 1_000_000)
        } else if number % 1_000 == 0 {
            format!("{}K", number / 1_000)
        } else {
            number.to_string()
        }
    })
}

fn price_range(value: &Value) -> Option<Vec<u64>> {
    let items = value.as_array()?;
    if items.len() != 2 {
        return None;
    }
    let min = items[0].as_u64()?;
    let max = items[1].as_u64()?;
    (min <= max).then_some(vec![min, max])
}

fn normalize_prices(model: &Value) -> Vec<QiniuMarketPrice> {
    let mut prices = Vec::new();
    for rule in model["pricing_rules_v2"].as_array().into_iter().flatten() {
        let Some(details) = rule["details_v2"].as_object() else {
            continue;
        };
        let mut order = strings(&rule["item_order"]);
        for key in details.keys() {
            if !order.contains(key) {
                order.push(key.clone());
            }
        }
        for key in order {
            let Some(detail) = details.get(&key) else {
                continue;
            };
            let (Some(label), Some(unit), Some(size), Some(price)) = (
                text(detail, "name"),
                text(detail, "unit_name"),
                detail["unit_size"].as_u64().filter(|size| *size > 0),
                detail["unit_price"].as_number(),
            ) else {
                continue;
            };
            if !price.as_f64().is_some_and(|number| number >= 0.0) {
                continue;
            }
            let unit = match unit.as_str() {
                "token" if size == 1000 => "1K tokens".to_owned(),
                "token" => format!("{size} tokens"),
                "second" => format!("{size} 秒"),
                "pic" => format!("{size} 张"),
                "time" => format!("{size} 次"),
                _ => format!("{size} {unit}"),
            };
            prices.push(QiniuMarketPrice {
                label,
                value: format!("¥{price}"),
                unit,
                input_range: price_range(&rule["input_range"]),
                output_range: price_range(&rule["output_range"]),
            });
        }
    }
    prices
}

fn normalize_model(model: &Value, today: NaiveDate) -> Result<QiniuMarketModel, String> {
    let id = text(model, "id").ok_or("qiniu_market_invalid_response")?;
    let name = text(model, "name").ok_or("qiniu_market_invalid_response")?;
    let detail_url = model_url("https://www.qiniu.com/ai/model/", &id, false)?.to_string();
    let mut api_ids = vec![id.clone()];
    for alias in strings(&model["model_alias"]) {
        if !api_ids.contains(&alias) {
            api_ids.push(alias);
        }
    }
    let input_modalities = strings(&model["architecture"]["input_modalities"]);
    let output_modalities = strings(&model["architecture"]["output_modalities"]);
    let protocols = normalize_protocols(&model["support_api_protocols"], &output_modalities);
    let retirement_at = text(model, "retirement_at");
    // The website retires at the end of the listed date, not its beginning.
    let retired = retirement_at
        .as_deref()
        .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
        .is_some_and(|date| date < today);
    Ok(QiniuMarketModel {
        id,
        name,
        vendor: text(&model["issuer"], "name").unwrap_or_default(),
        vendor_icon: qiniu_url(text(&model["issuer"], "avatar")),
        icon: qiniu_url(text(model, "avatar")),
        description: text(model, "description"),
        capabilities: strings(&model["features"]),
        prices: normalize_prices(model),
        context_window: token_count(&model["model_constraints"]["context_length"]),
        max_output: token_count(&model["model_constraints"]["max_tokens"])
            .or_else(|| token_count(&model["model_constraints"]["max_completion_tokens"])),
        is_new: strings(&model["hot_tags"])
            .iter()
            .any(|tag| tag.contains("上新")),
        supports_chat: protocols.iter().any(|protocol| protocol == "openai-chat")
            && output_modalities.iter().any(|modality| modality == "text"),
        available: !retired && model["private"].as_bool() != Some(true),
        detail_url,
        api_ids,
        protocols,
        retired,
        input_modalities,
        output_modalities,
        overview: text(model, "overview"),
        integration_doc: text(model, "integration_doc"),
        announcement: text(model, "announcement"),
        documentation_url: qiniu_url(text(model, "model_doc_url"))
            .or_else(|| qiniu_url(text(model, "integration_doc_url"))),
        retirement_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 29).unwrap()
    }

    fn fixture() -> Value {
        serde_json::from_str(include_str!("fixtures/qiniu_market_models.json")).unwrap()
    }

    #[test]
    fn official_catalog_preserves_ids_protocols_and_tiered_prices() {
        let models = parse_catalog(&fixture(), today()).unwrap();
        let model = models
            .iter()
            .find(|model| model.id == "minimax/minimax-m3")
            .unwrap();
        assert_eq!(model.api_ids, ["minimax/minimax-m3"]);
        assert_eq!(model.protocols, ["openai-chat", "anthropic-messages"]);
        assert_eq!(model.context_window.as_deref(), Some("1M"));
        assert_eq!(model.max_output.as_deref(), Some("128K"));
        assert!(model.available && model.supports_chat);
        assert_eq!(model.prices.len(), 6);
        assert_eq!(model.prices[0].value, "¥0.0084");
        assert_eq!(model.prices[0].unit, "1K tokens");
        assert_eq!(model.prices[0].input_range, Some(vec![0, 512000]));
        assert_eq!(model.prices[3].input_range, Some(vec![512000, 99999999]));
    }

    #[test]
    fn video_pricing_is_not_mislabeled_as_tokens_or_chat() {
        let models = parse_catalog(&fixture(), today()).unwrap();
        let model = models.iter().find(|model| model.id == "viduq1").unwrap();
        assert!(!model.supports_chat);
        assert_eq!(model.output_modalities, ["video"]);
        assert!(model.prices.iter().all(|price| price.unit == "1 秒"));
    }

    #[test]
    fn preserves_official_vendor_avatar_separately_from_model_icon() {
        let mut data = fixture()["data"][0].clone();
        let vendor_icon = "https://static.qiniu.com/ai-inference/issuer-icons/minimax.png";
        data["issuer"]["avatar"] = json!(vendor_icon);
        let model = normalize_model(&data, today()).unwrap();
        assert_eq!(model.vendor_icon.as_deref(), Some(vendor_icon));
        assert_eq!(model.icon.as_deref(), data["avatar"].as_str());
        let serialized = serde_json::to_value(&model).unwrap();
        assert_eq!(serialized["vendorIcon"], vendor_icon);
        assert_ne!(serialized["vendorIcon"], serialized["icon"]);
    }

    #[test]
    fn omits_missing_or_untrusted_vendor_avatar_without_reusing_model_icon() {
        for avatar in [
            Value::Null,
            json!(""),
            json!("   "),
            json!("not a URL"),
            json!("http://static.qiniu.com/vendor.png"),
            json!("https://qiniu.com.example.org/vendor.png"),
            json!("https://user:password@static.qiniu.com/vendor.png"),
        ] {
            let mut data = fixture()["data"][0].clone();
            data["issuer"]["avatar"] = avatar;
            let model = normalize_model(&data, today()).unwrap();
            assert!(model.vendor_icon.is_none());
            assert_eq!(model.icon.as_deref(), data["avatar"].as_str());
            assert!(serde_json::to_value(model)
                .unwrap()
                .get("vendorIcon")
                .is_none());
        }
        let mut data = fixture()["data"][0].clone();
        data["issuer"].as_object_mut().unwrap().remove("avatar");
        assert!(normalize_model(&data, today())
            .unwrap()
            .vendor_icon
            .is_none());
    }

    #[test]
    fn aliases_missing_prices_and_retirement_are_not_invented() {
        let mut data = fixture()["data"][0].clone();
        data["model_alias"] = json!(["alias", "alias"]);
        data["pricing_rules_v2"] = json!([]);
        data["retirement_at"] = json!("2026-09-29");
        let model = normalize_model(&data, today()).unwrap();
        assert_eq!(model.api_ids.len(), 2);
        assert!(model.prices.is_empty());
        assert!(!model.retired);
        data["retirement_at"] = json!("2026-09-28");
        let model = normalize_model(&data, today()).unwrap();
        assert!(model.retired);
        assert!(!model.available);
    }

    #[test]
    fn rejects_malformed_payloads_and_navigation_ids() {
        for response in [
            json!({"status": false, "data": []}),
            json!({"status": true, "data": {}}),
            json!({"status": true, "data": [{"name": "No ID"}]}),
        ] {
            assert!(parse_catalog(&response, today()).is_err());
        }
        for id in [
            "",
            "../admin",
            "a/../../admin",
            "a?key=x",
            "https://example.org",
            "a%2fb",
            "a//b",
        ] {
            assert!(model_url(DETAIL_BASE, id, true).is_err());
        }
        assert_eq!(
            model_url(DETAIL_BASE, "deepseek/deepseek-v4-pro-0813", true)
                .unwrap()
                .as_str(),
            "https://api.qnaigc.com/v1/market/model/deepseek/deepseek-v4-pro-0813/detail"
        );
    }

    #[test]
    fn filters_private_models_duplicates_and_untrusted_links() {
        let mut response = fixture();
        let mut private = response["data"][0].clone();
        private["private"] = json!(true);
        let mut public = response["data"][1].clone();
        public["avatar"] = json!("https://example.org/tracker.png");
        response["data"] = json!([private, public.clone(), public]);
        let models = parse_catalog(&response, today()).unwrap();
        assert_eq!(models.len(), 1);
        assert!(models[0].icon.is_none());
    }

    #[test]
    fn reads_live_token_plan_models_from_next_data() {
        let page = json!({
            "props": {"pageProps": {"planData": {
                "pricing": {"plans": [{"id": "Enterprise-s"}]},
                "models": {"groups": [
                    {"models": [
                        {"name": "deepseek/deepseek-v4.1-flash", "hot": true},
                        "minimax/minimax-m3",
                        "minimax/minimax-m3",
                        "../invalid"
                    ]}
                ]}
            }}}
        });
        let html = format!(
            "<html><script id=\"__NEXT_DATA__\" type=\"application/json\">{page}</script></html>"
        );
        assert_eq!(
            parse_plan_models(&html).unwrap(),
            ["deepseek/deepseek-v4.1-flash", "minimax/minimax-m3"]
        );
        assert!(parse_plan_models("<html></html>").is_err());
    }

    #[test]
    fn token_plan_parser_rejects_unrelated_pricing_page() {
        let page = json!({
            "props": {"pageProps": {"planData": {
                "pricing": {"plans": [{"id": "other"}]},
                "models": {"groups": [{"models": ["minimax/minimax-m3"]}]}
            }}}
        });
        let html = format!("<script id=\"__NEXT_DATA__\">{page}</script>");
        assert!(parse_plan_models(&html).is_err());
    }
}
