#!/usr/bin/env node

import { run } from './cli.ts';
import { error } from './display.ts';

try {
  await run(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  error(message);
  process.exitCode = 1;
}
