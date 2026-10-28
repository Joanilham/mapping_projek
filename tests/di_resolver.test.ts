
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AstParser } from '../src/parser/ast_parser.js';
import { DependencyInjectionResolver } from '../src/engine/di_resolver.js';

describe('DependencyInjectionResolver Unit Tests', () => {
  const projectSlug = 'test-di-project';
  const parser = new AstParser('/fake/workspace', projectSlug);

  it('should resolve interface implementation and rewrite injected property call', () => {
    // 1. Interface file
    const ifaceCode = `
      export interface IOrderRepository {
        save(order: any): Promise<void>;
      }
    `;
    const resIface = parser.parseFile('src/repo/iorder_repo.ts', ifaceCode);

    // 2. Concrete Class implementing interface
    const implCode = `
      export class SqlOrderRepository implements IOrderRepository {
        public async save(order: any): Promise<void> {
          return Promise.resolve();
        }
      }
    `;
    const resImpl = parser.parseFile('src/repo/sql_order_repo.ts', implCode);

    // 3. Service with constructor injection
    const serviceCode = `
      export class OrderService {
        constructor(private readonly orderRepo: IOrderRepository) {}

        public async createOrder(data: any): Promise<void> {
          await this.orderRepo.save(data);
        }
      }
    `;
    const resService = parser.parseFile('src/service/order_service.ts', serviceCode);

    const allNodes = [...resIface.nodes, ...resImpl.nodes, ...resService.nodes];
    const allEdges = [...resIface.edges, ...resImpl.edges, ...resService.edges];

    // Verify raw edges contain IMPLEMENTS, INJECTS, and CALLS
    assert.ok(allEdges.some(e => e.relation_type === 'IMPLEMENTS'), 'Should have IMPLEMENTS edge');
    assert.ok(allEdges.some(e => e.relation_type === 'INJECTS'), 'Should have INJECTS edge');

    // Run DI Resolver
    const resolver = new DependencyInjectionResolver(projectSlug);
    const { edges: resolvedEdges } = resolver.resolve(allNodes, allEdges);

    // Verify RESOLVES_TO edge created
    const resolvesEdge = resolvedEdges.find(e => e.relation_type === 'RESOLVES_TO');
    assert.ok(resolvesEdge, 'Should generate RESOLVES_TO edge');
    assert.strictEqual(resolvesEdge.metadata?.resolutionStrategy, 'implements_clause');

    // Verify CALLS edge was rewired to concrete SqlOrderRepository.save
    const callsEdge = resolvedEdges.find(e => e.relation_type === 'CALLS' && e.metadata?.resolvedViaDI);
    assert.ok(callsEdge, 'Should have CALLS edge resolved via DI');
    assert.strictEqual(callsEdge.metadata?.resolvedClass, 'SqlOrderRepository');
    assert.ok(callsEdge.target_id.includes('SqlOrderRepository.save'));
  });

  it('should support naming convention heuristic fallback when implements clause is omitted', () => {
    const ifaceCode = `
      export interface IPaymentGateway {
        charge(amount: number): Promise<boolean>;
      }
    `;
    const resIface = parser.parseFile('src/payment/ipayment_gateway.ts', ifaceCode);

    const classCode = `
      export class PaymentGateway {
        public async charge(amount: number): Promise<boolean> {
          return true;
        }
      }
    `;
    const resClass = parser.parseFile('src/payment/payment_gateway.ts', classCode);

    const allNodes = [...resIface.nodes, ...resClass.nodes];
    const allEdges = [...resIface.edges, ...resClass.edges];

    const resolver = new DependencyInjectionResolver(projectSlug);
    const { edges: resolvedEdges } = resolver.resolve(allNodes, allEdges);

    const resolvesEdge = resolvedEdges.find(e => e.relation_type === 'RESOLVES_TO');
    assert.ok(resolvesEdge, 'Should generate RESOLVES_TO via naming convention');
    assert.strictEqual(resolvesEdge.metadata?.resolutionStrategy, 'naming_convention_heuristic');
  });
});
