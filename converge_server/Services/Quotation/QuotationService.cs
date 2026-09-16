using converge_server.Data;
using converge_server.Hubs;
using converge_server.Models.DTOs.PurchaseRequest;
using converge_server.Models.DTOs.PurchaseRequestItem;
using converge_server.Models.DTOs.Quotation;
using converge_server.Models.Entities;
using converge_server.Services.Caching;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Quotations
{
    public class QuotationService : IQuotationService
    {
        private readonly AppDbContext _context;
        private readonly IPurchaseRequestService _purchaseRequestService;
        private readonly IHubContext<NotificationHub> _hubContext;
        private readonly IClientService _clientService;
        private readonly INotificationDispatchService _dispatchService;
        private readonly IAuditService _auditService;
        private readonly ICacheService _cache;
        private readonly IEmailSender _emailSender;
        private readonly IWonDealSheetService _wonDealSheetService;
        private readonly ISalesTrackerService _salesTrackerService;
        private readonly IQuotationPdfService _pdfService;
        private readonly IUserNotificationService _userNotificationService;

        public QuotationService(
            AppDbContext context,
            IPurchaseRequestService purchaseRequestService,
            IHubContext<NotificationHub> hubContext,
            IClientService clientService,
            INotificationDispatchService dispatchService,
            IAuditService auditService,
            ICacheService cache,
            IEmailSender emailSender,
            IWonDealSheetService wonDealSheetService,
            ISalesTrackerService salesTrackerService,
            IQuotationPdfService pdfService,
            IUserNotificationService userNotificationService)
        {
            _context = context;
            _purchaseRequestService = purchaseRequestService;
            _hubContext = hubContext;
            _clientService = clientService;
            _dispatchService = dispatchService;
            _auditService = auditService;
            _cache = cache;
            _emailSender = emailSender;
            _wonDealSheetService = wonDealSheetService;
            _salesTrackerService = salesTrackerService;
            _pdfService = pdfService;
            _userNotificationService = userNotificationService;
        }

        /* Quotation validity, from Settings.

           Read per creation rather than cached: quotations are created rarely,
           and an admin who changes the period expects the very next quote to use
           it. Falls back to 30 days when unset or unparseable, which is what the
           system did when the number was compiled in. */
        private async Task<int> GetValidityDaysAsync()
        {
            var row = await _context.AppSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Key == AppSettingKeys.QuotationValidityDays);

            return row != null && int.TryParse(row.Value, out var days) && days > 0 ? days : 30;
        }

        /* The reference the next created quotation would be given:
           QTN-{year}-{sequence}, the sequence restarting each calendar year.

           Ordering by the string works only because the sequence is zero-padded
           to a fixed width — "0010" sorts after "0009". If the padding ever
           changes, this has to become a numeric comparison or the year's 10th
           quotation starts handing out numbers that already exist. */
        public async Task<string> GetNextQuotationNumberAsync()
        {
            var year = DateTime.UtcNow.Year;
            var prefix = $"QTN-{year}-";

            var lastNumber = await _context.Quotations
                .Where(q => q.QuotationNumber.StartsWith(prefix))
                .OrderByDescending(q => q.QuotationNumber)
                .Select(q => q.QuotationNumber)
                .FirstOrDefaultAsync();

            var nextSequence = 1;
            if (!string.IsNullOrEmpty(lastNumber))
            {
                var lastSequenceText = lastNumber.Split('-').Last();
                if (int.TryParse(lastSequenceText, out var lastSequence))
                {
                    nextSequence = lastSequence + 1;
                }
            }

            return $"{prefix}{nextSequence:0000}";
        }

        private async Task<string> GetNextServiceRequestNumberAsync()
        {
            var year = DateTime.UtcNow.ToString("yy");
            var prefix = $"SR-{year}-";
            var lastNumber = await _context.Quotations
                .Where(q => q.ServiceRequestNumber.StartsWith(prefix))
                .OrderByDescending(q => q.ServiceRequestNumber)
                .Select(q => q.ServiceRequestNumber)
                .FirstOrDefaultAsync();

            var nextSequence = 1;
            if (!string.IsNullOrEmpty(lastNumber) &&
                int.TryParse(lastNumber.Split('-').Last(), out var lastSequence))
            {
                nextSequence = lastSequence + 1;
            }

            return $"{prefix}{nextSequence:000}";
        }

        public async Task<Models.Entities.Quotation> CreateQuotationAsync(CreateQuotationDto dto)
        {
            var client = await _context.Clients.FindAsync(dto.ClientId);
            if (client == null)
            {
                throw new InvalidOperationException($"Client {dto.ClientId} was not found.");
            }

            var productIds = dto.MaterialItems.Select(i => i.ProductId).Distinct().ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id);

            var missing = productIds.Where(id => !products.ContainsKey(id)).ToList();
            if (missing.Any())
            {
                throw new InvalidOperationException($"Unknown product id(s): {string.Join(", ", missing)}");
            }

            var quotation = new Models.Entities.Quotation
            {
                /* Same call the editor's header uses to preview this reference.
                   Shared rather than duplicated on purpose: two copies of the
                   sequence rule would eventually disagree, and the one place it
                   would show up is a quotation whose header said one number and
                   whose saved record said another. */
                QuotationNumber = await GetNextQuotationNumberAsync(),
                ServiceRequestNumber = await GetNextServiceRequestNumberAsync(),
                QuotationName = dto.QuotationName,
                ProjectType = string.IsNullOrWhiteSpace(dto.ProjectType) ? null : dto.ProjectType.Trim(),
                ProcurementType = string.IsNullOrWhiteSpace(dto.ProcurementType) ? null : dto.ProcurementType.Trim(),
                OriginalPrompt = dto.OriginalPrompt,
                Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
                EndorsedBy = string.IsNullOrWhiteSpace(dto.EndorsedBy) ? null : dto.EndorsedBy.Trim(),
                EndorsementDate = dto.EndorsementDate?.Date,
                ClientId = client.Id,
                Status = QuotationStatus.Draft,
                /* Stamped from Settings at creation and never recomputed. The
                   admin may change the validity period tomorrow; a quote already
                   in a client's inbox keeps the deadline it was sent with. */
                ValidUntil = DateTime.UtcNow.Date.AddDays(await GetValidityDaysAsync()),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            decimal materialsTotal = 0;
            decimal taxTotal = 0;
            var sortOrder = 0;
            foreach (var itemDto in dto.MaterialItems)
            {
                var product = products[itemDto.ProductId];
                var unitPrice = itemDto.UnitPrice ?? product.Price;
                var gross = unitPrice * itemDto.Quantity;
                // Discount can't exceed the line, or a typo turns into negative
                // revenue that silently reduces the whole quotation.
                var discount = Math.Clamp(itemDto.DiscountAmount, 0m, gross);
                var lineTotal = gross - discount;
                materialsTotal += lineTotal;
                // Tax applies to the DISCOUNTED line, matching how the editor
                // shows it. Previously discount was ignored entirely here.
                taxTotal += lineTotal * itemDto.TaxPercent / 100m;

                quotation.MaterialItems.Add(new QuotationMaterialItem
                {
                    Quotation = quotation,
                    ProductId = product.Id,
                    ItemName = product.ProductName,
                    Specification = itemDto.Note ?? string.Empty,
                    Model = product.Model,
                    /* Snapshot, not a live lookup. A quotation renders what the
                       catalog said when it was generated: editing a product next
                       month must not rewrite a quote already sent, and
                       deactivating one must not blank an old PDF. */
                    Sku = product.Sku,
                    Brand = product.Brand,
                    ImageUrl = product.ImageUrl,
                    DatasheetUrl = product.DatasheetUrl,
                    Manufacturer = product.Manufacturer,
                    UnitCost = product.Cost,
                    Quantity = itemDto.Quantity,
                    Unit = string.IsNullOrWhiteSpace(itemDto.Unit) ? "pcs" : itemDto.Unit,
                    UnitPrice = unitPrice,
                    TaxPercent = itemDto.TaxPercent,
                    DiscountAmount = discount,
                    SortOrder = sortOrder++,
                    LineTotal = lineTotal
                });
            }

            decimal laborTotal = 0;
            var laborSortOrder = 0;
            foreach (var laborDto in dto.LaborItems)
            {
                var lineTotal = laborDto.Days * laborDto.Persons * laborDto.RatePerPersonPerDay;
                laborTotal += lineTotal;

                quotation.LaborItems.Add(new QuotationLaborItem
                {
                    Quotation = quotation,
                    Description = laborDto.Description,
                    Days = laborDto.Days,
                    Persons = laborDto.Persons,
                    RatePerPersonPerDay = laborDto.RatePerPersonPerDay,
                    SortOrder = laborSortOrder++,
                    LineTotal = lineTotal
                });
            }

            quotation.MaterialsTotal = materialsTotal;
            quotation.LaborTotal = laborTotal;
            quotation.GrandTotal = materialsTotal + taxTotal + laborTotal;

            /* CRM stage automation: creating a quotation returns the client to
               Quote, wherever their card was. A new quotation is new business at
               the quoting step, so that is where the board should show it.

               Applies from ANY stage, Won included: a follow-up quotation for an
               existing customer starts a new conversation. The previous deal's
               booked revenue is untouched by this — that lives on the earlier
               quotation's own status, not on the client's stage.

               Deliberately only on CREATE. Editing an existing quotation leaves
               the card alone: approval now moves a card to Proposal
               automatically, and a later edit that yanked it back to Quote would
               force the whole approval round again for no reason. */
            var previousStage = client.Stage;
            var stageChanged = client.Stage != ClientStage.Quote;
            if (stageChanged)
            {
                client.Stage = ClientStage.Quote;
            }

            _context.Quotations.Add(quotation);
            await _context.SaveChangesAsync();
            // Quotation count / auto stage promotion changed the client list.
            await _cache.RemoveAsync(CacheKeys.Clients);

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "Created", "system", null, quotation.QuotationNumber);

            await _salesTrackerService.SyncQuotationAsync(quotation, client);

            /* Audited like any other stage change, so the activity log explains
               why a card moved rather than leaving it looking like someone
               dragged it. Not dispatched as a notification: creating quotations
               is routine, and an email for each one would be noise. */
            if (stageChanged)
            {
                await _auditService.LogAsync("Client", client.Id.ToString(), "StageChanged", "system",
                    previousStage.ToString(), ClientStage.Quote.ToString(),
                    $"Moved to Quote automatically - new quotation {quotation.QuotationNumber}");
            }

            return quotation;
        }

        public async Task<Models.Entities.Quotation> UpdateQuotationAsync(int quotationId, CreateQuotationDto dto, string actorUsername)
        {
            var quotation = await _context.Quotations
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .Include(q => q.LaborItems)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            if (quotation.Status != QuotationStatus.Draft)
            {
                throw new InvalidOperationException("Only draft quotations can be edited.");
            }

            var productIds = dto.MaterialItems.Select(i => i.ProductId).Distinct().ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id);

            var missing = productIds.Where(id => !products.ContainsKey(id)).ToList();
            if (missing.Any())
            {
                throw new InvalidOperationException($"Unknown product id(s): {string.Join(", ", missing)}");
            }

            // Replace items wholesale; the form always submits the full set.
            _context.RemoveRange(quotation.MaterialItems);
            _context.RemoveRange(quotation.LaborItems);
            quotation.MaterialItems.Clear();
            quotation.LaborItems.Clear();

            decimal materialsTotal = 0;
            decimal taxTotal = 0;
            var sortOrder = 0;
            foreach (var itemDto in dto.MaterialItems)
            {
                var product = products[itemDto.ProductId];
                var unitPrice = itemDto.UnitPrice ?? product.Price;
                var gross = unitPrice * itemDto.Quantity;
                // Discount can't exceed the line, or a typo turns into negative
                // revenue that silently reduces the whole quotation.
                var discount = Math.Clamp(itemDto.DiscountAmount, 0m, gross);
                var lineTotal = gross - discount;
                materialsTotal += lineTotal;
                // Tax applies to the DISCOUNTED line, matching how the editor
                // shows it. Previously discount was ignored entirely here.
                taxTotal += lineTotal * itemDto.TaxPercent / 100m;

                quotation.MaterialItems.Add(new QuotationMaterialItem
                {
                    Quotation = quotation,
                    ProductId = product.Id,
                    ItemName = product.ProductName,
                    Specification = itemDto.Note ?? string.Empty,
                    Model = product.Model,
                    /* Snapshot, not a live lookup. A quotation renders what the
                       catalog said when it was generated: editing a product next
                       month must not rewrite a quote already sent, and
                       deactivating one must not blank an old PDF. */
                    Sku = product.Sku,
                    Brand = product.Brand,
                    ImageUrl = product.ImageUrl,
                    DatasheetUrl = product.DatasheetUrl,
                    Manufacturer = product.Manufacturer,
                    UnitCost = product.Cost,
                    Quantity = itemDto.Quantity,
                    Unit = string.IsNullOrWhiteSpace(itemDto.Unit) ? "pcs" : itemDto.Unit,
                    UnitPrice = unitPrice,
                    TaxPercent = itemDto.TaxPercent,
                    DiscountAmount = discount,
                    SortOrder = sortOrder++,
                    LineTotal = lineTotal
                });
            }

            decimal laborTotal = 0;
            var laborSortOrder = 0;
            foreach (var laborDto in dto.LaborItems)
            {
                var lineTotal = laborDto.Days * laborDto.Persons * laborDto.RatePerPersonPerDay;
                laborTotal += lineTotal;

                quotation.LaborItems.Add(new QuotationLaborItem
                {
                    Quotation = quotation,
                    Description = laborDto.Description,
                    Days = laborDto.Days,
                    Persons = laborDto.Persons,
                    RatePerPersonPerDay = laborDto.RatePerPersonPerDay,
                    SortOrder = laborSortOrder++,
                    LineTotal = lineTotal
                });
            }

            /* Closing the obvious bypass: get a cheap quotation approved, then
               edit it upward. Any edit that RAISES an approved total drops it
               back to needing approval; lowering it or editing wording does not,
               since neither increases what the engineer signed off on. */
            var totalBeforeEdit = quotation.GrandTotal;

            quotation.QuotationName = dto.QuotationName;
            quotation.ProjectType = string.IsNullOrWhiteSpace(dto.ProjectType) ? null : dto.ProjectType.Trim();
            quotation.ProcurementType = string.IsNullOrWhiteSpace(dto.ProcurementType) ? null : dto.ProcurementType.Trim();
            quotation.OriginalPrompt = dto.OriginalPrompt;
            quotation.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
            quotation.EndorsedBy = string.IsNullOrWhiteSpace(dto.EndorsedBy) ? null : dto.EndorsedBy.Trim();
            quotation.EndorsementDate = dto.EndorsementDate?.Date;
            quotation.MaterialsTotal = materialsTotal;
            quotation.LaborTotal = laborTotal;
            quotation.GrandTotal = materialsTotal + taxTotal + laborTotal;
            quotation.UpdatedAt = DateTime.UtcNow;

            if (quotation.ApprovalState == QuotationApprovalState.Approved && quotation.GrandTotal > totalBeforeEdit)
            {
                quotation.ApprovalState = QuotationApprovalState.NotRequired;
                await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "ApprovalInvalidated",
                    actorUsername, QuotationApprovalState.Approved.ToString(), QuotationApprovalState.NotRequired.ToString(),
                    $"Total raised from {totalBeforeEdit:N2} to {quotation.GrandTotal:N2} after approval - needs resubmitting");
            }

            await _context.SaveChangesAsync();
            // LastUpdated on the client list is derived from quotation timestamps.
            await _cache.RemoveAsync(CacheKeys.Clients);

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "Updated", actorUsername, null, quotation.QuotationNumber);

            var client = await _context.Clients.FindAsync(quotation.ClientId);
            if (client != null)
            {
                await _salesTrackerService.SyncQuotationAsync(quotation, client);
            }

            return quotation;
        }

        public async Task<IEnumerable<Models.Entities.Quotation>> GetQuotationsAsync(int? clientId = null)
        {
            var query = _context.Quotations
                .Include(q => q.Client)
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .Include(q => q.LaborItems)
                .AsQueryable();

            if (clientId.HasValue)
            {
                query = query.Where(q => q.ClientId == clientId.Value);
            }

            return await query.OrderByDescending(q => q.CreatedAt).ToListAsync();
        }

        public Task<Models.Entities.Quotation?> GetQuotationAsync(int quotationId)
        {
            return _context.Quotations
                .Include(q => q.Client)
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .Include(q => q.LaborItems)
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.Id == quotationId);
        }

        public async Task<PurchaseRequest> SendToPurchasingAsync(int quotationId)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            if (quotation.PurchaseRequestId.HasValue)
            {
                throw new InvalidOperationException("This quotation has already been sent to purchasing.");
            }

            if (!quotation.MaterialItems.Any())
            {
                throw new InvalidOperationException("This quotation has no material items to request.");
            }

            var prDto = new CreatePurchaseRequestDto
            {
                ClientName = quotation.Client!.Name,
                ShippingAddress = quotation.Client.Address,
                Remarks = $"Auto-generated from Quotation {quotation.QuotationNumber}",
                Products = quotation.MaterialItems.Select(i => new CreatePurchaseRequestItemDto
                {
                    ProductId = i.ProductId,
                    ItemName = i.ItemName,
                    Quantity = i.Quantity
                }).ToList()
            };

            var purchaseRequest = await _purchaseRequestService.CreatePurchaseRequestAsync(prDto, source: "Quotation", quotationId: quotation.Id);

            quotation.PurchaseRequestId = purchaseRequest.Id;
            quotation.Status = QuotationStatus.Sent;
            quotation.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "SentToPurchasing", "system", null, purchaseRequest.PRNumber, $"Sent to purchasing as {purchaseRequest.PRNumber}");

            await _hubContext.Clients.Group("purchasing").SendAsync("NewPurchaseRequest", new
            {
                purchaseRequest.Id,
                purchaseRequest.PRNumber,
                purchaseRequest.ClientName,
                ItemCount = purchaseRequest.Items.Count,
                Source = purchaseRequest.Source,
                QuotationNumber = quotation.QuotationNumber
            });

            // Persisted + dropdown-visible version of the same event (the
            // broadcast above only drives the ephemeral popup/bell-dot).
            try
            {
                await _userNotificationService.AddAsync(
                    "purchasing",
                    "NewPurchaseRequest",
                    $"📦 New PR {purchaseRequest.PRNumber} from {quotation.Client.Name}",
                    $"{purchaseRequest.Items.Count} item(s)");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to store/broadcast purchasing notification: {ex.Message}");
            }

            // Notify the purchasing department by email when an address is
            // configured in Settings. (PDF attachment: planned, not built yet.)
            try
            {
                var purchasingEmail = await _context.DepartmentEmails
                    .Where(d => d.Department == "purchasing" && d.Email != null && d.Email != "")
                    .Select(d => d.Email)
                    .FirstOrDefaultAsync();

                if (!string.IsNullOrWhiteSpace(purchasingEmail))
                {
                    var itemsHtml = string.Join("", quotation.MaterialItems.Select(i => $"<li>{i.Quantity} {i.Unit} × {i.ItemName}</li>"));
                    await _emailSender.SendAsync(
                        purchasingEmail,
                        $"New Purchase Request {purchaseRequest.PRNumber} — {quotation.Client.Name}",
                        $"<p>Quotation <strong>{quotation.QuotationNumber}</strong> for client <strong>{quotation.Client.Name}</strong> was sent to purchasing as <strong>{purchaseRequest.PRNumber}</strong>.</p><ul>{itemsHtml}</ul>");
                }
            }
            catch (Exception ex)
            {
                // Email failure must never block the purchasing flow itself.
                Console.WriteLine($"Failed to email purchasing department: {ex.Message}");
            }

            return purchaseRequest;
        }

        public async Task<bool> ApproveAsync(int quotationId, string actorUsername, List<string>? notifyEmails = null)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .Include(q => q.LaborItems)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            if (quotation.Status != QuotationStatus.Sent)
            {
                throw new InvalidOperationException("Only a quotation that has been sent to purchasing can be approved.");
            }

            quotation.Status = QuotationStatus.Approved;
            quotation.UpdatedAt = DateTime.UtcNow;

            var result = await _clientService.PrepareStageChangeAsync(quotation.Client!, ClientStage.Won, actorUsername);
            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "Approved", actorUsername, null, quotation.QuotationNumber);

            var wonSheetSaved = false;
            if (result != null)
            {
                await _auditService.LogAsync("Client", quotation.ClientId.ToString(), "StageChanged", actorUsername, result.OldStage.ToString(), result.NewStage.ToString(), $"Stage changed from {result.OldStage} to {result.NewStage}");
                await _dispatchService.DispatchAsync(NotificationType.StageChanged, "Client Stage Changed", $"Client {quotation.Client!.Name} moved from {result.OldStage} to {result.NewStage}.");

                if (result.EnteredWon)
                {
                    var subject = $"🎉 Deal Won — {quotation.Client!.Name}";
                    var body = $"<p>Quotation <strong>{quotation.QuotationNumber}</strong> from client <strong>{quotation.Client.Name}</strong> was approved and the deal is <strong>WON</strong>! 🎉 The quotation PDF is attached.</p>";
                    var pdfBytes = await _pdfService.GeneratePdfAsync(quotation);
                    var attachment = new EmailAttachment($"{quotation.QuotationNumber}.pdf", pdfBytes, "application/pdf");

                    if (notifyEmails != null)
                    {
                        if (notifyEmails.Count > 0)
                        {
                            await _dispatchService.DispatchToExplicitRecipientsAsync(NotificationType.WonApproval, subject, body, notifyEmails, attachment);
                        }
                        // else: explicitly skipped, no email at all.
                    }
                    else
                    {
                        await _dispatchService.DispatchAsync(NotificationType.WonApproval, subject, body, attachment);
                    }

                    wonSheetSaved = await _wonDealSheetService.AppendWonDealAsync(
                        projectCode: quotation.QuotationNumber,
                        clientName: quotation.Client!.Name,
                        totalSales: quotation.GrandTotal,
                        wonDate: DateTime.UtcNow);
                }
            }

            return wonSheetSaved;
        }

        public async Task RejectAsync(int quotationId, string actorUsername)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            if (quotation.Status != QuotationStatus.Sent)
            {
                throw new InvalidOperationException("Only a quotation that has been sent to purchasing can be rejected.");
            }

            quotation.Status = QuotationStatus.Rejected;
            quotation.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "Rejected", actorUsername, null, quotation.QuotationNumber);
        }

        public async Task<(byte[] Bytes, string FileName)> GenerateQuotationPdfAsync(int quotationId)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .Include(q => q.MaterialItems)
                .Include(q => q.Approvals)
                .Include(q => q.LaborItems)
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            var bytes = await _pdfService.GeneratePdfAsync(quotation);
            return (bytes, $"{quotation.QuotationNumber}.pdf");
        }

        public async Task<int> SendQuotationPdfAsync(int quotationId, List<string> emails, string actorUsername)
        {
            var (bytes, fileName) = await GenerateQuotationPdfAsync(quotationId);
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            var subject = $"Quotation {quotation.QuotationNumber} — {quotation.Client?.Name}";
            var body = $"<p>Please find attached quotation <strong>{quotation.QuotationNumber}</strong> for <strong>{quotation.Client?.Name}</strong>.</p>";
            var attachment = new EmailAttachment(fileName, bytes, "application/pdf");

            var sentCount = 0;
            foreach (var email in emails.Where(e => !string.IsNullOrWhiteSpace(e)).Distinct())
            {
                try
                {
                    await _emailSender.SendAsync(email, subject, body, attachment);
                    sentCount++;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to email quotation PDF to {email}: {ex.Message}");
                }
            }

            await _auditService.LogAsync("Quotation", quotationId.ToString(), "PdfSent", actorUsername, null, $"Sent to {sentCount} recipient(s)");

            return sentCount;
        }
    }
}
