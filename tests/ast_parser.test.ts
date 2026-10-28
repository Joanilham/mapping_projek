import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AstParser } from '../src/parser/ast_parser.js';

describe('AstParser Unit Tests', () => {
  let tmpDir: string;
  const slug = 'ast-test-proj';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-map-ast-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should parse TypeScript class, methods, and call expressions', () => {
    const parser = new AstParser(tmpDir, slug);
    const code = `
      import { Helper } from './helper';

      export class OrderService {
        async createOrder(data: any) {
          const valid = Helper.validate(data);
          const saved = await this.repo.save(data);
          return saved;
        }
      }
    `;

    const { nodes, edges } = parser.parseFile('src/order.service.ts', code);

    // Assert nodes
    assert.strictEqual(nodes.some(n => n.node_type === 'file'), true);
    assert.strictEqual(nodes.some(n => n.node_type === 'class' && n.name === 'OrderService'), true);
    assert.strictEqual(nodes.some(n => n.node_type === 'method' && n.name === 'OrderService.createOrder'), true);

    // Assert edges
    assert.strictEqual(edges.some(e => e.relation_type === 'DEFINES'), true);
    assert.strictEqual(edges.some(e => e.relation_type === 'CALLS' && e.target_id.includes('save')), true);
    assert.strictEqual(edges.some(e => e.relation_type === 'CALLS' && e.target_id.includes('validate')), true);
  });

  test('should detect controller decorators and extract HTTP endpoints', () => {
    const parser = new AstParser(tmpDir, slug);
    const code = `
      @Controller('/api/users')
      export class UserController {
        @Get('/profile')
        async getProfile() {
          return this.userService.getUser();
        }

        @Post('/create')
        async createUser() {
          return this.userService.create();
        }
      }
    `;

    const { nodes, edges } = parser.parseFile('src/user.controller.ts', code);

    const endpoints = nodes.filter(n => n.node_type === 'endpoint');
    assert.strictEqual(endpoints.length, 2);

    const getEp = endpoints.find(e => e.name === 'GET /api/users/profile');
    assert.notStrictEqual(getEp, undefined);

    const postEp = endpoints.find(e => e.name === 'POST /api/users/create');
    assert.notStrictEqual(postEp, undefined);

    // Check HANDLES_ROUTE edges
    const handleEdges = edges.filter(e => e.relation_type === 'HANDLES_ROUTE');
    assert.strictEqual(handleEdges.length, 2);
    assert.strictEqual(handleEdges.some(e => e.source_id === getEp?.id), true);
  });

  test('should detect Next.js App Router exports in route.ts', () => {
    const parser = new AstParser(tmpDir, slug);
    const code = `
      export async function GET(request: Request) {
        return Response.json({ status: 'ok' });
      }

      export async function POST(request: Request) {
        return Response.json({ created: true });
      }
    `;

    const { nodes, edges } = parser.parseFile('src/app/api/checkout/route.ts', code);

    const endpoints = nodes.filter(n => n.node_type === 'endpoint');
    assert.strictEqual(endpoints.length, 2);
    assert.strictEqual(endpoints.some(e => e.name === 'GET /api/checkout'), true);
    assert.strictEqual(endpoints.some(e => e.name === 'POST /api/checkout'), true);
  });

  test('should extract interfaces as data contracts', () => {
    const parser = new AstParser(tmpDir, slug);
    const code = `
      export interface CreateOrderDto {
        userId: string;
        items: Array<{ productId: string; qty: number }>;
        totalAmount: number;
      }
    `;

    const { nodes, edges } = parser.parseFile('src/dto/order.dto.ts', code);
    const iface = nodes.find(n => n.node_type === 'interface');
    assert.notStrictEqual(iface, undefined);
    assert.strictEqual(iface?.name, 'CreateOrderDto');
  });

  test('should extract arrow functions and deeply chained calls', () => {
    const parser = new AstParser(tmpDir, slug);
    const code = `
      export const processPayment = async (data: any) => {
        const result = await this.orderService.paymentGateway.charge(data);
        return result;
      };
    `;

    const { nodes, edges } = parser.parseFile('src/payment.ts', code);
    const funcNode = nodes.find(n => n.node_type === 'function' && n.name === 'processPayment');

    assert.notStrictEqual(funcNode, undefined);
    assert.strictEqual(funcNode?.name, 'processPayment');

    // Chained callee extracted: "this.orderService.paymentGateway.charge"
    const callEdge = edges.find(e => e.relation_type === 'CALLS');
    assert.notStrictEqual(callEdge, undefined);
    assert.strictEqual(callEdge?.target_id.includes('paymentGateway.charge'), true);
  });

  test('should gracefully handle malformed syntax without throwing', () => {
    const parser = new AstParser(tmpDir, slug);
    const brokenCode = `
      function broken( {
        const x = ;
        return 123
    `;

    // Should not throw!
    const { nodes } = parser.parseFile('src/broken.ts', brokenCode);
    assert.strictEqual(nodes.length >= 1, true);
    assert.strictEqual(nodes[0].node_type, 'file');
  });
});

