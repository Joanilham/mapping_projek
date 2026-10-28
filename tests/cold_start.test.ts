import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryDatabase } from '../src/db/database.js';
import { ColdStartEngine } from '../src/engine/cold_start.js';

describe('ColdStartEngine Unit Tests', () => {
  let tmpDir: string;
  let db: MemoryDatabase;
  const slug = 'cold-start-proj';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-cs-test-'));
    db = new MemoryDatabase(tmpDir);

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.ts'), 'export const app = 1;');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should generate clean cold-start digest with unmapped default', () => {
    const cs = new ColdStartEngine(tmpDir, slug, db);
    const digest = cs.generateDigest();

    assert.strictEqual(digest.project_slug, slug);
    assert.strictEqual(typeof digest.formatted_prompt, 'string');
    assert.strictEqual(digest.formatted_prompt.includes(slug), true);
    assert.strictEqual(digest.delta.totalCount, 1);
    assert.strictEqual(digest.days_since_last_visit, 0);
  });

  test('should incorporate checkpoint and modules into compact prompt', () => {
    db.saveProjectMeta({
      project_slug: slug,
      name: 'E-Commerce Platform',
      system_overview: 'Clean architecture microservice using Express and PostgreSQL',
      rules_and_conventions: 'Use Zod validation for all request payloads'
    });

    db.saveModule({
      project_slug: slug,
      module_name: 'order_service',
      category: 'service',
      summary: 'Manages cart and order workflows',
      key_files: ['src/services/order.ts'],
      dependencies: ['payment_gateway'],
      content_hash: ''
    });

    db.saveCheckpoint({
      project_slug: slug,
      task_summary: 'Completed checkout pipeline',
      next_steps: 'Integrate Stripe Webhooks',
      active_files: ['src/services/order.ts']
    });

    const cs = new ColdStartEngine(tmpDir, slug, db);
    const digest = cs.generateDigest();

    const prompt = digest.formatted_prompt;

    assert.strictEqual(prompt.includes('E-Commerce Platform'), true);
    assert.strictEqual(prompt.includes('Clean architecture microservice'), true);
    assert.strictEqual(prompt.includes('Use Zod validation'), true);
    assert.strictEqual(prompt.includes('Completed checkout pipeline'), true);
    assert.strictEqual(prompt.includes('Integrate Stripe Webhooks'), true);
    assert.strictEqual(prompt.includes('order_service'), true);

    // Verify token efficiency: Word count should be well below 250 words (~350 tokens)
    const wordCount = prompt.split(/\s+/).length;
    assert.strictEqual(wordCount < 250, true, `Prompt is too verbose: ${wordCount} words`);
  });
});
