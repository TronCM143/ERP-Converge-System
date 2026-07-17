using converge_server.Models.DTOs.Products;

namespace converge_server.Services.Interfaces
{
    public interface IProductService
    {
        Task<List<ProductDetailDto>> GetProductsAsync(string? search = null);
        Task<ProductDetailDto?> GetProductByIdAsync(int productId);
        Task<ProductDetailDto> CreateProductAsync(ProductUpsertDto dto, string actorUsername);
        Task<ProductDetailDto?> UpdateProductAsync(int productId, ProductUpsertDto dto, string actorUsername);
        Task<ProductImageResultDto> ResolveProductImageAsync(int productId, bool forceRefresh = false);
    }
}
