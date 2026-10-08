//! Google Antigravity CLI configuration adapter.
//!
//! Antigravity persists CLI preferences in
//! `~/.gemini/antigravity-cli/settings.json`. API credentials are process
//! environment variables; they remain in the Qiniu Switch provider profile and
//! are never copied into an unsupported `.env` file.
use crate::config::{get_home_dir, read_json_file, write_json_file};
use crate::error::AppError;
use serde_json::{json, Value};
use std::path::PathBuf;

pub(crate) fn config_dir() -> PathBuf {
    crate::settings::get_antigravity_override_dir()
        .unwrap_or_else(|| get_home_dir().join(".gemini").join("antigravity-cli"))
}

pub(crate) fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub(crate) fn validate_provider(settings: &Value) -> Result<(), AppError> {
    let root = settings.as_object().ok_or_else(|| {
        AppError::InvalidInput("Antigravity provider configuration must be an object".into())
    })?;
    let provider = root
        .get("settings")
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("modelProvider"))
        .and_then(Value::as_str)
        .unwrap_or("gemini");
    if provider != "gemini" {
        return Err(AppError::InvalidInput(
            "Antigravity CLI currently supports only modelProvider=gemini".into(),
        ));
    }
    let env = root.get("env").and_then(Value::as_object).ok_or_else(|| {
        AppError::InvalidInput("Antigravity provider configuration requires an env object".into())
    })?;
    if env
        .get("GEMINI_API_KEY")
        .and_then(Value::as_str)
        .is_none_or(|value| value.trim().is_empty())
    {
        return Err(AppError::InvalidInput(
            "Antigravity provider configuration requires GEMINI_API_KEY".into(),
        ));
    }
    if let Some(base_url) = env
        .get("GOOGLE_GEMINI_BASE_URL")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        let valid = url::Url::parse(base_url).is_ok_and(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
        });
        if !valid {
            return Err(AppError::InvalidInput(
                "Enter a valid Antigravity Gemini-compatible endpoint".into(),
            ));
        }
    }
    Ok(())
}

pub(crate) fn read_live_settings() -> Result<Value, AppError> {
    let path = settings_path();
    if !path.exists() {
        return Err(AppError::localized(
            "antigravity.config.missing",
            "Antigravity CLI 配置文件不存在",
            "Antigravity CLI settings file not found",
        ));
    }
    let settings: Value = read_json_file(&path)?;
    let model_provider = settings
        .get("modelProvider")
        .and_then(Value::as_str)
        .unwrap_or_default();
    Ok(json!({
        "settings": { "modelProvider": model_provider },
        "env": {}
    }))
}

pub(crate) fn write_provider_live(settings: &Value) -> Result<(), AppError> {
    validate_provider(settings)?;
    let path = settings_path();
    let mut live = if path.exists() {
        read_json_file::<Value>(&path)?
    } else {
        json!({})
    };
    let live_obj = live.as_object_mut().ok_or_else(|| {
        AppError::Config("Antigravity settings.json must contain a JSON object".into())
    })?;
    live_obj.insert("modelProvider".into(), Value::String("gemini".into()));
    if let Some(model) = settings
        .get("env")
        .and_then(Value::as_object)
        .and_then(|env| env.get("GEMINI_MODEL"))
        .and_then(Value::as_str)
        .filter(|model| !model.trim().is_empty())
    {
        // Antigravity's public CLI accepts a persisted model selection. Keep the
        // field sparse and preserve every unrelated preference in settings.json.
        live_obj.insert("model".into(), Value::String(model.to_string()));
    }
    write_json_file(&path, &live)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_documented_gemini_provider_shape() {
        assert!(validate_provider(&json!({
            "settings": { "modelProvider": "gemini" },
            "env": {
                "GEMINI_API_KEY": "test-key",
                "GOOGLE_GEMINI_BASE_URL": "https://example.com"
            }
        }))
        .is_ok());
        assert!(validate_provider(&json!({
            "settings": { "modelProvider": "other" },
            "env": { "GEMINI_API_KEY": "test-key" }
        }))
        .is_err());
    }
}
