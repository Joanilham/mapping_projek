import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryDatabase } from '../src/db/database.js';
import { DataFlowTracer } from '../src/engine/data_flow.js';
import { CodeNode, CodeEdge } from '../types/index.js';

describe('DataFlowTracer Unit Tests', () => {
  let tmpDir: string;
  let db: MemoryDatabase;
  const slug = 'data-flow-test-proj';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-flow-test-'));
    db = new MemoryDatabase(tmpDir);

    // Setup a 4-layer architecture:
    // 1. Endpoint: POST /api/orders
    // 2. Controller: OrderController.create
    // 3. Service: OrderService.processPayment
    // 4. Repo: OrderRepo.save

    const nodes: CodeNode[] = [
      {
        id: `${slug}:src/controllers/order.ts:endpoint:POST_/api/orders`,
        project_slug: slug,
        file_path: 'src/controllers/order.ts',
        node_type: 'endpoint',
        name: 'POST /api/orders',
        line_start: 10,
        line_end: 10,
        signature: 'POST /api/orders'
      },
      {
        id: `${slug}:src/controllers/order.ts:method:OrderController.create`,
        project_slug: slug,
        file_path: 'src/controllers/order.ts',
        node_type: 'method',
        name: 'OrderController.create',
        line_start: 11,
        line_end: 20,
        signature: 'async create(req, res)'
      },
      {
        id: `${slug}:src/services/order.ts:method:OrderService.processPayment`,
        project_slug: slug,
        file_path: 'src/services/order.ts',
        node_type: 'method',
        name: 'OrderService.processPayment',
        line_start: 25,
        line_end: 40,
        signature: 'async processPayment(orderData)'
      },
      {
        id: `${slug}:src/repos/order.ts:method:OrderRepo.save`,
        project_slug: slug,
        file_path: 'src/repos/order.ts',
        node_type: 'method',
        name: 'OrderRepo.save',
        line_start: 5,
        line_end: 15,
        signature: 'async save(entity)'
      }
    ];

    const edges: CodeEdge[] = [
      // Endpoint -> Controller
      {
        id: 'e1',
        project_slug: slug,
        source_id: nodes[0].id,
        target_id: nodes[1].id,
        relation_type: 'HANDLES_ROUTE'
      },
      // Controller -> Service
      {
        id: 'e2',
        project_slug: slug,
        source_id: nodes[1].id,
        target_id: nodes[2].id,
        relation_type: 'CALLS'
      },
      // Service -> Repo
      {
        id: 'e3',
        project_slug: slug,
        source_id: nodes[2].id,
        target_id: nodes[3].id,
        relation_type: 'CALLS'
      }
    ];

    db.saveCodeNodes(nodes);
    db.saveCodeEdges(edges);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should trace full data flow from endpoint to database', () => {
    const tracer = new DataFlowTracer(slug, db);
    const endpoints = tracer.findEntryPoints('POST /api/orders');

    assert.strictEqual(endpoints.length, 1);
    const trace = tracer.trace(endpoints[0]);

    assert.strictEqual(trace.total_steps, 4);
    assert.strictEqual(trace.steps[0].node.name, 'POST /api/orders');
    assert.strictEqual(trace.steps[1].node.name, 'OrderController.create');
    assert.strictEqual(trace.steps[2].node.name, 'OrderService.processPayment');
    assert.strictEqual(trace.steps[3].node.name, 'OrderRepo.save');

    // Verify Mermaid sequence diagram is generated
    assert.strictEqual(trace.mermaid_diagram.includes('sequenceDiagram'), true);
    assert.strictEqual(trace.mermaid_diagram.includes('POST /api/orders'), true);
    assert.strictEqual(trace.mermaid_diagram.includes('OrderService.processPayment'), true);
  });

  test('should handle circular dependencies without infinite loop', () => {
    const tracer = new DataFlowTracer(slug, db);
    const endpoints = tracer.findEntryPoints();

    // Add a cycle: Repo -> Controller
    db.saveCodeEdges([
      {
        id: 'cycle_edge',
        project_slug: slug,
        source_id: `${slug}:src/repos/order.ts:method:OrderRepo.save`,
        target_id: `${slug}:src/controllers/order.ts:method:OrderController.create`,
        relation_type: 'CALLS'
      }
    ]);

    // Should complete cleanly without hanging
    const trace = tracer.trace(endpoints[0]);
    assert.strictEqual(trace.total_steps, 4); // Visited set prevents infinite loop
  });
});
