package main

import "github.com/gin-gonic/gin"

type ProductHandler struct {
    service *ProductService
}

func NewProductHandler(service *ProductService) *ProductHandler {
    return &ProductHandler{service: service}
}

func (h *ProductHandler) ListProducts(c *gin.Context) {
    c.JSON(200, gin.H{"status": "ok"})
}

func SetupRoutes(r *gin.Engine, h *ProductHandler) {
    v1 := r.Group("/api/v1")
    v1.GET("/products", h.ListProducts)
}
