import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Bypass",
  description:
    "Human-like typing from portal clips and idle-bypass scrolling.",
  version: "1.0.0",
  action: {
    default_popup: "index.html",
    default_title: "Bypass",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/typing.ts", "src/content/scroll.ts"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  permissions: ["storage", "alarms", "scripting", "tabs", "activeTab"],
  host_permissions: ["<all_urls>", "https://*.supabase.co/*"],
});
