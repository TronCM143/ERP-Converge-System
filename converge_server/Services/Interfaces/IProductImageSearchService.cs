using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public interface IProductImageSearchService
    {
        // Returns the URL of the best-matching image for the query, or null if
        // not configured / no results / the request failed.
        Task<string?> FindImageUrlAsync(string query);
    }
}
