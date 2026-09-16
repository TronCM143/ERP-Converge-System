using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    /* Where an invoice is in its life.

       Paid and PartiallyPaid are NOT set by hand — they are derived from the
       payments recorded against the invoice, because a status someone can type
       will eventually disagree with the money. Overdue is likewise not stored:
       it is Issued plus a due date in the past, and storing it would need a
       nightly job to keep true. */
    public enum InvoiceStatus
    {
        /// <summary>Being prepared. Not owed by anyone yet, and freely editable.</summary>
        Draft = 0,
        /// <summary>Sent to the client. This is when it becomes a receivable.</summary>
        Issued = 1,
        PartiallyPaid = 2,
        Paid = 3,
        Cancelled = 4
    }

    /* A bill to a client — the receivable side the system was missing.

       Quotation → Invoice → Payments closes the loop that previously stopped at
       "won": a deal could be marked Won and booked into the sales figures with
       nothing anywhere recording that the client still owed for it.

       Deliberately its own document rather than a flag on Quotation. One
       quotation can be invoiced in stages (a deposit, then the balance), an
       invoice can be cancelled and reissued without touching the quotation, and
       the amounts can legitimately differ from the quote once the work is done.
       A flag could express none of that. */
    public class Invoice
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string InvoiceNumber { get; set; } = string.Empty;

        [Required]
        public int ClientId { get; set; }

        [ForeignKey(nameof(ClientId))]
        public Client? Client { get; set; }

        /// <summary>The quotation this bills for, when it came from one.</summary>
        public int? QuotationId { get; set; }

        [ForeignKey(nameof(QuotationId))]
        public Quotation? Quotation { get; set; }

        [Required]
        public InvoiceStatus Status { get; set; } = InvoiceStatus.Draft;

        public DateTime? IssuedAt { get; set; }

        /// <summary>When payment is due. What makes an invoice overdue.</summary>
        public DateTime? DueDate { get; set; }

        /* Money, snapshotted at issue. An invoice is a statement of what was
           charged: editing the quotation afterwards must not silently change
           what the client was billed. */
        [Column(TypeName = "decimal(14,2)")]
        public decimal Subtotal { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal DiscountAmount { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal TaxAmount { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal Total { get; set; }

        [MaxLength(2000)]
        public string? Notes { get; set; }

        [MaxLength(50)]
        public string CreatedBy { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
        public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    }

    /// <summary>One billed line. A snapshot, like every other line in this system.</summary>
    public class InvoiceItem
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int InvoiceId { get; set; }

        [ForeignKey(nameof(InvoiceId))]
        public Invoice? Invoice { get; set; }

        [Required]
        [MaxLength(300)]
        public string Description { get; set; } = string.Empty;

        public int Quantity { get; set; } = 1;

        [MaxLength(50)]
        public string Unit { get; set; } = "pcs";

        [Column(TypeName = "decimal(14,2)")]
        public decimal UnitPrice { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal DiscountAmount { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal TaxPercent { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal LineTotal { get; set; }

        public int SortOrder { get; set; }
    }

    /* Money actually received against an invoice.

       A table rather than an AmountPaid column so partial payments work: a
       deposit and a balance are two events with their own dates, references and
       methods, and "who owes us what" is wrong the moment that history is
       flattened into a single number. */
    public class Payment
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int InvoiceId { get; set; }

        [ForeignKey(nameof(InvoiceId))]
        public Invoice? Invoice { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal Amount { get; set; }

        public DateTime PaidAt { get; set; } = DateTime.UtcNow;

        /// <summary>Cash, bank transfer, cheque — free text, not a fixed list.</summary>
        [MaxLength(60)]
        public string? Method { get; set; }

        /// <summary>Cheque number, transfer reference, OR number.</summary>
        [MaxLength(120)]
        public string? Reference { get; set; }

        [MaxLength(50)]
        public string RecordedBy { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
