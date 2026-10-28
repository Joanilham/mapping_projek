<?php
use Illuminate\Support\Facades\Schema;

Schema::create('orders', function ($table) {
    $table->id();
    $table->foreignId('user_id');
    $table->foreignId('store_id');
    $table->index('user_id');
});
