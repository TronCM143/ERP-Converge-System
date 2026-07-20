    using converge_server.Models.Entities;
    using System.ComponentModel.DataAnnotations;

    namespace converge_server.Models.Entities
    {
        public class PurchaseRequest
        {
            [Key]
            public Guid Id { get; set; } = Guid.NewGuid();

            [Required]
            [MaxLength(20)]
            public string PRNumber { get; set; } = string.Empty;

            [Required]
            [MaxLength(150)]
            public string ClientName { get; set; } = string.Empty;

            [Required]
            public string ShippingAddress { get; set; } = string.Empty;

            public DateTime RequestDate { get; set; } = DateTime.Now;

            [Required]
            [MaxLength(20)]
            public string Status { get; set; } = "Pending";

            public string? Remarks { get; set; }

            public DateTime CreatedAt { get; set; } = DateTime.Now;

            public DateTime? UpdatedAt { get; set; }

            // Set when this PR originated from a Quotation sent by the sales team
            public int? QuotationId { get; set; }

            [MaxLength(20)]
            public string? Source { get; set; }

            // Green-dot "unseen" indicator for sales-originated requests; cleared
            // the first time purchasing opens the request.
            public bool IsSeenByPurchasing { get; set; } = false;

            // Whole-request supporting document uploaded by purchasing (e.g. a
            // supplier quote), distinct from the auto-generated submission PDF.
            public string? AttachmentPdfUrl { get; set; }

            public ICollection<PurchaseRequestItem> Items { get; set; } = new List<PurchaseRequestItem>();
            public BillOfMaterial? BillOfMaterial { get; set; }
        }
    }

