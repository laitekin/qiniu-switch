import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  collectMarketVendors,
  MarketVendorSelect,
} from "@/components/marketplace/MarketVendorSelect";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";

const model = (fields: Partial<QiniuMarketModel>): QiniuMarketModel => ({
  id: "model-a",
  name: "Model",
  vendor: "New vendor",
  capabilities: [],
  apiIds: [],
  protocols: [],
  inputModalities: [],
  outputModalities: [],
  prices: [],
  available: true,
  supportsChat: true,
  ...fields,
});

describe("Dynamic marketplace vendors", () => {
  it("aggregates API vendors, prioritizes issuer avatars, and stays stable when API order changes", () => {
    const models = [
      model({ icon: "https://static.qiniu.com/z-model.png" }),
      model({
        id: "model-b",
        vendorIcon: "https://static.qiniu.com/issuer.png",
        icon: "https://static.qiniu.com/a-model.png",
      }),
      model({ id: "model-c", vendor: "Another new vendor" }),
    ];
    const vendors = collectMarketVendors(models);
    expect(vendors).toHaveLength(2);
    expect(
      vendors.find((vendor) => vendor.name === "New vendor")?.icons,
    ).toEqual([
      "https://static.qiniu.com/issuer.png",
      "https://static.qiniu.com/a-model.png",
      "https://static.qiniu.com/z-model.png",
    ]);
    expect(collectMarketVendors([...models].reverse())).toEqual(vendors);
  });

  it("shows API icons in both options and selection and replaces them when refreshed data changes", async () => {
    function Picker({ models }: { models: QiniuMarketModel[] }) {
      const [value, setValue] = useState("");
      return (
        <MarketVendorSelect
          models={models}
          value={value}
          onValueChange={setValue}
        />
      );
    }
    const { rerender } = render(
      <Picker
        models={[model({ vendorIcon: "https://static.qiniu.com/issuer.png" })]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: "New vendor" });
    expect(option.querySelector("img")).toHaveAttribute(
      "src",
      "https://static.qiniu.com/issuer.png",
    );
    await userEvent.click(option);
    await waitFor(() =>
      expect(screen.getByRole("combobox").querySelector("img")).toHaveAttribute(
        "src",
        "https://static.qiniu.com/issuer.png",
      ),
    );
    rerender(
      <Picker
        models={[
          model({ vendorIcon: "https://static.qiniu.com/updated.png" }),
          model({ vendor: "Just added" }),
        ]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox").querySelector("img")).toHaveAttribute(
        "src",
        "https://static.qiniu.com/updated.png",
      ),
    );
    await userEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: "Just added" }),
    ).toBeInTheDocument();
  });

  it("falls back to a model icon then a generic icon, and retries after catalog refresh", async () => {
    const models = [
      model({
        vendorIcon: "https://static.qiniu.com/issuer.png",
        icon: "https://static.qiniu.com/model.png",
      }),
    ];
    const { rerender } = render(
      <MarketVendorSelect
        models={models}
        value=""
        onValueChange={() => {}}
        revision={1}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: "New vendor" });
    fireEvent.error(option.querySelector("img")!);
    expect(option.querySelector("img")).toHaveAttribute(
      "src",
      "https://static.qiniu.com/model.png",
    );
    fireEvent.error(option.querySelector("img")!);
    expect(option.querySelector("img")).toBeNull();
    expect(option.querySelector("svg")).not.toBeNull();
    rerender(
      <MarketVendorSelect
        models={models}
        value=""
        onValueChange={() => {}}
        revision={2}
      />,
    );
    expect(
      screen.getByRole("option", { name: "New vendor" }).querySelector("img"),
    ).toHaveAttribute("src", "https://static.qiniu.com/issuer.png");
  });
});
