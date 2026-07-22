using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public enum InventoryDirection
    {
        In = 0,
        Out = 1
    }

    // One row per stock movement — the IN/OUT ledger for a product. Written
    // exclusively by ProductService.AdjustStockAsync alongside the
    // Product.StockQuantity update it causes.
    public class InventoryTransaction
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public int ProductId { get; set; }

        [ForeignKey(nameof(ProductId))]
        public Product? Product { get; set; }

        [Required]
        public InventoryDirection Direction { get; set; }

        [Required]
        public int Quantity { get; set; }

        // Product.StockQuantity immediately after this transaction — lets the
        // history list show a running balance without recomputing it.
        public int ResultingStock { get; set; }

        [MaxLength(300)]
        public string? Reason { get; set; }

        [Required]
        [MaxLength(50)]
        public string PerformedBy { get; set; } = string.Empty;

        public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    }
}
