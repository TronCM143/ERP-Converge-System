using converge_server.Data;
using converge_server.Models.DTOs.Products;
using converge_server.Models.Entities;
using converge_server.Services.Caching;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    // Inventory: any authenticated role can view; only sales (quotation) and admin can modify.
    [ApiController]
    [Route("api/products")]
    [Authorize]
    public class ProductsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;
        private readonly ICacheService _cache;

        public ProductsController(AppDbContext context, IAuditService auditService, ICacheService cache)
        {
            _context = context;
            _auditService = auditService;
            _cache = cache;
        }

        [HttpGet]
        public async Task<IActionResult> GetProducts()
        {
            var cached = await _cache.GetAsync<List<Product>>(CacheKeys.Products);
            if (cached != null)
            {
                return Ok(cached);
            }

            var products = await _context.Products
                .Where(p => p.IsActive)
                .OrderBy(p => p.ProductName)
                .ToListAsync();

            await _cache.SetAsync(CacheKeys.Products, products, TimeSpan.FromMinutes(5));
            return Ok(products);
        }

        [HttpPost]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> CreateProduct([FromBody] ProductUpsertDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

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
            await _cache.RemoveAsync(CacheKeys.Products);

            var actor = User.Identity?.Name ?? "system";
            await _auditService.LogAsync("Product", product.Id.ToString(), "Created", actor, null, product.ProductName);

            return Ok(product);
        }

        [HttpPatch("{productId:int}")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> UpdateProduct(int productId, [FromBody] ProductUpsertDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var product = await _context.Products.FindAsync(productId);
            if (product == null)
            {
                return NotFound(new { error = "Product not found." });
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

            var actor = User.Identity?.Name ?? "system";
            await _auditService.LogAsync("Product", product.Id.ToString(), "Updated", actor, null, product.ProductName);

            return Ok(product);
        }
    }
}
