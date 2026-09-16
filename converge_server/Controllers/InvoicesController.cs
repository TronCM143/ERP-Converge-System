using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* Receivables. Sales raises and issues invoices; admin has the same access
       for oversight and to record payments when sales is not the one banking
       them. */
    [ApiController]
    [Route("api/invoices")]
    [Authorize(Roles = "quotation,admin")]
    public class InvoicesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IInvoiceService _invoiceService;

        public InvoicesController(AppDbContext context, IInvoiceService invoiceService)
        {
            _context = context;
            _invoiceService = invoiceService;
        }

        public class CreateInvoiceDto
        {
            [Required]
            public int QuotationId { get; set; }

            [Range(0, 365)]
            public int DueInDays { get; set; } = 30;
        }

        public class PaymentDto
        {
            [Range(0.01, 999_999_999)]
            public decimal Amount { get; set; }

            [MaxLength(60)]
            public string? Method { get; set; }

            [MaxLength(120)]
            public string? Reference { get; set; }

            public DateTime? PaidAt { get; set; }
        }

        /// <summary>status: all | outstanding | overdue | paid | draft.</summary>
        [HttpGet]
        public async Task<IActionResult> GetInvoices([FromQuery] string status = "all", [FromQuery] int limit = 100)
        {
            limit = Math.Clamp(limit, 1, 500);
            var today = DateTime.UtcNow.Date;

            var query = _context.Invoices
                .AsNoTracking()
                .Include(i => i.Client)
                .Include(i => i.Payments)
                .AsQueryable();

            query = status.ToLowerInvariant() switch
            {
                "draft" => query.Where(i => i.Status == InvoiceStatus.Draft),
                "paid" => query.Where(i => i.Status == InvoiceStatus.Paid),
                // Outstanding is what is actually owed: issued or part-paid, and
                // not cancelled. Draft is not owed by anyone yet.
                "outstanding" => query.Where(i => i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid),
                /* Overdue is derived, not stored — an invoice becomes overdue by
                   the calendar moving, and a stored flag would need a nightly job
                   to stay true. */
                "overdue" => query.Where(i => (i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid)
                                              && i.DueDate != null && i.DueDate < today),
                _ => query
            };

            var rows = await query
                .OrderByDescending(i => i.CreatedAt)
                .Take(limit)
                .Select(i => new
                {
                    i.Id,
                    i.InvoiceNumber,
                    i.ClientId,
                    ClientName = i.Client != null ? i.Client.Name : "",
                    i.QuotationId,
                    QuotationNumber = i.Quotation != null ? i.Quotation.QuotationNumber : null,
                    Status = i.Status.ToString(),
                    i.IssuedAt,
                    i.DueDate,
                    i.Total,
                    AmountPaid = i.Payments.Sum(p => (decimal?)p.Amount) ?? 0m,
                    Outstanding = i.Total - (i.Payments.Sum(p => (decimal?)p.Amount) ?? 0m),
                    IsOverdue = (i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid)
                                && i.DueDate != null && i.DueDate < today,
                    i.CreatedAt
                })
                .ToListAsync();

            return Ok(rows);
        }

        /// <summary>One invoice with its lines and payment history.</summary>
        [HttpGet("{invoiceId:int}")]
        public async Task<IActionResult> GetInvoice(int invoiceId)
        {
            var invoice = await _context.Invoices
                .AsNoTracking()
                .Include(i => i.Client)
                .Include(i => i.Items)
                .Include(i => i.Payments)
                .FirstOrDefaultAsync(i => i.Id == invoiceId);

            if (invoice == null) return NotFound(new { error = "Invoice not found." });

            var paid = invoice.Payments.Sum(p => p.Amount);

            return Ok(new
            {
                invoice.Id,
                invoice.InvoiceNumber,
                invoice.ClientId,
                ClientName = invoice.Client?.Name ?? "",
                invoice.QuotationId,
                Status = invoice.Status.ToString(),
                invoice.IssuedAt,
                invoice.DueDate,
                invoice.Subtotal,
                invoice.DiscountAmount,
                invoice.TaxAmount,
                invoice.Total,
                AmountPaid = paid,
                Outstanding = invoice.Total - paid,
                invoice.Notes,
                Items = invoice.Items.OrderBy(x => x.SortOrder).Select(x => new
                {
                    x.Id, x.Description, x.Quantity, x.Unit, x.UnitPrice,
                    x.DiscountAmount, x.TaxPercent, x.LineTotal
                }),
                Payments = invoice.Payments.OrderByDescending(p => p.PaidAt).Select(p => new
                {
                    p.Id, p.Amount, p.PaidAt, p.Method, p.Reference, p.RecordedBy
                })
            });
        }

        /// <summary>Aging summary — the "who owes us what" headline.</summary>
        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            var today = DateTime.UtcNow.Date;

            var open = await _context.Invoices
                .AsNoTracking()
                .Where(i => i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.PartiallyPaid)
                .Select(i => new
                {
                    i.DueDate,
                    Outstanding = i.Total - (i.Payments.Sum(p => (decimal?)p.Amount) ?? 0m)
                })
                .ToListAsync();

            // Standard aging buckets, measured from the due date.
            decimal Bucket(int fromDays, int? toDays) => open
                .Where(i => i.DueDate != null
                            && (today - i.DueDate.Value.Date).Days >= fromDays
                            && (toDays == null || (today - i.DueDate.Value.Date).Days <= toDays))
                .Sum(i => i.Outstanding);

            return Ok(new
            {
                openCount = open.Count,
                outstandingTotal = open.Sum(i => i.Outstanding),
                notYetDue = open.Where(i => i.DueDate == null || i.DueDate.Value.Date >= today).Sum(i => i.Outstanding),
                overdue1to30 = Bucket(1, 30),
                overdue31to60 = Bucket(31, 60),
                overdue61plus = Bucket(61, null),
                paidThisMonth = await _context.Payments
                    .Where(p => p.PaidAt >= new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc))
                    .SumAsync(p => (decimal?)p.Amount) ?? 0m
            });
        }

        [HttpPost]
        public async Task<IActionResult> CreateInvoice([FromBody] CreateInvoiceDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            try
            {
                var invoice = await _invoiceService.CreateFromQuotationAsync(
                    dto.QuotationId, dto.DueInDays, User.Identity?.Name ?? "sales");
                return Ok(new { invoice.Id, invoice.InvoiceNumber, invoice.Total, Status = invoice.Status.ToString() });
            }
            catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{invoiceId:int}/issue")]
        public async Task<IActionResult> Issue(int invoiceId)
        {
            try
            {
                var invoice = await _invoiceService.IssueAsync(invoiceId, User.Identity?.Name ?? "sales");
                return Ok(new { invoice.Id, Status = invoice.Status.ToString(), invoice.IssuedAt, invoice.DueDate });
            }
            catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{invoiceId:int}/cancel")]
        public async Task<IActionResult> Cancel(int invoiceId)
        {
            try
            {
                var invoice = await _invoiceService.CancelAsync(invoiceId, User.Identity?.Name ?? "sales");
                return Ok(new { invoice.Id, Status = invoice.Status.ToString() });
            }
            catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{invoiceId:int}/payments")]
        public async Task<IActionResult> RecordPayment(int invoiceId, [FromBody] PaymentDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            try
            {
                var payment = await _invoiceService.RecordPaymentAsync(
                    invoiceId, dto.Amount, dto.Method, dto.Reference, dto.PaidAt, User.Identity?.Name ?? "sales");
                return Ok(new { payment.Id, payment.Amount, payment.PaidAt, payment.Reference });
            }
            catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }
    }
}
