import type { NextConfig } from 'next';

const config: NextConfig = {
  // The engine is a workspace package compiled to ESM in packages/engine/dist.
  transpilePackages: ['@alp/engine'],
};

export default config;
