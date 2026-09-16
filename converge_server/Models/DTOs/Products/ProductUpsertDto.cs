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

        /// <summary>What we pay. Null means not known, not zero.</summary>
        [Range(0, double.MaxValue)]
        public decimal? Cost { get; set; }

        public bool IsActive { get; set; } = true;

        // All optional reference data - see Product for why it lives there.
        [MaxLength(2000)]
        public string? Description { get; set; }

        [MaxLength(150)]
        public string? Manufacturer { get; set; }

        [MaxLength(500)]
        public string? DatasheetUrl { get; set; }

        [MaxLength(500)]
        public string? ProductUrl { get; set; }
    }
}
