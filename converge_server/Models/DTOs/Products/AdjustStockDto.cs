using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Products
{
    public class AdjustStockDto
    {
        // "In" or "Out" — matches InventoryDirection's member names.
        [Required]
        public string Direction { get; set; } = string.Empty;

        [Required]
        [Range(1, int.MaxValue, ErrorMessage = "Quantity must be at least 1.")]
        public int Quantity { get; set; }

        [MaxLength(300)]
        public string? Reason { get; set; }

        [MaxLength(150)]
        public string? PointPerson { get; set; }

        public DateTime? BorrowedAt { get; set; }

        public DateTime? ReturnedAt { get; set; }
    }
}
