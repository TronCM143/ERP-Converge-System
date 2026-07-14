using converge_server.Data;
using converge_server.Models.DTOs.BillOfMaterial;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services.BillOfMaterial
{
    public class BillOfMaterialService : IBillOfMaterialService
    {
        private readonly AppDbContext _context;

        public BillOfMaterialService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<BillOfMaterialItem> UpdateBillOfMaterialItemStatusAsync(Guid billOfMaterialItemId, UpdateBillOfMaterialItemStatusDto dto)
        {
            var item = await _context.BillOfMaterialItems
                .Include(i => i.BillOfMaterial)
                .FirstOrDefaultAsync(i => i.Id == billOfMaterialItemId);

            if (item == null)
            {
                throw new KeyNotFoundException("Bill of material item not found.");
            }

            // Stamp the received date automatically the first time the item
            // transitions into Received.
            if (dto.Status == "Received" && item.Status != "Received" && item.ReceivedAt == null)
            {
                item.ReceivedAt = DateTime.UtcNow;
            }

            item.Status = dto.Status;
            item.Remarks = dto.Remarks;
            if (dto.DeliveryDate.HasValue)
            {
                item.DeliveryDate = DateTime.SpecifyKind(dto.DeliveryDate.Value, DateTimeKind.Utc);
            }
            item.BillOfMaterial!.UpdatedAt = DateTime.UtcNow;
            _context.BillOfMaterialItems.Update(item);
            await _context.SaveChangesAsync();
            return item;
        }

        public async Task<EntityBillOfMaterial> CompleteBillOfMaterialAsync(Guid billOfMaterialId)
        {
            var bom = await _context.BillOfMaterials
                .Include(b => b.Items)
                .FirstOrDefaultAsync(b => b.Id == billOfMaterialId);

            if (bom == null)
            {
                throw new KeyNotFoundException("Bill of material not found.");
            }

            if (!bom.Items.Any())
            {
                throw new InvalidOperationException("Bill of material has no items.");
            }

            if (bom.Items.Any(i => i.Status != "Ready"))
            {
                throw new InvalidOperationException("Cannot complete BOM until all items are marked Ready.");
            }

            bom.Status = "Completed";
            bom.UpdatedAt = DateTime.UtcNow;
            _context.BillOfMaterials.Update(bom);
            await _context.SaveChangesAsync();
            return bom;
        }
    }
}
