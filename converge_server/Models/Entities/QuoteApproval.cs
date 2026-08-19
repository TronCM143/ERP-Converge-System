using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public enum QuoteApprovalStatus
    {
        Pending = 0,
        Approved = 1,
        Rejected = 2
    }

    /* One submission cycle of a quotation for engineer sign-off.

       Rejected work is resubmitted as a NEW row rather than by reopening the old
       one, so the set of rows for a quotation IS its approval history — which is
       why there is no separate QuoteApprovalHistory table. Each row already
       carries who submitted, who decided, both timestamps and the reason, and
       the AuditLog records the previous/new status alongside it.

       Deliberately NOT folded into Quotation.Status: that field already means
       "the deal was won/lost" — it drives TotalSales, the won-vs-lost chart and
       the CRM's Won/Lost columns — so an engineer approving a quote would book
       revenue. Approval is a separate axis and lives here. */
    public class QuoteApproval
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int QuotationId { get; set; }

        [ForeignKey(nameof(QuotationId))]
        public Quotation? Quotation { get; set; }

        [Required]
        public QuoteApprovalStatus Status { get; set; } = QuoteApprovalStatus.Pending;

        // Snapshot of the figure that triggered the requirement. Kept because the
        // quotation stays editable: the dashboard has to show what was actually
        // submitted, not what the total has drifted to since.
        [Column(TypeName = "decimal(14,2)")]
        public decimal AmountAtSubmission { get; set; }

        [Required]
        [MaxLength(50)]
        public string SubmittedBy { get; set; } = string.Empty;

        public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

        // Set once decided; null while Pending.
        [MaxLength(50)]
        public string? DecidedBy { get; set; }

        public DateTime? DecidedAt { get; set; }

        // Required by the API when rejecting — sales cannot act on "no".
        [MaxLength(1000)]
        public string? RejectionReason { get; set; }
    }
}
