import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const nextConfig: NextConfig = {
  // The desktop/local build retains its server shell. The Pages build exports
  // the same client-side calculator as static files only.
  output: isGitHubPages ? "export" : undefined,
  trailingSlash: isGitHubPages,
};

export default nextConfig;
