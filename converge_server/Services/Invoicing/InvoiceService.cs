using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Invoicing
{
    /* Receivables: what clients have been billed and what they still owe.

       The rule that shapes this service is that PAID IS DERIVED. Nothing sets an
       invoice to Paid directly — recording a payment recalculates the status
       from the sum of payments against the total. A status anyone can set by
       hand will eventually disagree with the money, and "who owes us what" is
       the one question this module exists to answer correctly. */
    public class InvoiceService : IInvoiceService
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;

        public InvoiceService(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
        }

        private async Task<string> NextInvoiceNumberAsync()
        {
            // Same shape as QTN-/PR- so the three document series read alike.
            var year = DateTime.UtcNow.Year;
            var last = await _context.Invoices
                .Where(i => i.InvoiceNumber.StartsWith($"INV-{year}-"))
                .OrderByDescending(i => i.InvoiceNumber)
                .Select(i => i.InvoiceNumber)
                .FirstOrDefaultAsync();

            var next = 1;
            if (!string.IsNullOrEmpty(last) && int.TryParse(last.Split('-').Last(), out var lastSequence))
            {
                next = lastSequence + 1;
            }

            return $"INV-{year}-{next:0000}";
        }

        public async Task<Invoice> CreateFromQuotationAsync(int quotationId, int dueInDays, string actorUsername)
        {
            var quotation = await _context.Quotations
                .Include(q => q.MaterialItems)
                .Include(q => q.LaborItems)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            /* Deliberately no check that the quotation is Approved. Deposits are
               invoiced before a deal formally closes, and refusing would push
               people to record the money somewhere outside the system - which is
               the failure this module exists to prevent. The link to the
               quotation is kept either way, so the two can always be compared. */

            var invoice = new Invoice
            {
                InvoiceNumber = await NextInvoiceNumberAsync(),
                ClientId = quotation.ClientId,
                QuotationId = quotation.Id,
                Status = InvoiceStatus.Draft,
                DueDate = DateTime.UtcNow.Date.AddDays(dueInDays <= 0 ? 30 : dueInDays),
                CreatedBy = actorUsername,
                CreatedAt = DateTime.UtcNow
            };

            var sortOrder = 0;
            decimal subtotal = 0, discount = 0, tax = 0;

            foreach (var line in quotation.MaterialItems.OrderBy(i => i.SortOrder))
            {
                var gross = line.UnitPrice * line.Quantity;
                var lineDiscount = Math.Clamp(line.DiscountAmount, 0m, gross);
                // Tax on the gross, matching how the quotation editor and PDF
                // compute it — an invoice that totals differently from the quote
                // it bills for is a support call.
                var lineTax = gross * line.TaxPercent / 100m;

                subtotal += gross;
                discount += lineDiscount;
                tax += lineTax;

                invoice.Items.Add(new InvoiceItem
                {
                    Description = line.ItemName,
                    Quantity = line.Quantity,
                    Unit = line.Unit,
                    UnitPrice = line.UnitPrice,
                    DiscountAmount = lineDiscount,
                    TaxPercent = line.TaxPercent,
                    LineTotal = gross - lineDiscount + lineTax,
                    SortOrder = sortOrder++
                });
            }

            foreach (var labor in quotation.LaborItems)
            {
                var amount = labor.LineTotal;
                subtotal += amount;

                invoice.Items.Add(new InvoiceItem
                {
                    Description = string.IsNullOrWhiteSpace(labor.Description) ? "Labor" : labor.Description,
                    Quantity = 1,
                    Unit = "lot",
                    UnitPrice = amount,
                    LineTotal = amount,
                    SortOrder = sortOrder++
                });
            }

            invoice.Subtotal = subtotal;
            invoice.DiscountAmount = discount;
            invoice.TaxAmount = tax;
            invoice.Total = subtotal - discount + tax;

            _context.Invoices.Add(invoice);
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Invoice", invoice.Id.ToString(), "Created", actorUsername,
                null, invoice.InvoiceNumber, $"From {quotation.QuotationNumber} - {invoice.Total:N2}");

            return invoice;
        }

        public async Task<Invoice> IssueAsync(int invoiceId, string actorUsername)
        {
            var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == invoiceId);
            if (invoice == null) throw new KeyNotFoundException("Invoice not found.");

            if (invoice.Status != InvoiceStatus.Draft)
            {
                throw new InvalidOperationException("Only a draft invoice can be issued.");
            }

            invoice.Status = InvoiceStatus.Issued;
            invoice.IssuedAt = DateTime.UtcNow;
            invoice.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Invoice", invoice.Id.ToString(), "Issued", actorUsername,
                InvoiceStatus.Draft.ToString(), InvoiceStatus.Issued.ToString(), invoice.InvoiceNumber);

            return invoice;
        }

        public async Task<Invoice> CancelAsync(int invoiceId, string actorUsername)
        {
            var invoice = await _context.Invoices
                .Include(i => i.Payments)
                .FirstOrDefaultAsync(i => i.Id == invoiceId);

            if (invoice == null) throw new KeyNotFoundException("Invoice not found.");

            /* A paid invoice cannot simply be cancelled: money has changed hands
               and cancelling would erase the record of it. Refunding is a
               different transaction, and pretending otherwise loses the trail. */
            if (invoice.Payments.Count > 0)
            {
                throw new InvalidOperationException(
                    "This invoice has payments recorded against it. Reverse the payments first, or raise a credit note.");
            }

            var previous = invoice.Status;
            invoice.Status = InvoiceStatus.Cancelled;
            invoice.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Invoice", invoice.Id.ToString(), "Cancelled", actorUsername,
                previous.ToString(), InvoiceStatus.Cancelled.ToString(), invoice.InvoiceNumber);

            return invoice;
        }

        public async Task<Payment> RecordPaymentAsync(int invoiceId, decimal amount, string? method, string? reference, DateTime? paidAt, string actorUsername)
        {
            var invoice = await _context.Invoices
                .Include(i => i.Payments)
                .FirstOrDefaultAsync(i => i.Id == invoiceId);

            if (invoice == null) throw new KeyNotFoundException("Invoice not found.");

            if (amount <= 0)
            {
                throw new InvalidOperationException("A payment must be greater than zero.");
            }

            if (invoice.Status == InvoiceStatus.Cancelled)
            {
                throw new InvalidOperationException("This invoice was cancelled.");
            }

            if (invoice.Status == InvoiceStatus.Draft)
            {
                throw new InvalidOperationException("Issue the invoice before recording a payment against it.");
            }

            var alreadyPaid = invoice.Payments.Sum(p => p.Amount);
            var outstanding = invoice.Total - alreadyPaid;

            /* Overpayment is refused rather than absorbed. It is nearly always a
               typo (an extra zero, or the same payment entered twice), and a
               silently accepted one turns the receivables total into a number
               nobody can reconcile. */
            if (amount > outstanding)
            {
                throw new InvalidOperationException(
                    $"That is more than the {outstanding:N2} still outstanding on {invoice.InvoiceNumber}.");
            }

            var payment = new Payment
            {
                InvoiceId = invoice.Id,
                Amount = amount,
                Method = string.IsNullOrWhiteSpace(method) ? null : method.Trim(),
                Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
                PaidAt = paidAt ?? DateTime.UtcNow,
                RecordedBy = actorUsername,
                CreatedAt = DateTime.UtcNow
            };

            _context.Payments.Add(payment);

            // Status follows the money, never the other way round.
            var paidAfter = alreadyPaid + amount;
            invoice.Status = paidAfter >= invoice.Total ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
            invoice.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Invoice", invoice.Id.ToString(), "PaymentRecorded", actorUsername,
                alreadyPaid.ToString("N2"), paidAfter.ToString("N2"),
                $"{amount:N2} against {invoice.InvoiceNumber}{(payment.Reference != null ? $" ({payment.Reference})" : "")}");

            return payment;
        }
    }
}
