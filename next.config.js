const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Redirect webpack's filesystem cache out of the project directory so OneDrive
// can't race with it. Symptom we're fixing:
//   [webpack.cache.PackFileCacheStrategy] Caching failed for pack:
//   ENOENT: no such file or directory, stat '.next/cache/webpack/.../*.pack.gz'
// OneDrive sync holds/moves the pack file between webpack's stat and read,
// corrupting the cache. Moving the cache to %TEMP% (outside OneDrive) keeps
// incremental rebuilds fast without the race. Keyed by project path so
// multiple checkouts don't share a cache.
const CACHE_DIR = path.join(
  os.tmpdir(),
  `next-webpack-${crypto.createHash('md5').update(__dirname).digest('hex').slice(0, 8)}`,
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000'] } },
  webpack: (config) => {
    if (config.cache && typeof config.cache === 'object') {
      config.cache.cacheDirectory = CACHE_DIR;
    }
    return config;
  },
};
module.exports = nextConfig;
