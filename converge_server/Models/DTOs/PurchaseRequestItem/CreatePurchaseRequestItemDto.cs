using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.PurchaseRequestItem
{
    public class CreatePurchaseRequestItemDto
    {
        // Optional: if 0 or null, item is treated as free-text (not in catalog)
        public int? ProductId { get; set; }

        // Free-text item name (used when ProductId is not set)
        public string? ItemName { get; set; }

        [Required]
        [Range(1, int.MaxValue)]
        public int Quantity { get; set; }
    }
}

