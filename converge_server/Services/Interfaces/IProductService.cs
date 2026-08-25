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

        /// <summary>
        /// Queues products that still have no usable image. Returns how many were
        /// queued and how many were scanned. Safe to run repeatedly: it skips
        /// anything already handled, which is what makes an interrupted backfill
        /// resumable - run it again and it continues where it stopped.
        /// </summary>
        Task<(int Queued, int Scanned)> QueueMissingProductImagesAsync(int batchSize = 200, bool includeAlreadyAttempted = false);
        Task<ProductImageResultDto> SetProductImageFromUrlAsync(int productId, string remoteUrl);
        Task<ProductImageResultDto> UploadProductImageAsync(int productId, IFormFile file);
        Task<ProductDetailDto> AdjustStockAsync(int productId, AdjustStockDto dto, string actorUsername);
        Task<List<InventoryTransactionResponseDto>> GetInventoryHistoryAsync(int? productId, int limit);
    }
}
