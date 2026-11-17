import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is per-user and dynamic, so Cache Components is intentionally off.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "exceljs", "jspdf", "jspdf-autotable", "bcryptjs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
