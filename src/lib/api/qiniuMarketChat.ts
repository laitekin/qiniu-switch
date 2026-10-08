import { invoke } from "@tauri-apps/api/core";

export interface MarketChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MarketChatResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export function sendMarketChat(
  apiKey: string,
  model: string,
  messages: MarketChatMessage[],
): Promise<MarketChatResponse> {
  return invoke("qiniu_market_chat", { apiKey, model, messages });
}
