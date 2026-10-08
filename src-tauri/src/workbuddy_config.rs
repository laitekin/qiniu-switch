//! WorkBuddy custom-model adapter (`~/.workbuddy/models.json`).
use crate::config::{atomic_write_private, get_home_dir};
use crate::error::AppError;
use indexmap::IndexMap;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const OWNER_KEY: &str = "_qiniuSwitch";

pub(crate) fn config_dir() -> PathBuf {
    get_home_dir().join(".workbuddy")
}

pub(crate) fn config_path() -> PathBuf {
    config_dir().join("models.json")
}

fn read(path: &Path) -> Result<Map<String, Value>, AppError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(AppError::io(path, error)),
    };
    let value: Value = serde_json::from_str(&text).map_err(|error| AppError::json(path, error))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::Config("WorkBuddy models.json must contain a JSON object".into()))
}

fn owner_map(root: &Map<String, Value>) -> HashMap<String, Vec<String>> {
    root.get(OWNER_KEY)
        .and_then(|value| value.get("providers"))
        .and_then(Value::as_object)
        .map(|providers| {
            providers
                .iter()
                .map(|(provider, models)| {
                    let models = models
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect();
                    (provider.clone(), models)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn write(
    path: &Path,
    mut root: Map<String, Value>,
    owners: HashMap<String, Vec<String>>,
) -> Result<(), AppError> {
    let models = root
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    root.insert(
        "availableModels".into(),
        Value::Array(
            models
                .iter()
                .filter_map(|model| model.get("id").and_then(Value::as_str))
                .map(|id| Value::String(id.to_string()))
                .collect(),
        ),
    );
    root.insert(OWNER_KEY.into(), json!({ "providers": owners }));
    let mut bytes = serde_json::to_vec_pretty(&Value::Object(root))
        .map_err(|error| AppError::Config(error.to_string()))?;
    bytes.push(b'\n');
    atomic_write_private(path, &bytes)
}

fn completions_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else if url::Url::parse(base).is_ok_and(|url| url.path() != "/" && !url.path().is_empty()) {
        format!("{base}/chat/completions")
    } else {
        format!("{base}/v1/chat/completions")
    }
}

pub(crate) fn validate_provider(provider_id: &str, config: &Value) -> Result<(), AppError> {
    if config
        .get("api")
        .and_then(Value::as_str)
        .is_some_and(|api| api != "openai-completions")
    {
        return Err(AppError::InvalidInput(
            "WorkBuddy only supports OpenAI Chat Completions in this adapter".into(),
        ));
    }
    if provider_id.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "WorkBuddy provider ID is required".into(),
        ));
    }
    let base_url = config
        .pointer("/options/baseURL")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !url::Url::parse(base_url)
        .is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
    {
        return Err(AppError::InvalidInput(
            "Enter a valid WorkBuddy endpoint URL".into(),
        ));
    }
    if config
        .pointer("/options/apiKey")
        .and_then(Value::as_str)
        .is_none_or(|key| key.trim().is_empty())
    {
        return Err(AppError::InvalidInput("Enter a WorkBuddy API key".into()));
    }
    if config
        .get("models")
        .and_then(Value::as_object)
        .is_none_or(|models| models.is_empty() || models.keys().any(|id| id.trim().is_empty()))
    {
        return Err(AppError::InvalidInput(
            "Add at least one WorkBuddy model".into(),
        ));
    }
    Ok(())
}

fn model_entry(id: &str, model: &Value, url: &str, api_key: &str, vendor: &str) -> Value {
    json!({
        "id": id,
        "name": model.get("name").and_then(Value::as_str).unwrap_or(id),
        "vendor": vendor,
        "url": url,
        "apiKey": api_key,
        "maxInputTokens": model.pointer("/limit/context").and_then(Value::as_u64).unwrap_or(128_000),
        "maxOutputTokens": model.pointer("/limit/output").and_then(Value::as_u64).unwrap_or(8_192),
        "temperature": model.pointer("/options/temperature").and_then(Value::as_f64).unwrap_or(0.7),
        "supportsToolCall": model.pointer("/options/supportsToolCall").and_then(Value::as_bool).unwrap_or(true),
        "supportsImages": model.pointer("/options/supportsImages").and_then(Value::as_bool).unwrap_or(false)
    })
}

fn set_provider_at(path: &Path, provider_id: &str, config: Value) -> Result<(), AppError> {
    validate_provider(provider_id, &config)?;
    let mut root = read(path)?;
    let mut owners = owner_map(&root);
    let previous: HashSet<String> = owners
        .get(provider_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    let owned_elsewhere: HashSet<String> = owners
        .iter()
        .filter(|(id, _)| id.as_str() != provider_id)
        .flat_map(|(_, models)| models.iter().cloned())
        .collect();
    let mut models = root
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    models.retain(|model| {
        let id = model.get("id").and_then(Value::as_str).unwrap_or_default();
        !previous.contains(id)
    });

    let configured = config
        .get("models")
        .and_then(Value::as_object)
        .expect("validated models");
    for id in configured.keys() {
        let conflicts = models
            .iter()
            .any(|model| model.get("id").and_then(Value::as_str) == Some(id));
        if conflicts || owned_elsewhere.contains(id) {
            return Err(AppError::Conflict(format!(
                "WorkBuddy model '{id}' already exists"
            )));
        }
    }

    let base_url = config
        .pointer("/options/baseURL")
        .and_then(Value::as_str)
        .expect("validated URL");
    let api_key = config
        .pointer("/options/apiKey")
        .and_then(Value::as_str)
        .expect("validated key");
    let url = completions_url(base_url);
    let vendor = config
        .get("vendor")
        .or_else(|| config.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Custom");
    let ids: Vec<String> = configured.keys().cloned().collect();
    models.extend(
        configured
            .iter()
            .map(|(id, model)| model_entry(id, model, &url, api_key, vendor)),
    );
    root.insert("models".into(), Value::Array(models));
    owners.insert(provider_id.to_string(), ids);
    write(path, root, owners)
}

pub(crate) fn set_provider(provider_id: &str, config: Value) -> Result<(), AppError> {
    set_provider_at(&config_path(), provider_id, config)
}

fn remove_provider_at(path: &Path, provider_id: &str) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    let mut root = read(path)?;
    let mut owners = owner_map(&root);
    let owned: HashSet<String> = owners
        .remove(provider_id)
        .unwrap_or_default()
        .into_iter()
        .collect();
    if let Some(models) = root.get_mut("models").and_then(Value::as_array_mut) {
        models.retain(|model| {
            !model
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| owned.contains(id))
        });
    }
    write(path, root, owners)
}

pub(crate) fn remove_provider(provider_id: &str) -> Result<(), AppError> {
    remove_provider_at(&config_path(), provider_id)
}

pub(crate) fn get_providers() -> Result<IndexMap<String, Value>, AppError> {
    let root = read(&config_path())?;
    let owners = owner_map(&root);
    let models = root
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let by_id: HashMap<String, Value> = models
        .into_iter()
        .filter_map(|model| {
            model
                .get("id")
                .and_then(Value::as_str)
                .map(|id| (id.to_string(), model.clone()))
        })
        .collect();
    let mut providers = IndexMap::new();
    for (provider_id, ids) in owners {
        let selected: Vec<&Value> = ids.iter().filter_map(|id| by_id.get(id)).collect();
        let Some(first) = selected.first() else {
            continue;
        };
        let url = first.get("url").and_then(Value::as_str).unwrap_or_default();
        let base_url = url
            .strip_suffix("/v1/chat/completions")
            .or_else(|| url.strip_suffix("/chat/completions"))
            .unwrap_or(url);
        let mut provider_models = Map::new();
        for model in &selected {
            let Some(id) = model.get("id").and_then(Value::as_str) else {
                continue;
            };
            provider_models.insert(id.into(), json!({
                "name": model.get("name").and_then(Value::as_str).unwrap_or(id),
                "limit": {
                    "context": model.get("maxInputTokens").and_then(Value::as_u64).unwrap_or(128_000),
                    "output": model.get("maxOutputTokens").and_then(Value::as_u64).unwrap_or(8_192)
                },
                "options": {
                    "temperature": model.get("temperature").and_then(Value::as_f64).unwrap_or(0.7),
                    "supportsToolCall": model.get("supportsToolCall").and_then(Value::as_bool).unwrap_or(true),
                    "supportsImages": model.get("supportsImages").and_then(Value::as_bool).unwrap_or(false)
                }
            }));
        }
        providers.insert(provider_id, json!({
            "vendor": first.get("vendor").and_then(Value::as_str).unwrap_or("Custom"),
            "api": "openai-completions",
            "options": { "baseURL": base_url, "apiKey": first.get("apiKey").and_then(Value::as_str).unwrap_or_default() },
            "models": provider_models
        }));
    }
    Ok(providers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_provider_specific_paths_and_rejects_other_protocols() {
        assert_eq!(
            completions_url("https://example.com/"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            completions_url("https://example.com/v1/"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            completions_url("https://example.com/api/paas/v4"),
            "https://example.com/api/paas/v4/chat/completions"
        );
        assert_eq!(
            completions_url("https://example.com/v1/chat/completions"),
            "https://example.com/v1/chat/completions"
        );
        assert!(validate_provider("a", &json!({"api":"anthropic-messages", "options":{"baseURL":"https://example.com", "apiKey":"key"}, "models":{"test":{}}})).is_err());
        let model = model_entry(
            "model",
            &json!({"options":{"supportsImages":true}}),
            "https://example.com/v1/chat/completions",
            "test",
            "DeepSeek",
        );
        assert_eq!(model["vendor"], "DeepSeek");
        assert_eq!(model["supportsImages"], true);
    }

    #[test]
    fn preserves_unmanaged_models_and_removes_only_owned_models() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("models.json");
        fs::write(&path, r#"{"theme":"dark","models":[{"id":"manual","name":"Manual","vendor":"Other"}],"availableModels":["manual"]}"#).unwrap();
        let config = json!({
            "options": {"baseURL":"https://api.qnaigc.com","apiKey":"secret"},
            "models": {"qiniu-model":{"name":"Qiniu Model","limit":{"context":64000,"output":4096}}}
        });
        set_provider_at(&path, "provider-a", config).unwrap();
        let written = read(&path).unwrap();
        assert_eq!(written.get("theme"), Some(&json!("dark")));
        assert_eq!(written.get("models").unwrap().as_array().unwrap().len(), 2);
        assert_eq!(
            written
                .get("models")
                .and_then(Value::as_array)
                .and_then(|models| models.get(1))
                .and_then(|model| model.get("url")),
            Some(&json!("https://api.qnaigc.com/v1/chat/completions"))
        );
        assert_eq!(
            written.get("availableModels"),
            Some(&json!(["manual", "qiniu-model"]))
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        remove_provider_at(&path, "provider-a").unwrap();
        let written = read(&path).unwrap();
        assert_eq!(written.get("models").unwrap().as_array().unwrap().len(), 1);
        assert_eq!(
            written
                .get("models")
                .and_then(Value::as_array)
                .and_then(|models| models.first())
                .and_then(|model| model.get("id")),
            Some(&json!("manual"))
        );
    }
}
