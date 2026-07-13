using converge_server.Models.DTOs.BillOfMaterial;
using converge_server.Models.Entities;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services.Interfaces
{
    public interface IBillOfMaterialService
    {
        Task<BillOfMaterialItem> UpdateBillOfMaterialItemStatusAsync(Guid billOfMaterialItemId, UpdateBillOfMaterialItemStatusDto dto);
        Task<EntityBillOfMaterial> CompleteBillOfMaterialAsync(Guid billOfMaterialId);
    }
}
