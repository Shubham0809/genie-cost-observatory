import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIP_DIRS = new Set([
  '.git',
  '.databricks',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.smoke-test',
  'test-results',
  'playwright-report',
]);

const SKIP_FILES = new Set(['.env', 'package-lock.json']);
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.sql',
  '.yml',
  '.yaml',
  '.md',
  '.json',
  '.example',
  '.css',
  '.html',
]);

const FORBIDDEN = /cmegdemos|fevm-serverless-stable|5bca31361f4af7d2|7474656585748611|dapi[a-zA-Z0-9]{8,}/i;

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry) || entry.startsWith('.env')) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry.endsWith('.spec.ts')) {
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry)) || entry === '.gitignore' || entry === 'app.yaml') {
      files.push(fullPath);
    }
  }
}

describe('source hygiene', () => {
  it('does not embed customer hosts, warehouse IDs, or credentials in reusable source', () => {
    const files: string[] = [];
    walk(process.cwd(), files);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN.test(text)) {
        hits.push(path.relative(process.cwd(), file));
      }
    }
    expect(hits).toEqual([]);
  });
});
