//! MaaS management is separate from model API-key/OAuth authentication.
//! User-owned AK/SK come from desktop input or environment variables. They are
//! held in native memory only, never persisted or returned to the webview.
use base64::{engine::general_purpose::URL_SAFE, Engine};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::Sha1;
use std::collections::BTreeMap;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Default)]
enum AuthSource {
    #[default]
    Environment,
    Session(String, String),
    Disconnected,
}

#[derive(Default)]
pub struct QiniuAuthState(Mutex<AuthSource>);

impl AuthSource {
    fn credentials(&self) -> Result<(String, String), String> {
        match self {
            Self::Environment => environment_credentials(),
            Self::Session(ak, sk) => Ok((ak.clone(), sk.clone())),
            Self::Disconnected => Err("qiniu_missing_credentials".into()),
        }
    }
}

#[derive(Deserialize)]
struct Parameter {
    name: String,
    required: bool,
    #[serde(rename = "type")]
    kind: String,
    format: Option<String>,
    options: Option<Vec<String>>,
    min: Option<i64>,
    max: Option<i64>,
}

#[derive(Deserialize)]
struct Endpoint {
    id: String,
    path: String,
    method: String,
    available: bool,
    parameters: Vec<Parameter>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QiniuAuthStatus {
    configured: bool,
    verified: bool,
}

fn environment_credentials() -> Result<(String, String), String> {
    let ak = std::env::var("QINIU_ACCESS_KEY").unwrap_or_default();
    let sk = std::env::var("QINIU_SECRET_KEY").unwrap_or_default();
    if ak.trim().is_empty() || sk.trim().is_empty() {
        return Err("qiniu_missing_credentials".into());
    }
    Ok((ak.trim().to_owned(), sk.trim().to_owned()))
}

#[tauri::command]
pub async fn qiniu_auth_status(
    state: State<'_, QiniuAuthState>,
) -> Result<QiniuAuthStatus, String> {
    let source = state.0.lock().await;
    Ok(auth_status(&source))
}

fn auth_status(source: &AuthSource) -> QiniuAuthStatus {
    QiniuAuthStatus {
        configured: source.credentials().is_ok(),
        verified: matches!(source, AuthSource::Session(_, _)),
    }
}

#[tauri::command]
pub async fn qiniu_auth_connect(
    access_key: String,
    secret_key: String,
    state: State<'_, QiniuAuthState>,
) -> Result<Value, String> {
    let mut source = state.0.lock().await;
    *source = AuthSource::Disconnected;
    let ak = access_key.trim();
    let sk = secret_key.trim();
    if [ak, sk].iter().any(|value| {
        value.is_empty()
            || value.len() > 256
            || !value.is_ascii()
            || value.contains(char::is_whitespace)
    }) {
        return Err("qiniu_invalid_credentials".into());
    }
    let result = management_request("keys", &BTreeMap::new(), ak, sk).await?;
    *source = AuthSource::Session(ak.to_owned(), sk.to_owned());
    Ok(result)
}

#[tauri::command]
pub async fn qiniu_auth_disconnect(state: State<'_, QiniuAuthState>) -> Result<(), String> {
    *state.0.lock().await = AuthSource::Disconnected;
    Ok(())
}

fn query_url(id: &str, params: &BTreeMap<String, String>) -> Result<url::Url, String> {
    let catalog: Vec<Endpoint> =
        serde_json::from_str(include_str!("../../../src/config/qiniuManagementApi.json"))
            .map_err(|_| "qiniu_catalog_invalid")?;
    let endpoint = catalog
        .into_iter()
        .find(|endpoint| endpoint.id == id && endpoint.available && endpoint.method == "GET")
        .ok_or("qiniu_unsupported_operation")?;
    if params
        .keys()
        .any(|key| !endpoint.parameters.iter().any(|p| p.name == *key))
    {
        return Err("qiniu_invalid_parameters".into());
    }
    for p in &endpoint.parameters {
        let value = params.get(&p.name).map(String::as_str).unwrap_or_default();
        if value.is_empty() {
            if p.required {
                return Err("qiniu_invalid_parameters".into());
            }
            continue;
        }
        if value.len() > 2048
            || p.options
                .as_ref()
                .is_some_and(|options| !options.iter().any(|option| option == value))
        {
            return Err("qiniu_invalid_parameters".into());
        }
        if p.kind == "integer" {
            let number = value
                .parse::<i64>()
                .map_err(|_| "qiniu_invalid_parameters")?;
            if p.min.is_some_and(|min| number < min) || p.max.is_some_and(|max| number > max) {
                return Err("qiniu_invalid_parameters".into());
            }
        }
        if p.format.as_deref() == Some("date-time")
            && chrono::DateTime::parse_from_rfc3339(value).is_err()
        {
            return Err("qiniu_invalid_parameters".into());
        }
        if p.name == "month"
            && chrono::NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d").is_err()
        {
            return Err("qiniu_invalid_parameters".into());
        }
    }
    if let (Some(start), Some(end)) = (params.get("start"), params.get("end")) {
        let start =
            chrono::DateTime::parse_from_rfc3339(start).map_err(|_| "qiniu_invalid_parameters")?;
        let end =
            chrono::DateTime::parse_from_rfc3339(end).map_err(|_| "qiniu_invalid_parameters")?;
        if start >= end {
            return Err("qiniu_invalid_parameters".into());
        }
    }
    let mut url = url::Url::parse(&format!("https://api.qiniu.com{}", endpoint.path))
        .map_err(|_| "qiniu_catalog_invalid")?;
    if !params.is_empty() {
        url.query_pairs_mut().extend_pairs(params);
    }
    Ok(url)
}

fn authorization(
    ak: &str,
    sk: &str,
    url: &url::Url,
) -> Result<reqwest::header::HeaderValue, String> {
    let query = url
        .query()
        .map(|query| format!("?{query}"))
        .unwrap_or_default();
    let payload = format!("GET {}{}\nHost: api.qiniu.com\n\n", url.path(), query);
    let mut mac = Hmac::<Sha1>::new_from_slice(sk.as_bytes()).map_err(|_| "qiniu_sign_failed")?;
    mac.update(payload.as_bytes());
    let signature = URL_SAFE.encode(mac.finalize().into_bytes());
    let mut header = reqwest::header::HeaderValue::from_str(&format!("Qiniu {ak}:{signature}"))
        .map_err(|_| "qiniu_sign_failed")?;
    header.set_sensitive(true);
    Ok(header)
}

// A management list may return a full key despite the documented masking.
// Redact it in native code, including nested logs, before crossing IPC.
fn redact(value: &mut Value, ak: &str, sk: &str) {
    static KEY: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"sk-[A-Za-z0-9_-]{8,}").expect("constant regex")
    });
    match value {
        Value::String(text) => {
            *text = KEY
                .replace_all(
                    &text.replace(ak, "[redacted]").replace(sk, "[redacted]"),
                    "sk-***",
                )
                .into_owned();
        }
        Value::Array(items) => items.iter_mut().for_each(|v| redact(v, ak, sk)),
        Value::Object(object) => {
            let mut safe = serde_json::Map::new();
            for (key, mut v) in std::mem::take(object) {
                if matches!(
                    key.to_ascii_lowercase().as_str(),
                    "authorization"
                        | "cookie"
                        | "secretkey"
                        | "secret_key"
                        | "accesskey"
                        | "access_key"
                ) {
                    v = Value::String("[redacted]".into());
                } else {
                    redact(&mut v, ak, sk);
                }
                let mut safe_key = Value::String(key);
                redact(&mut safe_key, ak, sk);
                safe.insert(safe_key.as_str().unwrap().to_owned(), v);
            }
            *object = safe;
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn qiniu_management_query(
    operation: String,
    params: BTreeMap<String, String>,
    state: State<'_, QiniuAuthState>,
) -> Result<Value, String> {
    let mut source = state.0.lock().await;
    let (ak, sk) = source.credentials()?;
    let result = management_request(&operation, &params, &ak, &sk).await;
    if matches!(
        result.as_ref().err().map(String::as_str),
        Some("qiniu_http_401" | "qiniu_http_403")
    ) {
        *source = AuthSource::Disconnected;
    }
    result
}

async fn management_request(
    operation: &str,
    params: &BTreeMap<String, String>,
    ak: &str,
    sk: &str,
) -> Result<Value, String> {
    let url = query_url(operation, params)?;
    let header = authorization(ak, sk, &url)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "qiniu_network_error")?;
    let mut response = client
        .get(url)
        .header(reqwest::header::AUTHORIZATION, header)
        .send()
        .await
        .map_err(|_| "qiniu_network_error")?;
    if !response.status().is_success() {
        return Err(format!("qiniu_http_{}", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "qiniu_network_error")? {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err("qiniu_response_too_large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut result: Value = serde_json::from_slice(&bytes).map_err(|_| "qiniu_invalid_response")?;
    if !result.is_object() && !result.is_array() {
        return Err("qiniu_invalid_response".into());
    }
    if result.get("status") == Some(&Value::Bool(false)) {
        return Err("qiniu_api_error".into());
    }
    if operation == "keys" && !result.get("data").is_some_and(Value::is_array) {
        return Err("qiniu_invalid_response".into());
    }
    redact(&mut result, ak, sk);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn session_status_hides_secrets_and_disconnect_does_not_fall_back() {
        let source = AuthSource::Session("test-access".into(), "test-secret".into());
        let status = serde_json::to_value(auth_status(&source)).unwrap();
        assert_eq!(status, json!({"configured":true,"verified":true}));
        assert!(AuthSource::Disconnected.credentials().is_err());
        assert!(!auth_status(&AuthSource::Disconnected).configured);
    }

    #[test]
    fn signs_exact_path_and_encoded_query_with_padding() {
        let url = query_url("keys", &BTreeMap::new()).unwrap();
        assert_eq!(
            authorization("test-ak", "test-secret", &url)
                .unwrap()
                .to_str()
                .unwrap(),
            "Qiniu test-ak:IxYU577RCTxH_auFeLp5Mq6gwk4="
        );
        let url = query_url(
            "usage",
            &BTreeMap::from([
                ("api_key".into(), "sk-test+a/b".into()),
                ("g".into(), "day".into()),
            ]),
        )
        .unwrap();
        assert_eq!(
            authorization("test-ak", "test-secret", &url)
                .unwrap()
                .to_str()
                .unwrap(),
            "Qiniu test-ak:Hgk6YPKpqtOnPgwx4hofYNKPGuI="
        );
    }

    #[test]
    fn queries_cannot_escape_catalog_or_invoke_writes() {
        assert!(query_url("key_delete", &BTreeMap::new()).is_err());
        assert!(query_url("https://other.test", &BTreeMap::new()).is_err());
        assert!(query_url(
            "keys",
            &BTreeMap::from([("url".into(), "https://other.test".into())])
        )
        .is_err());
        assert!(query_url("bill", &BTreeMap::new()).is_err());
        assert!(query_url(
            "logs",
            &BTreeMap::from([
                ("page".into(), "1".into()),
                ("page_size".into(), "101".into())
            ])
        )
        .is_err());
        assert_eq!(
            query_url(
                "bill",
                &BTreeMap::from([("month".into(), "2026-09".into())])
            )
            .unwrap()
            .as_str(),
            "https://api.qiniu.com/ai/inapi/v3/stat/bill?month=2026-09"
        );
    }

    #[test]
    fn responses_do_not_expose_credentials() {
        let mut value = json!({"key":"sk-123456789abcdef", "nested":[{"Authorization":"Bearer secret", "text":"private-ak private-sk"}]});
        redact(&mut value, "private-ak", "private-sk");
        let text = value.to_string();
        for secret in [
            "123456789abcdef",
            "private-ak",
            "private-sk",
            "Bearer secret",
        ] {
            assert!(!text.contains(secret));
        }
    }
}
