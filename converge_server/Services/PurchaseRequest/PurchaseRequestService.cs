using converge_server.Data;
using converge_server.Models.DTOs.PurchaseRequest;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services
{
    public class PurchaseRequestService : IPurchaseRequestService
    {
        private readonly AppDbContext _context;

        public PurchaseRequestService(AppDbContext context)
        {
            _context = context;
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

            foreach (var item in purchaseRequest.Items)
            {
                var product = item.ProductId.HasValue
                    ? await _context.Products.FindAsync(item.ProductId.Value)
                    : await _context.Products.FirstOrDefaultAsync(p => p.ProductName == item.ItemName);

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
                    Remarks = product != null ? "Matched existing product catalog." : "Item not found in product catalog."
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
