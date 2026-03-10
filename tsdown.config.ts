import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  nodeProtocol: true,
  deps: {
    skipNodeModulesBundle: true,
  },
});
