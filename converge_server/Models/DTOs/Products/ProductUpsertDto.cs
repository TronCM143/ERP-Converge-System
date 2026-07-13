using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Products
{
    public class ProductUpsertDto
    {
        [Required]
        public string Category { get; set; } = string.Empty;

        public string? Subcategory { get; set; }

        [Required]
        public string Brand { get; set; } = string.Empty;

        public string? Model { get; set; }

        [Required]
        public string ProductName { get; set; } = string.Empty;

        public string? Specs { get; set; }

        [Range(0, double.MaxValue)]
        public decimal Price { get; set; }

        public bool IsActive { get; set; } = true;
    }
}
