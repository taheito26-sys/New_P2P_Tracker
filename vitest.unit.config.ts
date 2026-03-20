import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/merchant-deal-delete.test.ts', 'src/test/merchant-deal-status.test.ts'],
  },
});
