using converge_server.Models.Entities;
using converge_server.Models.DTOs.PurchaseOrder;

namespace converge_server.Services.Interfaces
{
    public interface IPurchaseOrderService
    {
        Task<PurchaseOrder> CreateFromBomAsync(Guid billOfMaterialId);
        Task<PurchaseOrder?> GetPurchaseOrderAsync(Guid purchaseOrderId);
        Task<IEnumerable<PurchaseOrder>> ListAsync();
        Task<PurchaseOrder> UpdateStatusAsync(Guid purchaseOrderId, string status, string? remarks = null);
        Task<PurchaseOrder> UpdatePurchaseOrderAsync(Guid purchaseOrderId, UpdatePurchaseOrderDto dto);
    }
}
