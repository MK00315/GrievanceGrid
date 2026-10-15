import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@grievancegrid/api-client"],
  poweredByHeader: false,
};
export default config;
