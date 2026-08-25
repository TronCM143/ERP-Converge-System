using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public interface IProductImageSearchService
    {
        /// <summary>
        /// Best-matching image URL for the query, or null if not configured, no
        /// results, nothing relevant enough, or the request failed.
        /// </summary>
        /// <param name="mustMatch">
        /// Tokens that identify the product (brand, model). A candidate has to
        /// show at least one of them in its title, page title or host before it
        /// is accepted - "the first image result" is how a search for an obscure
        /// SKU ends up attaching a stock photo of something else entirely.
        /// </param>
        Task<string?> FindImageUrlAsync(string query, IReadOnlyCollection<string>? mustMatch = null);
    }
}
