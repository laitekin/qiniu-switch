import type { FetchedModel } from "@/lib/api/model-fetch";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";

export type QiniuKeyMode = "payg" | "token-plan";

export function isTokenPlanModel(
  model: Pick<QiniuMarketModel, "id" | "apiIds">,
  planIds: readonly string[],
): boolean {
  const ids = new Set(planIds);
  return ids.has(model.id) || model.apiIds.some((id) => ids.has(id));
}

/** The plan page, public market and the key's /v1/models must all agree. */
export function usableModelsForKey(
  fetched: FetchedModel[],
  catalog: QiniuMarketModel[],
  mode: QiniuKeyMode,
  planIds: readonly string[],
): FetchedModel[] {
  const unavailable = new Set(
    catalog
      .filter((model) => model.retired || !model.available)
      .flatMap((model) => [model.id, ...model.apiIds]),
  );
  const eligible =
    mode === "token-plan"
      ? new Set(
          catalog
            .filter((model) => isTokenPlanModel(model, planIds))
            .flatMap((model) => [model.id, ...model.apiIds]),
        )
      : null;
  return Array.from(
    new Map(
      fetched
        .filter(
          (model) =>
            model.id.trim() &&
            !unavailable.has(model.id) &&
            (!eligible || eligible.has(model.id)),
        )
        .map((model) => [model.id, model]),
    ).values(),
  );
}
