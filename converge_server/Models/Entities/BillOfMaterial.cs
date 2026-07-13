using converge_server.Models.Entities;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class BillOfMaterial
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        // Nullable because BOM can be created manually
        public Guid? PurchaseRequestId { get; set; }

        [ForeignKey(nameof(PurchaseRequestId))]
        public PurchaseRequest? PurchaseRequest { get; set; }

        [Required]
        [MaxLength(100)]
        public string BOMNumber { get; set; } = string.Empty;


        // PurchaseRequest, Manual, Imported
        [Required]
        [MaxLength(100)]
        public string Source { get; set; } = "PurchaseRequest";


        // Draft, Processing, Completed, Cancelled
        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Processing";

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime? UpdatedAt { get; set; }

        public string? Remarks { get; set; }

        // Navigation Property
        public ICollection<BillOfMaterialItem> Items { get; set; } = new List<BillOfMaterialItem>();
    }
}