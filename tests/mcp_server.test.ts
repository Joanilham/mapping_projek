import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createMcpServer } from '../src/mcp/server.js';
import { SessionManager } from '../src/engine/session_manager.js';

describe('MCP Server Integration Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-mcp-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const server = true;');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should create McpServer instance with registered tools', () => {
    const server = createMcpServer(tmpDir);
    assert.notStrictEqual(server, null);
  });

  test('should interact with SessionManager seamlessly for MCP workflows', () => {
    const manager = new SessionManager(tmpDir);
    manager.initProject();

    // Emulate what save_project_context tool does
    manager.saveModule('payment_core', 'service', 'Core Stripe processing module', ['src/payment.ts'], ['auth']);

    const mod = manager.db.getModule(manager.projectSlug, 'payment_core');
    assert.notStrictEqual(mod, null);
    assert.strictEqual(mod?.module_name, 'payment_core');
    assert.strictEqual(mod?.category, 'service');

    // Emulate what save_session_checkpoint tool does
    const cp = manager.saveCheckpoint('Completed Stripe integration', 'Add webhook listener');
    assert.strictEqual(cp.task_summary, 'Completed Stripe integration');

    // Emulate what bootstrap_project_session tool does
    const digest = manager.getColdStartDigest();
    assert.strictEqual(digest.formatted_prompt.includes('payment_core'), true);
    assert.strictEqual(digest.formatted_prompt.includes('Completed Stripe integration'), true);
  });
});
