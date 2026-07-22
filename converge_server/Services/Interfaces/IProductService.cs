using converge_server.Models.DTOs.Products;
using Microsoft.AspNetCore.Http;

namespace converge_server.Services.Interfaces
{
    public interface IProductService
    {
        Task<List<ProductDetailDto>> GetProductsAsync(string? search = null);
        Task<ProductDetailDto?> GetProductByIdAsync(int productId);
        Task<ProductDetailDto> CreateProductAsync(ProductUpsertDto dto, string actorUsername);
        Task<ProductDetailDto?> UpdateProductAsync(int productId, ProductUpsertDto dto, string actorUsername);
        Task<bool> DeleteProductAsync(int productId, string actorUsername);
        Task<ProductImageResultDto> ResolveProductImageAsync(int productId, bool forceRefresh = false);
        Task<ProductImageResultDto> SetProductImageFromUrlAsync(int productId, string remoteUrl);
        Task<ProductImageResultDto> UploadProductImageAsync(int productId, IFormFile file);
        Task<ProductDetailDto> AdjustStockAsync(int productId, AdjustStockDto dto, string actorUsername);
        Task<List<InventoryTransactionResponseDto>> GetInventoryHistoryAsync(int? productId, int limit);
    }
}
