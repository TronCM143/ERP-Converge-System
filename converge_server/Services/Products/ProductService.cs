using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using converge_server.Data;
using converge_server.Models.DTOs.Products;
using converge_server.Models.Entities;
using converge_server.Services.Caching;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace converge_server.Services.Products
{
    public class ProductService : IProductService
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;
        private readonly ICacheService _cache;
        private readonly IProductImageSearchService _imageSearchService;
        private readonly HttpClient _httpClient;
        private readonly ILogger<ProductService> _logger;
        private readonly string _imagesDirectory;

        public ProductService(
            AppDbContext context,
            IAuditService auditService,
            ICacheService cache,
            IProductImageSearchService imageSearchService,
            HttpClient httpClient,
            ILogger<ProductService> logger,
            IWebHostEnvironment env)
        {
            _context = context;
            _auditService = auditService;
            _cache = cache;
            _imageSearchService = imageSearchService;
            _httpClient = httpClient;
            _logger = logger;
            _imagesDirectory = Path.Combine(env.ContentRootPath, "wwwroot", "images", "products");
        }

        // Returns the full product shape (not just name) — PurchaseRequestsPage
        // and QuotationFormModal both consume this same list endpoint and need
        // Model/Price too, not just what the Inventory list panel displays.
        public async Task<List<ProductDetailDto>> GetProductsAsync(string? search = null)
        {
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                var matches = await _context.Products
                    .Where(p => p.IsActive && (
                        p.ProductName.ToLower().Contains(term) ||
                        p.Brand.ToLower().Contains(term) ||
                        p.Category.ToLower().Contains(term) ||
                        p.Specs.ToLower().Contains(term)))
                    .OrderBy(p => p.ProductName)
                    .ToListAsync();
                return matches.Select(ToDetail).ToList();
            }

            var cached = await _cache.GetAsync<List<ProductDetailDto>>(CacheKeys.Products);
            if (cached != null)
            {
                return cached;
            }

            var products = await _context.Products
                .Where(p => p.IsActive)
                .OrderBy(p => p.ProductName)
                .ToListAsync();
            var result = products.Select(ToDetail).ToList();

            await _cache.SetAsync(CacheKeys.Products, result, TimeSpan.FromMinutes(5));
            return result;
        }

        public async Task<ProductDetailDto?> GetProductByIdAsync(int productId)
        {
            var product = await _context.Products.FindAsync(productId);
            return product == null ? null : ToDetail(product);
        }

        public async Task<ProductDetailDto> CreateProductAsync(ProductUpsertDto dto, string actorUsername)
        {
            var product = new Product
            {
                Category = dto.Category.Trim(),
                Subcategory = dto.Subcategory?.Trim() ?? string.Empty,
                Brand = dto.Brand.Trim(),
                Model = dto.Model?.Trim() ?? string.Empty,
                ProductName = dto.ProductName.Trim(),
                Specs = dto.Specs?.Trim() ?? string.Empty,
                Price = dto.Price,
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow
            };

            _context.Products.Add(product);
            await _context.SaveChangesAsync();

            // SKU is derived from the Id, which only exists after the first save.
            product.Sku = $"SKU-{product.Id:D6}";
            await _context.SaveChangesAsync();

            await _cache.RemoveAsync(CacheKeys.Products);
            await _auditService.LogAsync("Product", product.Id.ToString(), "Created", actorUsername, null, product.ProductName);

            return ToDetail(product);
        }

        public async Task<ProductDetailDto?> UpdateProductAsync(int productId, ProductUpsertDto dto, string actorUsername)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return null;
            }

            product.Category = dto.Category.Trim();
            product.Subcategory = dto.Subcategory?.Trim() ?? string.Empty;
            product.Brand = dto.Brand.Trim();
            product.Model = dto.Model?.Trim() ?? string.Empty;
            product.ProductName = dto.ProductName.Trim();
            product.Specs = dto.Specs?.Trim() ?? string.Empty;
            product.Price = dto.Price;
            product.IsActive = dto.IsActive;
            product.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);
            await _auditService.LogAsync("Product", product.Id.ToString(), "Updated", actorUsername, null, product.ProductName);

            return ToDetail(product);
        }

        // The core click-to-resolve pipeline: reuse a cached image, skip a
        // known-empty search, or search-download-cache once and remember the
        // outcome either way so we never re-search on every click.
        public async Task<ProductImageResultDto> ResolveProductImageAsync(int productId, bool forceRefresh = false)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                throw new KeyNotFoundException("Product not found.");
            }

            if (!forceRefresh && !string.IsNullOrEmpty(product.ImageUrl))
            {
                return new ProductImageResultDto { ImageUrl = product.ImageUrl, Found = true };
            }

            if (!forceRefresh && product.ImageSearchAttempted)
            {
                return new ProductImageResultDto { ImageUrl = null, Found = false };
            }

            // Product names are stored with underscores instead of spaces
            // (e.g. "fiber_splicing") — clean that up for a readable search query.
            var query = string.Join(' ', new[] { product.Brand, product.Model, product.ProductName }
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Replace('_', ' ')));

            var sourceUrl = await _imageSearchService.FindImageUrlAsync(query);
            var localUrl = sourceUrl != null ? await DownloadAndCacheAsync(product, sourceUrl) : null;

            product.ImageUrl = localUrl;
            product.ImageSearchAttempted = true;
            await _context.SaveChangesAsync();

            return new ProductImageResultDto { ImageUrl = localUrl, Found = localUrl != null };
        }

        private async Task<string?> DownloadAndCacheAsync(Product product, string sourceUrl)
        {
            try
            {
                var response = await _httpClient.GetAsync(sourceUrl);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var bytes = await response.Content.ReadAsByteArrayAsync();
                var extension = (response.Content.Headers.ContentType?.MediaType) switch
                {
                    "image/png" => ".png",
                    "image/webp" => ".webp",
                    "image/gif" => ".gif",
                    _ => ".jpg"
                };

                Directory.CreateDirectory(_imagesDirectory);
                var fileName = $"{product.Sku}{extension}";
                var filePath = Path.Combine(_imagesDirectory, fileName);
                await File.WriteAllBytesAsync(filePath, bytes);

                return $"/images/products/{fileName}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to download product image for {Sku} from {Url}", product.Sku, sourceUrl);
                return null;
            }
        }

        private static ProductDetailDto ToDetail(Product p) => new()
        {
            Id = p.Id,
            Sku = p.Sku,
            ProductName = p.ProductName,
            Category = p.Category,
            Subcategory = p.Subcategory,
            Brand = p.Brand,
            Model = p.Model,
            Specs = p.Specs,
            Price = p.Price,
            IsActive = p.IsActive,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ImageUrl = p.ImageUrl,
            ImageSearchAttempted = p.ImageSearchAttempted
        };
    }
}
