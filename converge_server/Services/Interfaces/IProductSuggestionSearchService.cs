using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.DTOs.Products;

namespace converge_server.Services.Interfaces
{
    public interface IProductSuggestionSearchService
    {
        // General (non-image) web search for a typed-in product/model name -
        // helps correct typos and surface the real product title/spec text.
        // Returns an empty list if not configured / no results / the request failed.
        Task<List<ProductSuggestionDto>> SearchAsync(string query);
    }
}
