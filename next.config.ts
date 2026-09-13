import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // Try Live and the VM Chrome open http://127.0.0.1:4287 — without this,
  // Next blocks the client bundle / HMR and the start CTA is dead HTML.
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],
};

export default nextConfig;
