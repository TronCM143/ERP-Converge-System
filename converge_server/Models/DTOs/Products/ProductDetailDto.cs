using System;

namespace converge_server.Models.DTOs.Products
{
    public class ProductDetailDto
    {
        public int Id { get; set; }
        public string Sku { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Subcategory { get; set; } = string.Empty;
        public string Brand { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public string Specs { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? ImageUrl { get; set; }
        public bool ImageSearchAttempted { get; set; }
        public int StockQuantity { get; set; }
        public string? Description { get; set; }
        public string? Manufacturer { get; set; }
        public string? DatasheetUrl { get; set; }
        public string? ProductUrl { get; set; }
    }
}
