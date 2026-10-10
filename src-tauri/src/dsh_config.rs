//! DeepSeek Harness Desktop custom-provider adapter.
//! Harness shares `$DSH_HOME` (default `~/.dsh`) between its desktop and CLI.
//! Model routes belong in settings.yaml; secrets belong in .credentials.yaml.

use crate::config::{atomic_write_private, get_home_dir};
use crate::error::AppError;
use serde_json::Value as JsonValue;
use serde_yaml::{Mapping, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

fn key(name: &str) -> Value {
    Value::String(name.to_owned())
}

fn mapping(value: &mut Value) -> Result<&mut Mapping, AppError> {
    value.as_mapping_mut().ok_or_else(|| {
        AppError::Config("DeepSeek Harness configuration must be a YAML mapping".into())
    })
}

fn child<'a>(parent: &'a mut Mapping, name: &str) -> Result<&'a mut Mapping, AppError> {
    let value = parent
        .entry(key(name))
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    mapping(value)
}

fn read(path: &Path) -> Result<Value, AppError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Value::Mapping(Mapping::new()))
        }
        Err(error) => return Err(AppError::io(path, error)),
    };
    serde_yaml::from_str::<Value>(&text)
        .map_err(|_| AppError::Config(format!("Invalid DeepSeek Harness YAML: {}", path.display())))
}

fn write(path: &Path, value: &Value) -> Result<(), AppError> {
    let text = serde_yaml::to_string(value)
        .map_err(|_| AppError::Config("Could not serialize DeepSeek Harness YAML".into()))?;
    atomic_write_private(path, text.as_bytes())
}

pub(crate) fn config_dir() -> PathBuf {
    std::env::var_os("DSH_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| get_home_dir().join(".dsh"))
}

pub(crate) fn settings_path() -> PathBuf {
    config_dir().join("settings.yaml")
}

fn credentials_path() -> PathBuf {
    config_dir().join(".credentials.yaml")
}

fn suffix(provider_id: &str) -> String {
    let hash = Sha256::digest(provider_id.as_bytes());
    hash.iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn route_id(provider_id: &str) -> String {
    format!("qiniu-switch-{}", suffix(provider_id))
}

fn credential_ref(provider_id: &str) -> String {
    format!("QINIU_SWITCH_DSH_{}", suffix(provider_id).to_uppercase())
}

pub(crate) fn validate_provider(config: &JsonValue) -> Result<(), AppError> {
    let url = config
        .pointer("/options/baseURL")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    if !url::Url::parse(url).is_ok_and(|parsed| {
        matches!(parsed.scheme(), "http" | "https") && parsed.host_str().is_some()
    }) {
        return Err(AppError::InvalidInput(
            "Enter a valid Harness endpoint URL".into(),
        ));
    }
    if config
        .pointer("/options/apiKey")
        .and_then(JsonValue::as_str)
        .is_none_or(|value| value.trim().is_empty())
    {
        return Err(AppError::InvalidInput("Enter a Harness API key".into()));
    }
    if config.get("api").and_then(JsonValue::as_str) != Some("openai-completions") {
        return Err(AppError::InvalidInput(
            "Harness integration currently supports OpenAI Chat Completions".into(),
        ));
    }
    if config
        .get("models")
        .and_then(JsonValue::as_object)
        .is_none_or(|models| models.is_empty() || models.keys().any(|id| id.trim().is_empty()))
    {
        return Err(AppError::InvalidInput(
            "Add at least one Harness model".into(),
        ));
    }
    Ok(())
}

fn models(config: &JsonValue) -> Vec<JsonValue> {
    config["models"]
        .as_object()
        .into_iter()
        .flat_map(|models| models.iter())
        .map(|(id, model)| {
            let mut entry = serde_json::json!({
                "id": id,
                "name": model.get("name").and_then(JsonValue::as_str).unwrap_or(id),
            });
            if let Some(context) = model.pointer("/limit/context").and_then(JsonValue::as_u64) {
                entry["contextWindow"] = context.into();
            }
            if let Some(output) = model.pointer("/limit/output").and_then(JsonValue::as_u64) {
                entry["maxTokens"] = output.into();
            }
            if model
                .pointer("/options/supportsImages")
                .and_then(JsonValue::as_bool)
                == Some(true)
            {
                entry["input"] = serde_json::json!(["text", "image"]);
            }
            entry
        })
        .collect()
}

fn set_provider_at(
    settings_path: &Path,
    credentials_path: &Path,
    provider_id: &str,
    config: &JsonValue,
) -> Result<(), AppError> {
    validate_provider(config)?;
    let mut settings = read(settings_path)?;
    let mut credentials = read(credentials_path)?;
    let credentials_root = mapping(&mut credentials)?;
    if let Some(version) = credentials_root.get(&key("version")) {
        if version.as_i64() != Some(1) {
            return Err(AppError::Config(
                "Unsupported Harness credential format".into(),
            ));
        }
    }
    credentials_root.insert(key("version"), Value::Number(1.into()));
    child(credentials_root, "refs")?.insert(
        key(&credential_ref(provider_id)),
        key(config["options"]["apiKey"].as_str().expect("validated key")),
    );
    let route = serde_json::json!({
        "displayName": config.get("name").and_then(JsonValue::as_str).unwrap_or("Qiniu Switch"),
        "apiKeyEnv": credential_ref(provider_id),
        "api": "openai-completions",
        "baseURL": config["options"]["baseURL"],
        "models": models(config),
    });
    let settings_root = mapping(&mut settings)?;
    child(child(settings_root, "llm-pi-ai")?, "providers")?.insert(
        key(&route_id(provider_id)),
        serde_yaml::to_value(route)
            .map_err(|_| AppError::Config("Could not serialize Harness provider".into()))?,
    );
    // First-time setup selects the added model. Editing the active route also
    // updates its model ID, while another provider's default stays untouched.
    let is_current = settings_root
        .get(&key("agent-default-model"))
        .and_then(|value| value.get("provider"))
        .and_then(Value::as_str)
        == Some(route_id(provider_id).as_str());
    if is_current || !settings_root.contains_key(&key("agent-default-model")) {
        let first_model = config["models"]
            .as_object()
            .and_then(|models| models.keys().next());
        if let Some(model) = first_model {
            settings_root.insert(
                key("agent-default-model"),
                serde_yaml::to_value(serde_json::json!({
                    "provider": route_id(provider_id), "model": model
                }))
                .map_err(|_| AppError::Config("Could not serialize Harness model".into()))?,
            );
        }
    }
    // A dangling secret is safer than a route with a missing credential if the
    // second write fails. The next save retries both files.
    write(credentials_path, &credentials)?;
    write(settings_path, &settings)
}

pub(crate) fn set_provider(provider_id: &str, config: &JsonValue) -> Result<(), AppError> {
    set_provider_at(&settings_path(), &credentials_path(), provider_id, config)
}

pub(crate) fn provider_exists(provider_id: &str) -> Result<bool, AppError> {
    let settings = read(&settings_path())?;
    Ok(settings
        .get("llm-pi-ai")
        .and_then(|value| value.get("providers"))
        .and_then(|value| value.get(route_id(provider_id)))
        .is_some())
}

pub(crate) fn read_live_settings() -> Result<JsonValue, AppError> {
    let settings = read(&settings_path())?;
    let routes = settings
        .get("llm-pi-ai")
        .and_then(|value| value.get("providers"))
        .and_then(Value::as_mapping)
        .map(|providers| {
            providers
                .keys()
                .filter_map(Value::as_str)
                .filter(|id| id.starts_with("qiniu-switch-"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(serde_json::json!({ "routes": routes }))
}

pub(crate) fn current_route() -> Result<Option<String>, AppError> {
    let settings = read(&settings_path())?;
    Ok(settings
        .get("agent-default-model")
        .and_then(|value| value.get("provider"))
        .and_then(Value::as_str)
        .map(str::to_owned))
}

fn apply_default_at(path: &Path, provider_id: &str, config: &JsonValue) -> Result<(), AppError> {
    let model = config["models"]
        .as_object()
        .and_then(|models| models.keys().next())
        .ok_or_else(|| AppError::InvalidInput("Add at least one Harness model".into()))?;
    let mut settings = read(path)?;
    let installed = settings
        .get("llm-pi-ai")
        .and_then(|value| value.get("providers"))
        .and_then(|value| value.get(route_id(provider_id)))
        .is_some();
    if !installed {
        return Err(AppError::Config("Harness provider is not installed".into()));
    }
    mapping(&mut settings)?.insert(
        key("agent-default-model"),
        serde_yaml::to_value(serde_json::json!({
            "provider": route_id(provider_id), "model": model
        }))
        .map_err(|_| AppError::Config("Could not serialize Harness model".into()))?,
    );
    write(path, &settings)
}

pub(crate) fn apply_default(provider_id: &str, config: &JsonValue) -> Result<(), AppError> {
    apply_default_at(&settings_path(), provider_id, config)
}

fn remove_provider_at(
    settings_path: &Path,
    credentials_path: &Path,
    provider_id: &str,
) -> Result<(), AppError> {
    if !settings_path.exists() {
        return Ok(());
    }
    let mut settings = read(settings_path)?;
    let mut credentials = read(credentials_path)?;
    let settings_root = mapping(&mut settings)?;
    if let Some(providers) = settings_root
        .get_mut(&key("llm-pi-ai"))
        .and_then(Value::as_mapping_mut)
        .and_then(|llm| llm.get_mut(&key("providers")))
        .and_then(Value::as_mapping_mut)
    {
        providers.remove(&key(&route_id(provider_id)));
    }
    if settings_root
        .get(&key("agent-default-model"))
        .and_then(|value| value.get("provider"))
        .and_then(Value::as_str)
        == Some(route_id(provider_id).as_str())
    {
        settings_root.remove(&key("agent-default-model"));
    }
    if let Some(refs) = mapping(&mut credentials)?
        .get_mut(&key("refs"))
        .and_then(Value::as_mapping_mut)
    {
        refs.remove(&key(&credential_ref(provider_id)));
    }
    write(settings_path, &settings)?;
    if credentials_path.exists() {
        write(credentials_path, &credentials)?;
    }
    Ok(())
}

pub(crate) fn remove_provider(provider_id: &str) -> Result<(), AppError> {
    remove_provider_at(&settings_path(), &credentials_path(), provider_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> JsonValue {
        serde_json::json!({
            "name": "Qiniu", "api": "openai-completions",
            "options": {"baseURL": "https://api.qnaigc.com/v1", "apiKey": "test-secret"},
            "models": {"model-a": {"name": "Model A", "limit": {"context": 128000}}}
        })
    }

    #[test]
    fn writes_only_its_route_and_keeps_secret_out_of_settings() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.yaml");
        let credentials = dir.path().join(".credentials.yaml");
        fs::write(&settings, "ui-theme:\n  preference: dark\nllm-pi-ai:\n  providers:\n    other:\n      baseURL: https://example.com/v1\nagent-default-model:\n  provider: other\n  model: existing\n").unwrap();
        fs::write(&credentials, "version: 1\nrefs:\n  OTHER_KEY: existing-secret\nrecords:\n  example:\n    kind: grant\n").unwrap();
        set_provider_at(&settings, &credentials, "id-1", &example()).unwrap();
        let content = fs::read_to_string(&settings).unwrap();
        assert!(!content.contains("test-secret"));
        assert!(content.contains("other"));
        assert!(content.contains("existing"));
        assert!(fs::read_to_string(&credentials)
            .unwrap()
            .contains("test-secret"));
        remove_provider_at(&settings, &credentials, "id-1").unwrap();
        let content = fs::read_to_string(&settings).unwrap();
        assert!(!content.contains("qiniu-switch-"));
        assert!(content.contains("other"));
        assert!(fs::read_to_string(&credentials)
            .unwrap()
            .contains("OTHER_KEY"));
    }

    #[test]
    fn switches_default_without_removing_other_routes() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.yaml");
        let credentials = dir.path().join(".credentials.yaml");
        set_provider_at(&settings, &credentials, "first", &example()).unwrap();
        set_provider_at(&settings, &credentials, "second", &example()).unwrap();
        let current = read(&settings).unwrap();
        assert_eq!(
            current["agent-default-model"]["provider"].as_str(),
            Some(route_id("first").as_str())
        );
        apply_default_at(&settings, "second", &example()).unwrap();
        let current = read(&settings).unwrap();
        assert_eq!(
            current["agent-default-model"]["provider"].as_str(),
            Some(route_id("second").as_str())
        );
        assert!(current["llm-pi-ai"]["providers"]
            .get(route_id("first"))
            .is_some());
    }
}
