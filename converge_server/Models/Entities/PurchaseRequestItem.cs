using converge_server.Models.Entities;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class PurchaseRequestItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        // Parent Purchase Request
        [Required]
        public Guid PurchaseRequestId { get; set; }

        [ForeignKey(nameof(PurchaseRequestId))]
        public PurchaseRequest? PurchaseRequest { get; set; }

        // Product Catalog (Optional)
        public int? ProductId { get; set; }

        [ForeignKey(nameof(ProductId))]
        public Product? Product { get; set; }

        // Keep ItemName for custom/manual items
        [Required]
        [MaxLength(200)]
        public string ItemName { get; set; } = string.Empty;

        [Required]
        public int Quantity { get; set; }

        [Required]
        [MaxLength(20)]
        public string Unit { get; set; } = "pcs";

        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Pending";
    }
}