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
using Microsoft.AspNetCore.Http;
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
        private readonly IProductImageQueue _imageQueue;
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
            IWebHostEnvironment env,
            IProductImageQueue imageQueue)
        {
            _context = context;
            _auditService = auditService;
            _cache = cache;
            _imageSearchService = imageSearchService;
            _imageQueue = imageQueue;
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
                Description = Clean(dto.Description),
                Manufacturer = Clean(dto.Manufacturer),
                DatasheetUrl = Clean(dto.DatasheetUrl),
                ProductUrl = Clean(dto.ProductUrl),
                Price = dto.Price,
                Cost = dto.Cost,
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Products.Add(product);
            await _context.SaveChangesAsync();

            // SKU is derived from the Id, which only exists after the first save.
            product.Sku = $"SKU-{product.Id:D6}";
            await _context.SaveChangesAsync();

            /* Hand the image lookup to the background worker and return. The
               spec is explicit that finding a picture must not block product
               creation - the search is a third-party HTTP call that can take
               seconds or hang, and the product is already saved and usable
               without it. A full queue simply drops the request; the backfill
               scan will pick this product up later. */
            _imageQueue.TryEnqueue(product.Id);

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
            product.Description = Clean(dto.Description);
            product.Manufacturer = Clean(dto.Manufacturer);
            product.DatasheetUrl = Clean(dto.DatasheetUrl);
            product.ProductUrl = Clean(dto.ProductUrl);
            product.Price = dto.Price;
            product.Cost = dto.Cost;
            product.IsActive = dto.IsActive;
            product.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);
            await _auditService.LogAsync("Product", product.Id.ToString(), "Updated", actorUsername, null, product.ProductName);

            return ToDetail(product);
        }

        // Soft delete: products can be referenced by historical quotations,
        // purchase requests, and BOMs (ProductId FKs on those line items), so
        // a hard delete risks a foreign-key violation or silently orphaning
        // order history. Deactivating keeps that history intact while
        // dropping the product off every active list (same flag the rest of
        // the app already filters on).
        public async Task<bool> DeleteProductAsync(int productId, string actorUsername)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return false;
            }

            product.IsActive = false;
            product.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);
            await _auditService.LogAsync("Product", product.Id.ToString(), "Deleted", actorUsername, null, product.ProductName);

            return true;
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

            // Brand and model are what identify the thing; the product name is
            // often generic ("4-Channel NVR") and would match almost anything.
            var mustMatch = new[] { product.Brand, product.Model }
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v.Replace('_', ' ').Trim())
                .ToList();

            var sourceUrl = await _imageSearchService.FindImageUrlAsync(query, mustMatch);
            var localUrl = sourceUrl != null ? await DownloadAndCacheAsync(product, sourceUrl) : null;

            product.ImageUrl = localUrl;
            product.ImageSearchAttempted = true;
            await _context.SaveChangesAsync();

            return new ProductImageResultDto { ImageUrl = localUrl, Found = localUrl != null };
        }

        /* Backfill for products that predate the automatic lookup.

           "Needs an image" means: no ImageUrl at all, or one pointing at a file
           that is no longer on disk - a URL in the column is not proof the image
           survived. Broken local files are the placeholder case the spec
           describes, and re-queuing them is the whole point of the scan.

           Paged, and capped per run by batchSize, so a 3000-row catalog is not
           turned into 3000 queued jobs in one go. ImageSearchAttempted is the
           resumability marker: a product already tried is skipped unless the
           caller forces it, so re-running after a restart continues rather than
           starting over or duplicating work.

           Note the queue is bounded - when it fills, TryEnqueue returns false
           and the scan stops early and reports what it managed. That is not a
           failure: the next run picks up the remainder. */
        public async Task<(int Queued, int Scanned)> QueueMissingProductImagesAsync(int batchSize = 200, bool includeAlreadyAttempted = false)
        {
            batchSize = Math.Clamp(batchSize, 1, 1000);

            var query = _context.Products
                .AsNoTracking()
                .Where(p => p.IsActive);

            if (!includeAlreadyAttempted)
            {
                query = query.Where(p => !p.ImageSearchAttempted);
            }

            var candidates = await query
                .OrderBy(p => p.Id)
                .Select(p => new { p.Id, p.ImageUrl })
                .Take(batchSize)
                .ToListAsync();

            var queued = 0;
            foreach (var candidate in candidates)
            {
                if (!NeedsImage(candidate.ImageUrl))
                {
                    continue;
                }

                if (!_imageQueue.TryEnqueue(candidate.Id))
                {
                    _logger.LogInformation("Image queue is full; stopping the backfill scan after {Queued} products.", queued);
                    break;
                }

                queued++;
            }

            _logger.LogInformation("Image backfill queued {Queued} of {Scanned} scanned products.", queued, candidates.Count);
            return (queued, candidates.Count);
        }

        // A stored URL is only good if the file is still there. Remote URLs are
        // taken on trust - we cannot cheaply prove those without fetching them,
        // and this method runs over the whole catalog.
        private bool NeedsImage(string? imageUrl)
        {
            if (string.IsNullOrWhiteSpace(imageUrl)) return true;
            if (!imageUrl.StartsWith("/images/products/", StringComparison.Ordinal)) return false;

            var fileName = Path.GetFileName(imageUrl);
            return !File.Exists(Path.Combine(_imagesDirectory, fileName));
        }

        // Manual alternative to the auto-search: paste a URL, we fetch and
        // cache it locally the same way a found search result would be.
        public async Task<ProductImageResultDto> SetProductImageFromUrlAsync(int productId, string remoteUrl)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                throw new KeyNotFoundException("Product not found.");
            }

            if (!Uri.TryCreate(remoteUrl, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                throw new InvalidOperationException("Enter a valid image URL.");
            }

            var localUrl = await DownloadAndCacheAsync(product, remoteUrl);
            if (localUrl == null)
            {
                throw new InvalidOperationException("Could not download an image from that URL.");
            }

            product.ImageUrl = localUrl;
            product.ImageSearchAttempted = true;
            product.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);

            return new ProductImageResultDto { ImageUrl = localUrl, Found = true };
        }

        // Manual alternative to the auto-search: a real uploaded file instead
        // of a URL, saved the same way (named after the SKU, so a re-upload
        // just overwrites the previous image).
        public async Task<ProductImageResultDto> UploadProductImageAsync(int productId, IFormFile file)
        {
            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                throw new KeyNotFoundException("Product not found.");
            }

            if (file == null || file.Length == 0)
            {
                throw new InvalidOperationException("No file uploaded.");
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

            Directory.CreateDirectory(_imagesDirectory);
            var fileName = $"{product.Sku}{extension}";
            var filePath = Path.Combine(_imagesDirectory, fileName);
            await using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            product.ImageUrl = $"/images/products/{fileName}";
            product.ImageSearchAttempted = true;
            product.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);

            return new ProductImageResultDto { ImageUrl = product.ImageUrl, Found = true };
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

                /* Validate before storing. A search result is a URL someone else
                   controls: it can 200 with an HTML error page, a tracking pixel
                   or a 40MB TIFF. Anything that is not a real, sanely-sized
                   image is rejected outright rather than saved and rendered as a
                   broken thumbnail - the spec asks for exactly this check. */
                var mediaType = response.Content.Headers.ContentType?.MediaType;
                var extension = mediaType switch
                {
                    "image/jpeg" => ".jpg",
                    "image/png" => ".png",
                    "image/webp" => ".webp",
                    "image/gif" => ".gif",
                    _ => null
                };

                if (extension == null)
                {
                    _logger.LogInformation("Rejected an image for {Sku}: content type was {MediaType}", product.Sku, mediaType ?? "unknown");
                    return null;
                }

                var bytes = await response.Content.ReadAsByteArrayAsync();

                // Under 1KB is a spacer or an error page; over 8MB is a print
                // asset nobody wants loading on a product row.
                if (bytes.Length < 1024 || bytes.Length > 8 * 1024 * 1024)
                {
                    _logger.LogInformation("Rejected an image for {Sku}: {Bytes} bytes", product.Sku, bytes.Length);
                    return null;
                }

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

        // Records a stock movement and updates the running quantity in one
        // transaction. Out cannot drive stock negative — the operator is
        // telling us what physically left the shelf, so an Out larger than
        // what's on hand almost always means the on-hand count is stale and
        // needs a real inventory check first, not just to be forced through.
        public async Task<ProductDetailDto> AdjustStockAsync(int productId, AdjustStockDto dto, string actorUsername)
        {
            if (!Enum.TryParse<InventoryDirection>(dto.Direction, ignoreCase: true, out var direction))
            {
                throw new InvalidOperationException("Direction must be 'In' or 'Out'.");
            }

            if (direction == InventoryDirection.Out && string.IsNullOrWhiteSpace(dto.PointPerson))
            {
                throw new InvalidOperationException("Point person is required when pulling stock out.");
            }

            if (direction == InventoryDirection.Out && !dto.BorrowedAt.HasValue)
            {
                throw new InvalidOperationException("Borrowed date is required when pulling stock out.");
            }

            if (direction == InventoryDirection.In && !dto.ReturnedAt.HasValue)
            {
                throw new InvalidOperationException("Return date is required when bringing stock in.");
            }

            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                throw new KeyNotFoundException("Product not found.");
            }

            if (direction == InventoryDirection.Out && dto.Quantity > product.StockQuantity)
            {
                throw new InvalidOperationException($"Cannot pull out {dto.Quantity} — only {product.StockQuantity} on hand.");
            }

            var oldQuantity = product.StockQuantity;
            product.StockQuantity += direction == InventoryDirection.In ? dto.Quantity : -dto.Quantity;
            product.UpdatedAt = DateTime.UtcNow;

            _context.InventoryTransactions.Add(new InventoryTransaction
            {
                ProductId = product.Id,
                Direction = direction,
                Quantity = dto.Quantity,
                ResultingStock = product.StockQuantity,
                Reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim(),
                PointPerson = string.IsNullOrWhiteSpace(dto.PointPerson) ? null : dto.PointPerson.Trim(),
                BorrowedAt = dto.BorrowedAt?.ToUniversalTime(),
                ReturnedAt = dto.ReturnedAt?.ToUniversalTime(),
                PerformedBy = actorUsername,
                OccurredAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Products);
            await _auditService.LogAsync(
                "Product",
                product.Id.ToString(),
                "StockAdjusted",
                actorUsername,
                oldQuantity.ToString(),
                product.StockQuantity.ToString(),
                $"{direction} {dto.Quantity} — {product.ProductName}");

            return ToDetail(product);
        }

        public async Task<List<InventoryTransactionResponseDto>> GetInventoryHistoryAsync(int? productId, int limit)
        {
            var query = _context.InventoryTransactions
                .AsNoTracking()
                .Include(t => t.Product)
                .AsQueryable();

            if (productId.HasValue)
            {
                query = query.Where(t => t.ProductId == productId.Value);
            }

            var rows = await query
                .OrderByDescending(t => t.OccurredAt)
                .Take(limit)
                .ToListAsync();

            return rows.Select(t => new InventoryTransactionResponseDto
            {
                Id = t.Id,
                ProductId = t.ProductId,
                ProductName = t.Product?.ProductName ?? "",
                Direction = t.Direction.ToString(),
                Quantity = t.Quantity,
                ResultingStock = t.ResultingStock,
                Reason = t.Reason,
                PointPerson = t.PointPerson,
                BorrowedAt = t.BorrowedAt,
                ReturnedAt = t.ReturnedAt,
                PerformedBy = t.PerformedBy,
                OccurredAt = t.OccurredAt
            }).ToList();
        }

        // Blank and whitespace both mean "not set" for the optional reference
        // fields, so they normalise to null rather than to an empty string.
        private static string? Clean(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static ProductDetailDto ToDetail(Product p) => new()
        {
            Cost = p.Cost,
            Description = p.Description,
            Manufacturer = p.Manufacturer,
            DatasheetUrl = p.DatasheetUrl,
            ProductUrl = p.ProductUrl,
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
            ImageSearchAttempted = p.ImageSearchAttempted,
            StockQuantity = p.StockQuantity
        };
    }
}
