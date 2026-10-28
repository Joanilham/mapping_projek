import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InterproceduralDataFlowTracer } from '../src/engine/data_flow.js';
import { PolyglotAstAdapter } from '../src/parser/polyglot_adapter.js';
import { CodeNode, CodeEdge } from '../src/types/index.js';

describe('TaintAnalysis & PolyglotAdapter Unit Tests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-taint-test-'));

  it('should slice variables, detect sanitizers, and identify database sinks', () => {
    const filePath = 'service.ts';
    const fullPath = path.join(tempDir, filePath);

    const sourceCode = `
      export class CheckoutService {
        public async checkout(req: any) {
          const rawAmount = req.body.amount;
          const cleanAmount = parseInt(rawAmount, 10);
          await this.orderDb.save(cleanAmount);
          return cleanAmount;
        }
      }
    `;
    fs.writeFileSync(fullPath, sourceCode, 'utf-8');

    const tracer = new InterproceduralDataFlowTracer(tempDir);
    const node: CodeNode = {
      id: 'test:service.ts:method:CheckoutService.checkout',
      project_slug: 'test',
      file_path: filePath,
      node_type: 'method',
      name: 'CheckoutService.checkout',
      line_start: 3,
      line_end: 9,
      signature: 'async checkout()'
    };

    const summary = tracer.analyzeFunctionAst(node);

    assert.ok(summary.transitions.length > 0, 'Should detect variable transitions');
    const sanitizedTransition = summary.transitions.find(t => t.toSymbol === 'cleanAmount');
    assert.ok(sanitizedTransition, 'Should track cleanAmount transition');
    assert.strictEqual(sanitizedTransition.sanitized, true, 'cleanAmount should be flagged sanitized');

    const saveBinding = summary.callBindings.find(b => b.calleeName.includes('orderDb.save'));
    assert.ok(saveBinding, 'Should track orderDb.save call binding');
  });

  it('should trace interprocedural taint flow from endpoint to sink', () => {
    const controllerPath = 'controller.ts';
    const fullCtrlPath = path.join(tempDir, controllerPath);
    const ctrlCode = `
      export class OrderController {
        public async postOrder(req: any) {
          const payload = req.body;
          return this.orderService.create(payload);
        }
      }
    `;
    fs.writeFileSync(fullCtrlPath, ctrlCode, 'utf-8');

    const servicePath = 'order_service.ts';
    const fullSvcPath = path.join(tempDir, servicePath);
    const svcCode = `
      export class OrderService {
        public async create(data: any) {
          const valid = validate(data);
          return this.db.save(valid);
        }
      }
    `;
    fs.writeFileSync(fullSvcPath, svcCode, 'utf-8');

    const endpointNode: CodeNode = {
      id: 'test:controller.ts:endpoint:POST_api_orders',
      project_slug: 'test',
      file_path: controllerPath,
      node_type: 'endpoint',
      name: 'POST /api/orders',
      line_start: 3,
      line_end: 7,
      signature: 'POST /api/orders'
    };

    const ctrlMethodNode: CodeNode = {
      id: 'test:controller.ts:method:OrderController.postOrder',
      project_slug: 'test',
      file_path: controllerPath,
      node_type: 'method',
      name: 'OrderController.postOrder',
      line_start: 3,
      line_end: 7,
      signature: 'async postOrder()'
    };

    const svcMethodNode: CodeNode = {
      id: 'test:order_service.ts:method:OrderService.create',
      project_slug: 'test',
      file_path: servicePath,
      node_type: 'method',
      name: 'OrderService.create',
      line_start: 3,
      line_end: 7,
      signature: 'async create()'
    };

    const nodes: CodeNode[] = [endpointNode, ctrlMethodNode, svcMethodNode];
    const edges: CodeEdge[] = [
      {
        id: 'e1',
        project_slug: 'test',
        source_id: endpointNode.id,
        target_id: ctrlMethodNode.id,
        relation_type: 'HANDLES_ROUTE'
      },
      {
        id: 'e2',
        project_slug: 'test',
        source_id: ctrlMethodNode.id,
        target_id: svcMethodNode.id,
        relation_type: 'CALLS',
        metadata: { line: 5, calleeName: 'this.orderService.create' }
      }
    ];

    const tracer = new InterproceduralDataFlowTracer(tempDir);
    const result = tracer.traceInterproceduralFlow(endpointNode, nodes, edges);

    assert.ok(result.steps.length >= 2, 'Should trace at least 2 steps');
    assert.strictEqual(result.is_sanitized_along_path, true, 'Path should be marked sanitized by validate()');
    const sinkStep = result.steps.find(s => s.isSink);
    assert.ok(sinkStep, 'Should detect database sink at the end of the chain');
    assert.strictEqual(sinkStep.sinkType, 'DATABASE_WRITE');
  });

  it('should parse Python and Go files with PolyglotAstAdapter', async () => {
    const adapter = new PolyglotAstAdapter(tempDir, 'polyglot-test');

    const pyCode = `
@app.get("/api/v1/users")
def get_users():
    return db.query("SELECT * FROM users")

class UserService:
    def find_user(self, user_id):
        return self.repo.find(user_id)
    `;

    const pyResult = await adapter.parse('main.py', pyCode);
    assert.ok(pyResult.nodes.some(n => n.node_type === 'endpoint' && n.name === 'GET /api/v1/users'), 'Python endpoint detected');
    assert.ok(pyResult.nodes.some(n => n.node_type === 'class' && n.name === 'UserService'), 'Python class detected');

    const goCode = `
type OrderService struct {
    repo Repository
}

type Repository interface {
    Save(id string) error
}

func (s *OrderService) CreateOrder(id string) {
    s.repo.Save(id)
}
    `;

    const goResult = await adapter.parse('main.go', goCode);
    assert.ok(goResult.nodes.some(n => n.node_type === 'class' && n.name === 'OrderService'), 'Go struct detected');
    assert.ok(goResult.nodes.some(n => n.node_type === 'interface' && n.name === 'Repository'), 'Go interface detected');
    assert.ok(goResult.nodes.some(n => n.node_type === 'method' && n.name === 'OrderService.CreateOrder'), 'Go receiver method detected');
  });
});
