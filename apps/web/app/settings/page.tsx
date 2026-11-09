import type { Metadata } from "next";
import { connection } from "next/server";

import { Settings } from "@/features/settings/settings";
import { readSettings } from "@/lib/proxy/read";

export const metadata: Metadata = { title: "Settings" };

const read = async () => {
  await connection();

  const settings = await readSettings();

  return settings.ok
    ? { ...settings.value, problem: null }
    : {
        facts: null,
        problem:
          settings.reason === "HTTP 404"
            ? "broadcom-proxy keeps its settings in ~/.config/broadcom-proxy/config.json. Its cutoffs are on Accounts."
            : `The proxy config didn't load: ${settings.reason}`,
        raw: "",
        values: null,
      };
};

const SettingsPage = async () => <Settings {...await read()} />;

export default SettingsPage;
