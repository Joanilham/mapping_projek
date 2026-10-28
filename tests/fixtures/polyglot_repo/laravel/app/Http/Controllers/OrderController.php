<?php
namespace App\Http\Controllers;

use App\Services\OrderService;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller {
    protected $orderService;

    public function __construct(OrderService $orderService, Request $request) {
        $this->orderService = $orderService;
    }

    public function index() {
        $orders = Order::all();
        foreach ($orders as $order) {
            $items = DB::table('order_items')->where('order_id', $order->id)->get();
        }
        return view('orders.index', compact('orders'));
    }

    public function store(Request $request) {
        $newOrder = Order::create($request->all());
        $id = $_GET['id'];
        $rawSql = "SELECT * FROM orders WHERE id = " . $id;
        DB::statement($rawSql);
        echo $_GET['message'];
        return response()->json($newOrder);
    }
}
