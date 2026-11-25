/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ["pg"], serverActions: { bodySizeLimit: "8mb" } },
};
