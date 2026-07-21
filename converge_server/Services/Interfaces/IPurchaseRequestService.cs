using converge_server.Models.DTOs.PurchaseRequest;
using converge_server.Models.Entities;
using Microsoft.AspNetCore.Http;
using EntityBillOfMaterial = converge_server.Models.Entities.BillOfMaterial;

namespace converge_server.Services.Interfaces
{
    public interface IPurchaseRequestService
    {
        Task<PurchaseRequest> CreatePurchaseRequestAsync(CreatePurchaseRequestDto dto, string source = "Manual", int? quotationId = null);
        Task<EntityBillOfMaterial> CreateBillOfMaterialForPurchaseRequestAsync(Guid purchaseRequestId);
        Task<PurchaseRequest?> GetPurchaseRequestProcessAsync(Guid purchaseRequestId);
        Task<EntityBillOfMaterial?> GetBillOfMaterialAsync(Guid billOfMaterialId);
        Task<IEnumerable<PurchaseRequest>> GetPurchaseRequestsAsync();
        Task<PurchaseRequest> UpdateRequestDetailsAsync(Guid purchaseRequestId, UpdatePurchaseRequestDto dto);
        Task<PurchaseRequest> MarkSeenAsync(Guid purchaseRequestId);
        Task<PurchaseRequest> SaveRequestAttachmentAsync(Guid purchaseRequestId, IFormFile file, string contentRootPath);
        Task<PurchaseRequest> SubmitRequestAsync(Guid purchaseRequestId, string actorUsername, List<string>? notifyEmails = null);
    }
}
