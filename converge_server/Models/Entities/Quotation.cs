using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public enum QuotationStatus
    {
        Draft = 0,
        Sent = 1,
        Approved = 2,
        Rejected = 3
    }

    public class Quotation
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string QuotationNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(200)]
        public string QuotationName { get; set; } = string.Empty;

        public string? OriginalPrompt { get; set; }

        // Free-form quotation-level note (terms, delivery remarks, etc.)
        public string? Notes { get; set; }

        [Required]
        public int ClientId { get; set; }

        [ForeignKey(nameof(ClientId))]
        public Client? Client { get; set; }

        [Required]
        public QuotationStatus Status { get; set; } = QuotationStatus.Draft;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [Column(TypeName = "decimal(14,2)")]
        public decimal MaterialsTotal { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal LaborTotal { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal GrandTotal { get; set; }

        // Set once this quotation has been sent to Purchasing
        public Guid? PurchaseRequestId { get; set; }

        [ForeignKey(nameof(PurchaseRequestId))]
        public PurchaseRequest? PurchaseRequest { get; set; }

        public ICollection<QuotationMaterialItem> MaterialItems { get; set; } = new List<QuotationMaterialItem>();
        public ICollection<QuotationLaborItem> LaborItems { get; set; } = new List<QuotationLaborItem>();
    }
}
