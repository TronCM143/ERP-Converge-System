using converge_server.Data;
using converge_server.Hubs;
using converge_server.Models.Entities;
using converge_server.Models.DTOs.PurchaseOrder;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.PurchaseOrders
{
    public class PurchaseOrderService : IPurchaseOrderService
    {
        private readonly AppDbContext _context;
        private readonly IHubContext<NotificationHub> _hubContext;
        private readonly IUserNotificationService _userNotifications;

        public PurchaseOrderService(AppDbContext context, IHubContext<NotificationHub> hubContext, IUserNotificationService userNotifications)
        {
            _context = context;
            _hubContext = hubContext;
            _userNotifications = userNotifications;
        }

        public async Task<PurchaseOrder> CreateFromBomAsync(Guid billOfMaterialId)
        {
            var bom = await _context.BillOfMaterials
                .Include(b => b.Items)
                .Include(b => b.PurchaseRequest)
                    .ThenInclude(pr => pr!.Items)
                .FirstOrDefaultAsync(b => b.Id == billOfMaterialId);

            if (bom == null)
                throw new KeyNotFoundException("Bill of material not found.");

            // Pricing comes from the sales quotation this PR originated from:
            // match items back to the quotation to carry unit price + tax.
            Models.Entities.Quotation? quotation = null;
            if (bom.PurchaseRequestId.HasValue)
            {
                quotation = await _context.Quotations
                    .Include(q => q.MaterialItems)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(q => q.PurchaseRequestId == bom.PurchaseRequestId);
            }

            var po = new PurchaseOrder
            {
                BillOfMaterialId = bom.Id,
                PONumber = GeneratePoNumber(),
                OrderDate = DateTime.UtcNow,
                ShippingAddress = bom.PurchaseRequest?.ShippingAddress ?? string.Empty,
                Status = "Draft",
                CreatedAt = DateTime.UtcNow,
                Remarks = quotation != null ? $"Created from BOM (Quotation {quotation.QuotationNumber})" : "Created from BOM"
            };

            decimal untaxedTotal = 0;
            decimal vatTotal = 0;
            foreach (var item in bom.Items)
            {
                var prItem = bom.PurchaseRequest?.Items.FirstOrDefault(i => i.Id == item.PurchaseRequestItemId);
                var quotationItem = quotation?.MaterialItems.FirstOrDefault(mi =>
                    (prItem?.ProductId != null && mi.ProductId == prItem.ProductId) ||
                    mi.ItemName.Equals(item.ItemName, StringComparison.OrdinalIgnoreCase));

                var unitPrice = quotationItem?.UnitPrice ?? 0;
                var lineTotal = unitPrice * item.RequiredQuantity;
                var vatAmount = quotationItem != null ? lineTotal * quotationItem.TaxPercent / 100m : 0;

                untaxedTotal += lineTotal;
                vatTotal += vatAmount;

                po.Items.Add(new PurchaseOrderItem
                {
                    PurchaseOrder = po,
                    BillOfMaterialItemId = item.Id,
                    ItemName = item.ItemName,
                    Quantity = item.RequiredQuantity,
                    Unit = item.Unit,
                    UnitPrice = unitPrice,
                    LineTotal = lineTotal,
                    VATAmount = vatAmount,
                    Remarks = item.Remarks
                });
            }

            po.UntaxedAmount = untaxedTotal;
            po.VATAmount = vatTotal;
            po.GrandTotal = untaxedTotal + vatTotal;

            _context.PurchaseOrders.Add(po);
            // mark BOM as Ordered (basic flow)
            bom.Status = "Ordered";
            bom.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Let the sales team know their quotation just turned into a PO.
            // Stored in the database (survives refresh/offline) and pushed live.
            try
            {
                await _userNotifications.AddAsync(
                    "quotation",
                    "PurchaseOrderCreated",
                    $"📦 New PO from {quotation?.QuotationNumber ?? po.PONumber}",
                    bom.PurchaseRequest?.ClientName);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to store/broadcast PO-created notification: {ex.Message}");
            }

            return po;
        }

        public Task<PurchaseOrder?> GetPurchaseOrderAsync(Guid purchaseOrderId)
        {
            return _context.PurchaseOrders
                .Include(po => po.Items)
                .AsNoTracking()
                .FirstOrDefaultAsync(po => po.Id == purchaseOrderId);
        }

        public Task<IEnumerable<PurchaseOrder>> ListAsync()
        {
            return Task.FromResult<IEnumerable<PurchaseOrder>>(_context.PurchaseOrders
                .Include(po => po.Items)
                .AsNoTracking()
                .ToList());
        }

        public async Task<PurchaseOrder> UpdateStatusAsync(Guid purchaseOrderId, string status, string? remarks = null)
        {
            var po = await _context.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == purchaseOrderId);
            if (po == null)
                throw new KeyNotFoundException("Purchase order not found.");

            po.Status = status;
            po.UpdatedAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(remarks)) po.Remarks = remarks;

            _context.PurchaseOrders.Update(po);
            await _context.SaveChangesAsync();
            return po;
        }

        public async Task<PurchaseOrder> UpdatePurchaseOrderAsync(Guid purchaseOrderId, UpdatePurchaseOrderDto dto)
        {
            var po = await _context.PurchaseOrders
                .Include(p => p.Items)
                .FirstOrDefaultAsync(p => p.Id == purchaseOrderId);

            if (po == null)
                throw new KeyNotFoundException("Purchase order not found.");

            po.ShippingAddress = dto.ShippingAddress;
            po.Remarks = dto.Remarks;
            po.ExpectedArrivalDate = dto.ExpectedArrivalDate;
            po.UntaxedAmount = dto.UntaxedAmount;
            po.VATAmount = dto.VATAmount;
            po.DiscountAmount = dto.DiscountAmount;
            po.GrandTotal = dto.GrandTotal;
            po.Status = dto.Status;
            po.UpdatedAt = DateTime.UtcNow;

            foreach (var itemDto in dto.Items)
            {
                var item = po.Items.FirstOrDefault(i => i.Id == itemDto.Id);
                if (item != null)
                {
                    item.UnitPrice = itemDto.UnitPrice;
                    item.LineTotal = itemDto.LineTotal;
                    item.Remarks = itemDto.Remarks;
                }
            }

            _context.PurchaseOrders.Update(po);
            await _context.SaveChangesAsync();

            // Tell the sales team the PO was finalized (stored + pushed live).
            try
            {
                var bom = await _context.BillOfMaterials
                    .AsNoTracking()
                    .Include(b => b.PurchaseRequest)
                    .FirstOrDefaultAsync(b => b.Id == po.BillOfMaterialId);

                string? quotationNumber = null;
                if (bom?.PurchaseRequestId != null)
                {
                    quotationNumber = await _context.Quotations
                        .Where(q => q.PurchaseRequestId == bom.PurchaseRequestId)
                        .Select(q => q.QuotationNumber)
                        .FirstOrDefaultAsync();
                }

                await _userNotifications.AddAsync(
                    "quotation",
                    "PurchaseOrderSaved",
                    $"📦 PO updated — {quotationNumber ?? po.PONumber}",
                    bom?.PurchaseRequest?.ClientName);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to store/broadcast PO-saved notification: {ex.Message}");
            }

            return po;
        }

        private static string GeneratePoNumber()
        {
            // Must fit the PONumber varchar(20) column: PO- + 12 + - + 4 = 20 chars.
            var random = Guid.NewGuid().ToString("N")[..4].ToUpperInvariant();
            return $"PO-{DateTime.UtcNow:yyMMddHHmmss}-{random}";
        }
    }
}
