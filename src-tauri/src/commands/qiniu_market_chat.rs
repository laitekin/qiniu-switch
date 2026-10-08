use reqwest::{redirect::Policy, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const CHAT_URL: &str = "https://api.qnaigc.com/v1/chat/completions";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_MESSAGE_CHARS: usize = 16_000;
const MAX_TOTAL_CHARS: usize = 64_000;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
}

#[derive(Deserialize, Serialize)]
pub struct ChatMessage {
    role: ChatRole,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completion_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_tokens: Option<u64>,
}

#[derive(Serialize)]
pub struct ChatResponse {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage: Option<ChatUsage>,
}

fn validate_request(api_key: &str, model: &str, messages: &[ChatMessage]) -> Result<(), String> {
    if !api_key.starts_with("sk-")
        || api_key.len() <= 3
        || api_key.len() > 256
        || !api_key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("QINIU_CHAT_AUTH".into());
    }
    if model.is_empty()
        || model.len() > 200
        || model
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err("QINIU_CHAT_MODEL".into());
    }
    if messages.is_empty() || messages.len() > 20 {
        return Err("QINIU_CHAT_LIMIT".into());
    }
    let mut total = 0;
    for (index, message) in messages.iter().enumerate() {
        if !matches!(
            (&message.role, index % 2),
            (ChatRole::User, 0) | (ChatRole::Assistant, 1)
        ) || message.content.trim().is_empty()
        {
            return Err("QINIU_CHAT_MESSAGES".into());
        }
        let count = message.content.chars().count();
        total += count;
        if count > MAX_MESSAGE_CHARS || total > MAX_TOTAL_CHARS {
            return Err("QINIU_CHAT_LIMIT".into());
        }
    }
    if !matches!(
        messages.last().map(|message| &message.role),
        Some(ChatRole::User)
    ) {
        return Err("QINIU_CHAT_MESSAGES".into());
    }
    Ok(())
}

fn parse_response(body: &[u8]) -> Result<ChatResponse, String> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| "QINIU_CHAT_RESPONSE")?;
    let message = &payload["choices"][0]["message"];
    if message["role"].as_str() != Some("assistant") {
        return Err("QINIU_CHAT_RESPONSE".into());
    }
    let content = message["content"]
        .as_str()
        .filter(|content| {
            !content.trim().is_empty() && content.chars().count() <= MAX_MESSAGE_CHARS
        })
        .ok_or("QINIU_CHAT_RESPONSE")?;
    let usage = payload["usage"].as_object().map(|usage| ChatUsage {
        prompt_tokens: usage.get("prompt_tokens").and_then(Value::as_u64),
        completion_tokens: usage.get("completion_tokens").and_then(Value::as_u64),
        total_tokens: usage.get("total_tokens").and_then(Value::as_u64),
    });
    Ok(ChatResponse {
        content: content.into(),
        usage,
    })
}

/// A user-initiated text preview against Qiniu's fixed model endpoint.
/// Credentials and conversation text are neither persisted nor included in errors.
#[tauri::command(rename_all = "camelCase")]
pub async fn qiniu_market_chat(
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<ChatResponse, String> {
    let api_key = api_key.trim();
    validate_request(api_key, &model, &messages)?;
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "QINIU_CHAT_NETWORK")?;
    let mut response = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": messages,
            "stream": false,
            "max_tokens": 2048,
        }))
        .send()
        .await
        .map_err(|_| "QINIU_CHAT_NETWORK")?;
    match response.status() {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err("QINIU_CHAT_AUTH".into()),
        StatusCode::TOO_MANY_REQUESTS => return Err("QINIU_CHAT_RATE_LIMIT".into()),
        status if !status.is_success() => return Err("QINIU_CHAT_REQUEST".into()),
        _ => {}
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("QINIU_CHAT_RESPONSE".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "QINIU_CHAT_NETWORK")? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("QINIU_CHAT_RESPONSE".into());
        }
        body.extend_from_slice(&chunk);
    }
    parse_response(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn messages(value: Value) -> Vec<ChatMessage> {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn validates_credentials_model_and_message_order_without_echoing_input() {
        let valid = messages(json!([{ "role": "user", "content": "Hello" }]));
        assert!(validate_request("sk-unit-test", "api-model", &valid).is_ok());
        for key in ["", "sk-", "sk-private\r\nCookie: secret", "ak-example"] {
            assert_eq!(
                validate_request(key, "api-model", &valid).unwrap_err(),
                "QINIU_CHAT_AUTH"
            );
        }
        assert_eq!(
            validate_request("sk-test", "bad model", &valid).unwrap_err(),
            "QINIU_CHAT_MODEL"
        );
        assert_eq!(
            validate_request(
                "sk-test",
                "model",
                &messages(json!([{ "role": "assistant", "content": "bad" }]))
            )
            .unwrap_err(),
            "QINIU_CHAT_MESSAGES"
        );
        assert!(serde_json::from_value::<ChatMessage>(
            json!({ "role": "system", "content": "test" })
        )
        .is_err());
    }

    #[test]
    fn bounds_history_and_content() {
        let too_long =
            messages(json!([{ "role": "user", "content": "x".repeat(MAX_MESSAGE_CHARS + 1) }]));
        assert_eq!(
            validate_request("sk-test", "model", &too_long).unwrap_err(),
            "QINIU_CHAT_LIMIT"
        );
        let many = (0..21)
            .map(|index| ChatMessage {
                role: if index % 2 == 0 {
                    ChatRole::User
                } else {
                    ChatRole::Assistant
                },
                content: "text".into(),
            })
            .collect::<Vec<_>>();
        assert_eq!(
            validate_request("sk-test", "model", &many).unwrap_err(),
            "QINIU_CHAT_LIMIT"
        );
        let total = (0..5)
            .map(|index| ChatMessage {
                role: if index % 2 == 0 {
                    ChatRole::User
                } else {
                    ChatRole::Assistant
                },
                content: "x".repeat(MAX_MESSAGE_CHARS),
            })
            .collect::<Vec<_>>();
        assert_eq!(
            validate_request("sk-test", "model", &total).unwrap_err(),
            "QINIU_CHAT_LIMIT"
        );
    }

    #[test]
    fn returns_only_valid_assistant_text_and_numeric_usage() {
        let response = parse_response(br#"{"choices":[{"message":{"role":"assistant","content":"Real answer"}}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5},"private":"hidden"}"#).unwrap();
        assert_eq!(response.content, "Real answer");
        assert_eq!(response.usage.unwrap().total_tokens, Some(5));
        for body in [
            br#"{"error":{"message":"secret reflected by upstream"}}"#.as_slice(),
            br#"{"choices":[{"message":{"role":"assistant","content":null}}]}"#.as_slice(),
            b"not json".as_slice(),
        ] {
            assert!(matches!(parse_response(body), Err(error) if error == "QINIU_CHAT_RESPONSE"));
        }
    }
}
