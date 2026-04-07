import { IFC_PROXY_CLIENT_MAX_BODY_BYTES } from "./config/ifc-server.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  /**
   * IFC uploads (`POST /api/parse`): Next clones/buffers each request body; default cap is 10MB.
   * Value comes from `config/ifc-server.mjs` — keep in sync with route-side checks there.
   */
  experimental: {
    proxyClientMaxBodySize: IFC_PROXY_CLIENT_MAX_BODY_BYTES,
  },
  // Avoid double-mounting client viewers in dev (React Strict Mode), which re-runs effects and
  // loads IFC / WebGL twice — bad UX for heavy Three.js / ThatOpen pipelines.
  reactStrictMode: false,
};

export default nextConfig;
