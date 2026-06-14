import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages 部署在 https://kevinxiang.github.io/camp-calsh/ 子路径，
  // 构建时需要 base 前缀；本地 dev 用根路径。
  base: process.env.GITHUB_ACTIONS ? '/camp-calsh/' : '/',
  test: {
    globals: true,
    environment: 'node',
  },
});
