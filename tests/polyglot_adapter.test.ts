import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { PolyglotAstAdapter } from '../src/parser/polyglot_adapter.js';
import { pluralizeSnakeCase, BraceDepthPrefixStack } from '../src/parser/polyglot_tokenizer_rules.js';

describe('Universal Polyglot AST Adapter & Tokenizer Tests', () => {
  const adapter = new PolyglotAstAdapter('/tmp', 'test-polyglot');

  test('pluralizeSnakeCase helper should correctly convert Model names to plural snake_case', () => {
    assert.strictEqual(pluralizeSnakeCase('User'), 'users');
    assert.strictEqual(pluralizeSnakeCase('OrderItem'), 'order_items');
    assert.strictEqual(pluralizeSnakeCase('UserProfileData'), 'user_profile_datas');
    assert.strictEqual(pluralizeSnakeCase('Category'), 'categories');
    assert.strictEqual(pluralizeSnakeCase('Tax'), 'taxes');
    assert.strictEqual(pluralizeSnakeCase('Address'), 'addresses');
  });

  test('BraceDepthPrefixStack should handle nested route groups and resolve full paths', () => {
    const stack = new BraceDepthPrefixStack();
    assert.strictEqual(stack.resolvePath('/users'), '/users');

    stack.pushPrefix('api');
    stack.onOpenBrace(); // Depth 1: inside api group
    assert.strictEqual(stack.resolvePath('users'), '/api/users');

    stack.pushPrefix('v1');
    stack.onOpenBrace(); // Depth 2: inside api/v1 group
    assert.strictEqual(stack.resolvePath('/orders'), '/api/v1/orders');

    stack.onCloseBrace(); // Exiting v1
    assert.strictEqual(stack.resolvePath('/status'), '/api/status');

    stack.onCloseBrace(); // Exiting api
    assert.strictEqual(stack.resolvePath('/health'), '/health');
  });

  test('should parse PHP Laravel across all 5 Universal Layers with 0 dangling edges', () => {
    const phpCode = `<?php
namespace App\\Http\\Controllers;

use App\\Services\\OrderService;
use App\\Models\\Order;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Route;
use Illuminate\\Support\\Facades\\Schema;

Route::prefix('api/v1')->group(function () {
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', 'OrderController@store');
    Route::resource('products', ProductController::class);
});

class OrderController extends Controller {
    public function __construct(OrderService $orderService, Request $request) {
        $this->orderService = $orderService;
    }

    public function index() {
        $orders = Order::with('items')->get();
        return view('orders.index', compact('orders'));
    }
}

class Order extends Model {
    protected $table = 'customer_orders';

    public function items() {
        return $this->hasMany(OrderItem::class);
    }
}

Schema::create('customer_orders', function ($table) {
    $table->id();
    $table->string('status');
});
`;

    const { nodes, edges } = adapter.parse('routes/api.php', phpCode);

    // Layer 1 (ENTRY) assertions
    const endpoints = nodes.filter(n => n.node_type === 'endpoint');
    assert.ok(endpoints.length >= 3, 'Should extract tuple, string, and resource endpoints');
    assert.ok(endpoints.some(e => e.name === 'GET /api/v1/orders'), 'Nested prefix resolved for GET /api/v1/orders');
    assert.ok(endpoints.some(e => e.name === 'POST /api/v1/orders'), 'Nested prefix resolved for POST /api/v1/orders');
    assert.ok(endpoints.some(e => e.name.includes('RESOURCE /api/v1/products')), 'Resource route mapped');

    // Layer 2 (LOGIC) assertions
    const classes = nodes.filter(n => n.node_type === 'class');
    assert.ok(classes.some(c => c.name === 'OrderController'), 'OrderController class defined');
    const methods = nodes.filter(n => n.node_type === 'method');
    assert.ok(methods.some(m => m.name === 'OrderController.index'), 'OrderController.index method defined');

    // Layer 2 DI assertions
    const injectEdges = edges.filter(e => e.relation_type === 'INJECTS');
    assert.ok(injectEdges.length >= 1, 'Should detect OrderService constructor injection');

    // Layer 3 (MODEL) assertions
    const models = nodes.filter(n => n.node_type === 'model');
    assert.ok(models.some(m => m.name === 'Order'), 'Order model detected');

    // Layer 4 (DB) assertions
    const tableNodes = nodes.filter(n => n.name.startsWith('table:'));
    assert.ok(tableNodes.some(t => t.name === 'table:customer_orders'), 'Schema::create table detected');

    // Layer 5 (VIEW) assertions
    const viewNodes = nodes.filter(n => n.name.startsWith('view:'));
    assert.ok(viewNodes.some(v => v.name === 'view:orders.index'), 'view(orders.index) detected');

    // Referential Integrity Invariant (0 dangling edges)
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of edges) {
      assert.ok(nodeIds.has(edge.source_id), `Dangling edge source: ${edge.source_id}`);
      assert.ok(nodeIds.has(edge.target_id), `Dangling edge target: ${edge.target_id}`);
      assert.strictEqual((edge as any).source, edge.source_id);
      assert.strictEqual((edge as any).target, edge.target_id);
    }
  });

  test('should parse Python FastAPI with Dependency Injection and ORM Relations with 0 dangling edges', () => {
    const pyCode = `
from fastapi import FastAPI, Depends
from sqlalchemy.orm import relationship

app = FastAPI()

class User(Base):
    __tablename__ = "users"
    posts = relationship("Post")

@app.get("/api/v1/users")
async def list_users(svc: UserService = Depends(get_user_service)):
    return svc.get_all_users()

def render_page():
    return render_template("users/index.html")
`;

    const { nodes, edges } = adapter.parse('app/main.py', pyCode);

    // Layer 1 (ENTRY)
    const endpoints = nodes.filter(n => n.node_type === 'endpoint');
    assert.ok(endpoints.some(e => e.name === 'GET /api/v1/users'), 'FastAPI GET /api/v1/users detected');

    // Layer 2 (LOGIC & DI)
    const injectEdges = edges.filter(e => e.relation_type === 'INJECTS');
    assert.ok(injectEdges.length >= 1, 'FastAPI Depends DI detected');

    // Layer 3 (MODEL)
    const models = nodes.filter(n => n.node_type === 'model');
    assert.ok(models.some(m => m.name === 'User'), 'SQLAlchemy User model detected');

    // Layer 5 (VIEW)
    const views = nodes.filter(n => n.name.startsWith('view:'));
    assert.ok(views.some(v => v.name === 'view:users/index.html'), 'render_template detected');

    // Referential Integrity Invariant (0 dangling edges)
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of edges) {
      assert.ok(nodeIds.has(edge.source_id), `Dangling edge source: ${edge.source_id}`);
      assert.ok(nodeIds.has(edge.target_id), `Dangling edge target: ${edge.target_id}`);
    }
  });

  test('should parse Go Gin with Router Groups, Struct Receivers, and Constructor DI with 0 dangling edges', () => {
    const goCode = `
package main

import "github.com/gin-gonic/gin"

type OrderHandler struct {
    service *OrderService
}

func NewOrderHandler(service *OrderService) *OrderHandler {
    return &OrderHandler{service: service}
}

func (h *OrderHandler) ListOrders(c *gin.Context) {
    c.JSON(200, gin.H{"status": "ok"})
}

func SetupRoutes(r *gin.Engine, h *OrderHandler) {
    v1 := r.Group("/api/v1")
    v1.GET("/orders", h.ListOrders)
}
`;

    const { nodes, edges } = adapter.parse('cmd/main.go', goCode);

    // Layer 1 (ENTRY)
    const endpoints = nodes.filter(n => n.node_type === 'endpoint');
    assert.ok(endpoints.some(e => e.name === 'GET /api/v1/orders'), 'Gin route with Group prefix detected');

    // Layer 2 (LOGIC & Constructor DI)
    const structs = nodes.filter(n => n.node_type === 'class');
    assert.ok(structs.some(s => s.name === 'OrderHandler'), 'OrderHandler struct detected');
    const methods = nodes.filter(n => n.node_type === 'method');
    assert.ok(methods.some(m => m.name === 'OrderHandler.ListOrders'), 'Receiver method detected');

    const injectEdges = edges.filter(e => e.relation_type === 'INJECTS');
    assert.ok(injectEdges.length >= 1, 'Constructor NewOrderHandler DI detected');

    // Referential Integrity Invariant (0 dangling edges)
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of edges) {
      assert.ok(nodeIds.has(edge.source_id), `Dangling edge source: ${edge.source_id}`);
      assert.ok(nodeIds.has(edge.target_id), `Dangling edge target: ${edge.target_id}`);
    }
  });
});
