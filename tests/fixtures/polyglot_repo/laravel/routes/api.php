<?php
namespace App\Http\Controllers;

use Illuminate\Support\Facades\Route;

Route::prefix('api/v1')->group(function () {
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
});
