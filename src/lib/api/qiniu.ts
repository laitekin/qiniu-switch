import { invoke } from "@tauri-apps/api/core";
import definitions from "@/config/qiniuManagementApi.json";

export interface QiniuParameter {
  name: string;
  required: boolean;
  type: string;
  format?: string;
  options?: string[];
  min?: number;
  max?: number;
}
export interface QiniuEndpoint {
  id: string;
  method: string;
  path: string;
  summary: string;
  available: boolean;
  parameters: QiniuParameter[];
}
export const qiniuEndpoints: QiniuEndpoint[] = definitions;
export const qiniuApi = {
  status: () =>
    invoke<{ configured: boolean; verified?: boolean }>("qiniu_auth_status"),
  connect: (accessKey: string, secretKey: string) =>
    invoke<unknown>("qiniu_auth_connect", { accessKey, secretKey }),
  disconnect: () => invoke<void>("qiniu_auth_disconnect"),
  query: (operation: string, params: Record<string, string>) =>
    invoke<unknown>("qiniu_management_query", { operation, params }),
};

export function defaultQiniuParams(
  endpoint: QiniuEndpoint,
): Record<string, string> {
  const now = new Date();
  const defaults: Record<string, string> = {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    start: new Date(now.getTime() - 7 * 86400000).toISOString(),
    end: now.toISOString(),
    g: "day",
    grain: "day",
    page: "1",
    page_size: "20",
  };
  return Object.fromEntries(
    endpoint.parameters.map((p) => [p.name, defaults[p.name] ?? ""]),
  );
}
