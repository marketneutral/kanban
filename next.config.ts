import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // document uploads go through server actions
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
