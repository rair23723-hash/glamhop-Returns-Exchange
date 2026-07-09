import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
    }
  }
}

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: true,
  },
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
});
