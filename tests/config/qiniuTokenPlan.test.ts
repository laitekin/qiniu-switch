import { describe, expect, it } from "vitest";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import { isTokenPlanModel, usableModelsForKey } from "@/utils/qiniuTokenPlan";

const model = (
  id: string,
  apiIds: string[],
  fields: Partial<QiniuMarketModel> = {},
) =>
  ({
    id,
    apiIds,
    available: true,
    retired: false,
    ...fields,
  }) as QiniuMarketModel;

describe("Qiniu Token Plan model scope", () => {
  it("matches a published model ID or its catalog alias", () => {
    const item = model("public-id", ["alias-id", "plan-id"]);
    expect(isTokenPlanModel(item, ["plan-id"])).toBe(true);
    expect(isTokenPlanModel(item, ["other-id"])).toBe(false);
  });

  it("intersects the plan, public catalog and key-scoped /v1/models", () => {
    const catalog = [
      model("plan-id", ["plan-id", "plan-alias"]),
      model("payg-id", ["payg-id"]),
      model("retired-id", ["retired-id"], {
        available: false,
        retired: true,
      }),
    ];
    const fetched = [
      { id: "plan-alias", ownedBy: null },
      { id: "payg-id", ownedBy: null },
      { id: "retired-id", ownedBy: null },
      { id: "plan-alias", ownedBy: null },
    ];
    expect(usableModelsForKey(fetched, catalog, "payg", [])).toEqual([
      fetched[0],
      fetched[1],
    ]);
    expect(
      usableModelsForKey(fetched, catalog, "token-plan", ["plan-id"]),
    ).toEqual([fetched[0]]);
    expect(usableModelsForKey(fetched, catalog, "token-plan", [])).toEqual([]);
  });
});
