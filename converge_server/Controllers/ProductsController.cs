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

        public ProductsController(IProductService productService)
        {
            _productService = productService;
        }

        [HttpGet]
        public async Task<IActionResult> GetProducts([FromQuery] string? search)
        {
            return Ok(await _productService.GetProductsAsync(search));
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
    }
}
