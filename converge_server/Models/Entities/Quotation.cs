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

    /* Where a quotation stands with engineer sign-off. Separate from
       QuotationStatus, which means won/lost — see QuoteApproval for why.

       Denormalised from the newest QuoteApproval row on purpose: the CRM board
       renders every client's card and needs the state per quotation without a
       per-card query, and the stage gate reads it on every drag. Written in the
       same transaction as the approval row it mirrors. */
    public enum QuotationApprovalState
    {
        NotRequired = 0,
        Pending = 1,
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

        [MaxLength(30)]
        public string ServiceRequestNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(200)]
        public string QuotationName { get; set; } = string.Empty;

        public string? OriginalPrompt { get; set; }

        // Free-form quotation-level note (terms, delivery remarks, etc.)
        public string? Notes { get; set; }

        [MaxLength(200)]
        public string? ProjectType { get; set; }

        [MaxLength(200)]
        public string? ProcurementType { get; set; }

        [MaxLength(200)]
        public string? EndorsedBy { get; set; }

        public DateTime? EndorsementDate { get; set; }

        [Required]
        public int ClientId { get; set; }

        [ForeignKey(nameof(ClientId))]
        public Client? Client { get; set; }

        [Required]
        public QuotationStatus Status { get; set; } = QuotationStatus.Draft;

        /* The date this quotation stops being an offer, stamped when it is
           created from the validity period in Settings.

           STORED, not computed from CreatedAt on the way out. The setting is
           allowed to change, and a quote already sent to a client has to keep
           the deadline it was sent with - recalculating would silently move a
           deadline the client is holding us to. Null for quotations raised
           before this existed; the PDF simply omits the line. */
        public DateTime? ValidUntil { get; set; }

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

        [Required]
        public QuotationApprovalState ApprovalState { get; set; } = QuotationApprovalState.NotRequired;

        // Every submission cycle, newest last. Doubles as the approval history.
        public ICollection<QuoteApproval> Approvals { get; set; } = new List<QuoteApproval>();

        public ICollection<QuotationMaterialItem> MaterialItems { get; set; } = new List<QuotationMaterialItem>();
        public ICollection<QuotationLaborItem> LaborItems { get; set; } = new List<QuotationLaborItem>();
    }
}
