using converge_server.Data;
using converge_server.Models.DTOs.PurchaseRequest;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services
{
    public class PurchaseRequestService : IPurchaseRequestService
    {
        private readonly AppDbContext _context;
        private readonly IBillOfMaterialService _billOfMaterialService;
        private readonly IPurchaseOrderService _purchaseOrderService;
        private readonly IPurchaseRequestPdfService _pdfService;
        private readonly INotificationDispatchService _notificationDispatchService;
        private readonly IAuditService _auditService;

        public PurchaseRequestService(
            AppDbContext context,
            IBillOfMaterialService billOfMaterialService,
            IPurchaseOrderService purchaseOrderService,
            IPurchaseRequestPdfService pdfService,
            INotificationDispatchService notificationDispatchService,
            IAuditService auditService)
        {
            _context = context;
            _billOfMaterialService = billOfMaterialService;
            _purchaseOrderService = purchaseOrderService;
            _pdfService = pdfService;
            _notificationDispatchService = notificationDispatchService;
            _auditService = auditService;
        }

        public async Task<PurchaseRequest> CreatePurchaseRequestAsync(CreatePurchaseRequestDto dto, string source = "Manual", int? quotationId = null)
        {
            if (dto == null)
            {
                throw new ArgumentNullException(nameof(dto));
            }

            using var transaction = await _context.Database.BeginTransactionAsync();

            var year = DateTime.UtcNow.Year;
            var lastPrNumber = await _context.PurchaseRequests
                .Where(pr => pr.PRNumber.StartsWith($"PR-{year}-"))
                .OrderByDescending(pr => pr.PRNumber)
                .Select(pr => pr.PRNumber)
                .FirstOrDefaultAsync();

            var nextSequence = 1;
            if (!string.IsNullOrEmpty(lastPrNumber))
            {
                var lastSequenceText = lastPrNumber.Split('-').Last();
                if (int.TryParse(lastSequenceText, out var lastSequence))
                {
                    nextSequence = lastSequence + 1;
                }
            }

            var purchaseRequest = new PurchaseRequest
            {
                PRNumber = $"PR-{year}-{nextSequence:000000}",
                ClientName = dto.ClientName,
                ShippingAddress = dto.ShippingAddress,
                Remarks = dto.Remarks,
                Status = "Pending",
                RequestDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Source = source,
                QuotationId = quotationId
            };

            // Preload catalog products for matched items only
            var catalogProductIds = dto.Products
                .Where(p => p.ProductId.HasValue && p.ProductId.Value > 0)
                .Select(p => p.ProductId!.Value)
                .Distinct()
                .ToList();

            var products = catalogProductIds.Any()
                ? await _context.Products
                    .Where(product => catalogProductIds.Contains(product.Id))
                    .ToDictionaryAsync(product => product.Id)
                : new Dictionary<int, Product>();

            foreach (var itemDto in dto.Products)
            {
                string resolvedName;
                int? resolvedProductId = null;

                if (itemDto.ProductId.HasValue && itemDto.ProductId.Value > 0
                    && products.TryGetValue(itemDto.ProductId.Value, out var matchedProduct))
                {
                    // Matched from catalog
                    resolvedName = matchedProduct.ProductName;
                    resolvedProductId = matchedProduct.Id;
                }
                else
                {
                    // Free-text item not in catalog
                    resolvedName = string.IsNullOrWhiteSpace(itemDto.ItemName)
                        ? "Unnamed Item"
                        : itemDto.ItemName.Trim();
                }

                purchaseRequest.Items.Add(new PurchaseRequestItem
                {
                    PurchaseRequest = purchaseRequest,
                    ProductId = resolvedProductId,
                    ItemName = resolvedName,
                    Quantity = itemDto.Quantity,
                    Unit = "pcs",
                    Status = "Pending"
                });
            }

            _context.PurchaseRequests.Add(purchaseRequest);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return purchaseRequest;
        }

        public async Task<EntityBillOfMaterial> CreateBillOfMaterialForPurchaseRequestAsync(Guid purchaseRequestId)
        {
            var purchaseRequest = await _context.PurchaseRequests
                .Include(pr => pr.Items)
                .Include(pr => pr.BillOfMaterial)
                .FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);

            if (purchaseRequest == null)
            {
                throw new KeyNotFoundException("Purchase request not found.");
            }

            if (purchaseRequest.BillOfMaterial != null)
            {
                throw new InvalidOperationException("A bill of materials already exists for this purchase request.");
            }

            var billOfMaterial = new EntityBillOfMaterial
            {
                PurchaseRequestId = purchaseRequest.Id,
                BOMNumber = GenerateBomNumber(),
                Source = "PurchaseRequest",
                Status = "Processing",
                Remarks = "Generated from purchase request",
                CreatedAt = DateTime.UtcNow
            };

            // If this request came from a quotation, carry the sales team's
            // per-item note (stored on Specification) into the BOM item's note.
            var quotationMaterialItems = purchaseRequest.QuotationId.HasValue
                ? await _context.Quotations
                    .Where(q => q.Id == purchaseRequest.QuotationId.Value)
                    .SelectMany(q => q.MaterialItems)
                    .AsNoTracking()
                    .ToListAsync()
                : new List<QuotationMaterialItem>();

            foreach (var item in purchaseRequest.Items)
            {
                var product = item.ProductId.HasValue
                    ? await _context.Products.FindAsync(item.ProductId.Value)
                    : await _context.Products.FirstOrDefaultAsync(p => p.ProductName == item.ItemName);

                var quotationItem = quotationMaterialItems.FirstOrDefault(mi =>
                    (item.ProductId != null && mi.ProductId == item.ProductId) ||
                    mi.ItemName.Equals(item.ItemName, StringComparison.OrdinalIgnoreCase));

                var status = product != null ? "Waiting" : "Unavailable";
                billOfMaterial.Items.Add(new BillOfMaterialItem
                {
                    BillOfMaterial = billOfMaterial,
                    PurchaseRequestItemId = item.Id,
                    ItemName = item.ItemName,
                    RequiredQuantity = item.Quantity,
                    Unit = item.Unit,
                    Status = status,
                    QuantityToPurchase = status == "Unavailable" ? item.Quantity : 0,
                    Remarks = string.IsNullOrWhiteSpace(quotationItem?.Specification) ? null : quotationItem.Specification
                });
            }

            purchaseRequest.Status = "Processing";
            _context.BillOfMaterials.Add(billOfMaterial);
            await _context.SaveChangesAsync();

            return billOfMaterial;
        }

        public Task<PurchaseRequest?> GetPurchaseRequestProcessAsync(Guid purchaseRequestId)
        {
            return _context.PurchaseRequests
                .Include(pr => pr.Items)
                .Include(pr => pr.BillOfMaterial)
                    .ThenInclude(bom => bom!.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);
        }

        public Task<EntityBillOfMaterial?> GetBillOfMaterialAsync(Guid billOfMaterialId)
        {
            return _context.BillOfMaterials
                .Include(bom => bom.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(bom => bom.Id == billOfMaterialId);
        }

        public async Task<IEnumerable<PurchaseRequest>> GetPurchaseRequestsAsync()
        {
            return await _context.PurchaseRequests
                .Include(pr => pr.Items)
                .Include(pr => pr.BillOfMaterial)
                    .ThenInclude(bom => bom!.Items)
                .OrderByDescending(pr => pr.CreatedAt)
                .ToListAsync();
        }

        public async Task<PurchaseRequest> UpdateRequestDetailsAsync(Guid purchaseRequestId, UpdatePurchaseRequestDto dto)
        {
            var purchaseRequest = await _context.PurchaseRequests.FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);
            if (purchaseRequest == null)
            {
                throw new KeyNotFoundException("Purchase request not found.");
            }

            purchaseRequest.ClientName = dto.ClientName;
            purchaseRequest.ShippingAddress = dto.ShippingAddress;
            purchaseRequest.Remarks = dto.Remarks;
            purchaseRequest.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return purchaseRequest;
        }

        public async Task<PurchaseRequest> MarkSeenAsync(Guid purchaseRequestId)
        {
            var purchaseRequest = await _context.PurchaseRequests.FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);
            if (purchaseRequest == null)
            {
                throw new KeyNotFoundException("Purchase request not found.");
            }

            if (!purchaseRequest.IsSeenByPurchasing)
            {
                purchaseRequest.IsSeenByPurchasing = true;
                await _context.SaveChangesAsync();
            }

            return purchaseRequest;
        }

        // Whole-request supporting document (e.g. a supplier quote), separate
        // from the auto-generated submission PDF. PDF only.
        public async Task<PurchaseRequest> SaveRequestAttachmentAsync(Guid purchaseRequestId, IFormFile file, string contentRootPath)
        {
            var purchaseRequest = await _context.PurchaseRequests.FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);
            if (purchaseRequest == null)
            {
                throw new KeyNotFoundException("Purchase request not found.");
            }

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (extension != ".pdf")
            {
                throw new InvalidOperationException("Only PDF files are allowed.");
            }
            if (file.Length > 20 * 1024 * 1024)
            {
                throw new InvalidOperationException("Attachment must be under 20 MB.");
            }

            var directory = Path.Combine(contentRootPath, "wwwroot", "documents", "requests");
            Directory.CreateDirectory(directory);

            if (!string.IsNullOrEmpty(purchaseRequest.AttachmentPdfUrl))
            {
                try
                {
                    var oldPath = Path.Combine(contentRootPath, "wwwroot",
                        purchaseRequest.AttachmentPdfUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                    if (File.Exists(oldPath))
                    {
                        File.Delete(oldPath);
                    }
                }
                catch
                {
                    // A stale orphaned file must never block the new upload.
                }
            }

            var fileName = $"{purchaseRequest.Id}-{DateTime.UtcNow.Ticks}{extension}";
            var filePath = Path.Combine(directory, fileName);
            await using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            purchaseRequest.AttachmentPdfUrl = $"/documents/requests/{fileName}";
            purchaseRequest.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("PurchaseRequest", purchaseRequest.Id.ToString(), "AttachmentAdded", "purchasing", null, fileName);

            return purchaseRequest;
        }

        // Finalizes the request: completes the BOM, auto-creates the priced
        // Purchase Order from it, generates a PDF snapshot, and emails it to
        // whichever recipients are configured for PurchaseRequestCompleted.
        public async Task<PurchaseRequest> SubmitRequestAsync(Guid purchaseRequestId, string actorUsername, List<string>? notifyEmails = null)
        {
            var purchaseRequest = await _context.PurchaseRequests
                .Include(pr => pr.BillOfMaterial)
                    .ThenInclude(bom => bom!.Items)
                .FirstOrDefaultAsync(pr => pr.Id == purchaseRequestId);

            if (purchaseRequest == null)
            {
                throw new KeyNotFoundException("Purchase request not found.");
            }

            if (purchaseRequest.BillOfMaterial == null || !purchaseRequest.BillOfMaterial.Items.Any())
            {
                throw new InvalidOperationException("This request has no bill of materials to submit.");
            }

            if (purchaseRequest.Status == "Ordered")
            {
                throw new InvalidOperationException("This request has already been submitted.");
            }

            if (purchaseRequest.BillOfMaterial.Items.Any(i => i.Status != "Ready" && i.Status != "Cancelled"))
            {
                throw new InvalidOperationException("Every item must be Ready or Cancelled before submitting.");
            }

            await _billOfMaterialService.CompleteBillOfMaterialAsync(purchaseRequest.BillOfMaterial.Id);
            await _purchaseOrderService.CreateFromBomAsync(purchaseRequest.BillOfMaterial.Id);

            purchaseRequest.Status = "Ordered";
            purchaseRequest.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Reload with everything the PDF needs.
            var fullRequest = await _context.PurchaseRequests
                .Include(pr => pr.BillOfMaterial)
                    .ThenInclude(bom => bom!.Items)
                .AsNoTracking()
                .FirstAsync(pr => pr.Id == purchaseRequestId);

            try
            {
                if (notifyEmails == null || notifyEmails.Count > 0)
                {
                    var pdfBytes = await _pdfService.GeneratePdfAsync(fullRequest);
                    var subject = $"Purchase Request {fullRequest.PRNumber} submitted — {fullRequest.ClientName}";
                    var body = $"<p>Purchase Request <strong>{fullRequest.PRNumber}</strong> for client <strong>{fullRequest.ClientName}</strong> has been submitted. The full request is attached as a PDF.</p>";
                    var attachment = new EmailAttachment($"{fullRequest.PRNumber}.pdf", pdfBytes, "application/pdf");

                    if (notifyEmails != null)
                    {
                        await _notificationDispatchService.DispatchToExplicitRecipientsAsync(NotificationType.PurchaseRequestCompleted, subject, body, notifyEmails, attachment);
                    }
                    else
                    {
                        await _notificationDispatchService.DispatchAsync(NotificationType.PurchaseRequestCompleted, subject, body, attachment);
                    }
                }
                // else: notifyEmails is an empty (non-null) list — explicitly skipped by the user.
            }
            catch (Exception ex)
            {
                // Email/PDF failure must never undo an already-submitted request.
                Console.WriteLine($"Failed to generate/email purchase request PDF: {ex.Message}");
            }

            await _auditService.LogAsync("PurchaseRequest", purchaseRequest.Id.ToString(), "Submitted", actorUsername, null, purchaseRequest.PRNumber);

            return fullRequest;
        }

        private static string GeneratePrNumber()
        {
            return $"PR-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}".Substring(0, 30);
        }

        private static string GenerateBomNumber()
        {
            return $"BOM-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}".Substring(0, 30);
        }
    }
}
