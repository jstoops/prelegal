import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build to static files in out/, served by the FastAPI backend.
  output: "export",
  // Emit /app/index.html rather than /app.html so any static server
  // (FastAPI's StaticFiles included) resolves routes as directories.
  trailingSlash: true,
};

export default nextConfig;
