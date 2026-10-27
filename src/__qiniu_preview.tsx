import { createRoot } from "react-dom/client";
import i18n from "./i18n";
import "./index.css";
import { QiniuQueryResult } from "./components/settings/QiniuQueryResult";
i18n.changeLanguage("zh");
const value = {
  status: true,
  data: [
    {
      id: 916575,
      key: "sk-***",
      name: "Default",
      createdAt: "2026-09-11T13:20:39+08:00",
      lastUsed: "2026-09-26",
      enabled: true,
      totalTokens: 37455,
      quota: {
        daily: { used: 1200, limit: 50000 },
        monthly: { used: 37455, limit: 1000000 },
      },
      tags: ["production"],
    },
    {
      id: 923755,
      key: "sk-***",
      name: "Default",
      createdAt: "2026-09-15T15:59:37+08:00",
      lastUsed: "",
      enabled: true,
      totalTokens: 0,
      quota: {},
      tags: [],
    },
  ],
};
createRoot(document.getElementById("root")!).render(
  <main className="p-6 space-y-6">
    <button onClick={() => document.documentElement.classList.toggle("dark")}>
      切换主题
    </button>
    <QiniuQueryResult
      value={value}
      operation="keys"
      checkedAt="2026/9/26 19:01:56"
    />
    <div style={{ width: 360, maxWidth: "100%" }}>
      <QiniuQueryResult
        value={value}
        operation="keys"
        checkedAt="2026/9/26 19:01:56"
      />
    </div>
    <QiniuQueryResult
      value={{ status: true, data: [] }}
      operation="keys"
      checkedAt="2026/9/26 19:01:56"
    />
  </main>,
);
