/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // Avoid double-mounting client viewers in dev (React Strict Mode), which re-runs effects and
  // loads IFC / WebGL twice — bad UX for heavy Three.js / ThatOpen pipelines.
  reactStrictMode: false,
};

export default nextConfig;
