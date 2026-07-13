using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Models.DTOs.PurchaseOrder;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.PurchaseOrders
{
    public class PurchaseOrderService : IPurchaseOrderService
    {
        private readonly AppDbContext _context;

        public PurchaseOrderService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<PurchaseOrder> CreateFromBomAsync(Guid billOfMaterialId)
        {
            var bom = await _context.BillOfMaterials
                .Include(b => b.Items)
                .Include(b => b.PurchaseRequest)
                .FirstOrDefaultAsync(b => b.Id == billOfMaterialId);

            if (bom == null)
                throw new KeyNotFoundException("Bill of material not found.");

            var po = new PurchaseOrder
            {
                BillOfMaterialId = bom.Id,
                PONumber = GeneratePoNumber(),
                OrderDate = DateTime.UtcNow,
                ShippingAddress = bom.PurchaseRequest?.ShippingAddress ?? string.Empty,
                Status = "Draft",
                CreatedAt = DateTime.UtcNow,
                Remarks = "Created from BOM"
            };

            foreach (var item in bom.Items)
            {
                po.Items.Add(new PurchaseOrderItem
                {
                    PurchaseOrder = po,
                    BillOfMaterialItemId = item.Id,
                    ItemName = item.ItemName,
                    Quantity = item.RequiredQuantity,
                    Unit = item.Unit,
                    UnitPrice = 0,
                    LineTotal = 0,
                    Remarks = item.Remarks
                });
            }

            _context.PurchaseOrders.Add(po);
            // mark BOM as Ordered (basic flow)
            bom.Status = "Ordered";
            bom.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

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
            return po;
        }

        private static string GeneratePoNumber()
        {
            return $"PO-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}".Substring(0, 30);
        }
    }
}
