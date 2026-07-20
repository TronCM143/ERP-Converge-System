using converge_server.Models.DTOs.BillOfMaterial;
using converge_server.Models.Entities;
using Microsoft.AspNetCore.Http;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services.Interfaces
{
    public interface IBillOfMaterialService
    {
        Task<BillOfMaterialItem> UpdateBillOfMaterialItemStatusAsync(Guid billOfMaterialItemId, UpdateBillOfMaterialItemStatusDto dto);
        Task<BillOfMaterialItem> SaveItemEvidenceAsync(Guid billOfMaterialItemId, IFormFile file, string contentRootPath);
        Task<EntityBillOfMaterial> CompleteBillOfMaterialAsync(Guid billOfMaterialId);
    }
}
