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
        private readonly IAuditService _auditService;

        public BillOfMaterialService(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
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
            var isNewlyReceived = dto.Status == "Received" && item.Status != "Received" && item.ReceivedAt == null;
            if (isNewlyReceived)
            {
                item.ReceivedAt = DateTime.UtcNow;
            }

            item.Status = dto.Status;
            item.Remarks = dto.Remarks;
            item.DeliveryDate = dto.DeliveryDate.HasValue
                ? DateTime.SpecifyKind(dto.DeliveryDate.Value, DateTimeKind.Utc)
                : null;
            item.OrderDate = dto.OrderDate.HasValue
                ? DateTime.SpecifyKind(dto.OrderDate.Value, DateTimeKind.Utc)
                : null;
            if (dto.Supplier != null)
            {
                item.Supplier = string.IsNullOrWhiteSpace(dto.Supplier) ? null : dto.Supplier.Trim();
            }
            item.BillOfMaterial!.UpdatedAt = DateTime.UtcNow;
            _context.BillOfMaterialItems.Update(item);
            await _context.SaveChangesAsync();

            if (isNewlyReceived && item.BillOfMaterial!.PurchaseRequestId.HasValue)
            {
                await _auditService.LogAsync("PurchaseRequest", item.BillOfMaterial.PurchaseRequestId.Value.ToString(), "Received", "purchasing", null, item.ItemName);
            }

            return item;
        }

        // Stores an uploaded proof-of-transaction image for the item and
        // points EvidenceImageUrl at it, replacing any previous file.
        public async Task<BillOfMaterialItem> SaveItemEvidenceAsync(Guid billOfMaterialItemId, IFormFile file, string contentRootPath)
        {
            var item = await _context.BillOfMaterialItems
                .Include(i => i.BillOfMaterial)
                .FirstOrDefaultAsync(i => i.Id == billOfMaterialItemId);

            if (item == null)
            {
                throw new KeyNotFoundException("Bill of material item not found.");
            }

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
            if (!allowed.Contains(extension))
            {
                throw new InvalidOperationException("Only image files (.jpg, .png, .webp, .gif) are allowed.");
            }
            if (file.Length > 10 * 1024 * 1024)
            {
                throw new InvalidOperationException("Image must be under 10 MB.");
            }

            var directory = Path.Combine(contentRootPath, "wwwroot", "images", "evidence");
            Directory.CreateDirectory(directory);

            // Best-effort cleanup of the file being replaced.
            if (!string.IsNullOrEmpty(item.EvidenceImageUrl))
            {
                try
                {
                    var oldPath = Path.Combine(contentRootPath, "wwwroot",
                        item.EvidenceImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
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

            // Ticks in the name so a replacement never collides with a
            // browser-cached copy of the previous image.
            var fileName = $"{item.Id}-{DateTime.UtcNow.Ticks}{extension}";
            var filePath = Path.Combine(directory, fileName);
            await using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            item.EvidenceImageUrl = $"/images/evidence/{fileName}";
            item.BillOfMaterial!.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            if (item.BillOfMaterial.PurchaseRequestId.HasValue)
            {
                await _auditService.LogAsync("PurchaseRequest", item.BillOfMaterial.PurchaseRequestId.Value.ToString(), "EvidenceUploaded", "purchasing", null, item.ItemName);
            }

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

            if (bom.Items.Any(i => i.Status != "Ready" && i.Status != "Cancelled"))
            {
                throw new InvalidOperationException("Cannot complete BOM until all items are marked Ready or Cancelled.");
            }

            bom.Status = "Completed";
            bom.UpdatedAt = DateTime.UtcNow;
            _context.BillOfMaterials.Update(bom);
            await _context.SaveChangesAsync();
            return bom;
        }
    }
}
