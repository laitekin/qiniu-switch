import { invoke } from "@tauri-apps/api/core";

export interface QiniuMarketPrice {
  label: string;
  value: string;
  unit?: string;
  inputRange?: number[];
  outputRange?: number[];
}

export interface QiniuMarketModel {
  id: string;
  apiIds: string[];
  name: string;
  vendor: string;
  vendorIcon?: string;
  icon?: string;
  description?: string;
  capabilities: string[];
  protocols: string[];
  inputModalities: string[];
  outputModalities: string[];
  prices: QiniuMarketPrice[];
  contextWindow?: string;
  maxOutput?: string;
  isNew?: boolean;
  supportsChat: boolean;
  available: boolean;
  retired?: boolean;
  retirementAt?: string;
  detailUrl?: string;
  overview?: string;
  integrationDoc?: string;
  announcement?: string;
  documentationUrl?: string;
}

export interface QiniuMarketCatalog {
  models: QiniuMarketModel[];
  fetchedAt?: string;
  sourceUrl?: string;
}

export interface QiniuTokenPlanCatalog {
  models: string[];
  fetchedAt?: string;
  sourceUrl: string;
}

export const qiniuMarketApi = {
  list: (): Promise<QiniuMarketCatalog> => invoke("qiniu_market_models"),
  tokenPlanModels: (): Promise<QiniuTokenPlanCatalog> =>
    invoke("qiniu_market_token_plan_models"),
  detail: (modelId: string): Promise<QiniuMarketModel> =>
    invoke("qiniu_market_model_detail", { modelId }),
};
