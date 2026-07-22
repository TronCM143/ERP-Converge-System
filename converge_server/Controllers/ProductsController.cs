using System.Collections.Generic;
using converge_server.Models.DTOs.Products;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    // Inventory: any authenticated role can view; only sales (quotation) and admin can modify.
    [ApiController]
    [Route("api/products")]
    [Authorize]
    public class ProductsController : ControllerBase
    {
        private readonly IProductService _productService;
        private readonly IProductSuggestionSearchService _suggestionSearchService;

        public ProductsController(IProductService productService, IProductSuggestionSearchService suggestionSearchService)
        {
            _productService = productService;
            _suggestionSearchService = suggestionSearchService;
        }

        [HttpGet]
        public async Task<IActionResult> GetProducts([FromQuery] string? search)
        {
            return Ok(await _productService.GetProductsAsync(search));
        }

        // Web-search suggestions for a typed-in product/model name that didn't
        // match the catalog - lets the quotation form correct typos and show
        // the real product title before the user commits to adding it.
        [HttpGet("suggestions")]
        public async Task<IActionResult> GetProductSuggestions([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 3)
            {
                return Ok(new List<ProductSuggestionDto>());
            }

            return Ok(await _suggestionSearchService.SearchAsync(q.Trim()));
        }

        [HttpGet("{productId:int}")]
        public async Task<IActionResult> GetProduct(int productId)
        {
            var product = await _productService.GetProductByIdAsync(productId);
            return product == null ? NotFound(new { error = "Product not found." }) : Ok(product);
        }

        [HttpPost]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> CreateProduct([FromBody] ProductUpsertDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var actor = User.Identity?.Name ?? "system";
            var product = await _productService.CreateProductAsync(dto, actor);
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

            var actor = User.Identity?.Name ?? "system";
            var product = await _productService.UpdateProductAsync(productId, dto, actor);
            return product == null ? NotFound(new { error = "Product not found." }) : Ok(product);
        }

        [HttpDelete("{productId:int}")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> DeleteProduct(int productId)
        {
            var actor = User.Identity?.Name ?? "system";
            var deleted = await _productService.DeleteProductAsync(productId, actor);
            return deleted ? Ok(new { message = "Product deleted." }) : NotFound(new { error = "Product not found." });
        }

        // Click-to-resolve: returns the cached image immediately if one exists,
        // otherwise searches once and caches the result (found or not).
        [HttpPost("{productId:int}/image")]
        public async Task<IActionResult> ResolveProductImage(int productId)
        {
            try
            {
                return Ok(await _productService.ResolveProductImageAsync(productId));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        // Manual override: ignores any prior "not found" result and searches again.
        [HttpPost("{productId:int}/image/refresh")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> RefreshProductImage(int productId)
        {
            try
            {
                return Ok(await _productService.ResolveProductImageAsync(productId, forceRefresh: true));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        // Manual alternative to auto-search: a real file, uploaded directly.
        [HttpPost("{productId:int}/image/upload")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> UploadProductImage(int productId, IFormFile file)
        {
            try
            {
                return Ok(await _productService.UploadProductImageAsync(productId, file));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // Manual alternative to auto-search: a pasted URL, fetched and cached.
        [HttpPost("{productId:int}/image/remote")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> SetProductImageFromUrl(int productId, [FromBody] SetProductImageUrlDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                return Ok(await _productService.SetProductImageFromUrlAsync(productId, dto.Url));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // Stock IN/OUT ledger. Open to every role that can reach the
        // Inventory page — whoever is physically handling the goods should
        // be able to log it, not just Sales/Admin (unlike the product-detail
        // edits above, which stay restricted).
        [HttpPost("{productId:int}/inventory-transactions")]
        [Authorize(Roles = "quotation,purchasing,admin")]
        public async Task<IActionResult> AdjustStock(int productId, [FromBody] AdjustStockDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var actor = User.Identity?.Name ?? "system";
                var product = await _productService.AdjustStockAsync(productId, dto, actor);
                return Ok(product);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("{productId:int}/inventory-transactions")]
        public async Task<IActionResult> GetProductInventoryHistory(int productId, [FromQuery] int limit = 20)
        {
            limit = Math.Clamp(limit, 1, 100);
            return Ok(await _productService.GetInventoryHistoryAsync(productId, limit));
        }

        [HttpGet("inventory-transactions/recent")]
        public async Task<IActionResult> GetRecentInventoryHistory([FromQuery] int limit = 30)
        {
            limit = Math.Clamp(limit, 1, 100);
            return Ok(await _productService.GetInventoryHistoryAsync(null, limit));
        }
    }
}
