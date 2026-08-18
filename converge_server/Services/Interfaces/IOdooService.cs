using converge_server.Models.DTOs.Odoo;

namespace converge_server.Services.Interfaces
{
    public interface IOdooService
    {
        /// <summary>True when a username + API key are configured.</summary>
        bool IsConfigured { get; }

        /// <summary>
        /// Past sale orders whose reference, customer or line descriptions match
        /// the query. Returns an empty list (never throws) when Odoo is not
        /// configured or unreachable — this backs a suggestion panel beside a
        /// prompt box, and must never interrupt someone mid-sentence.
        /// </summary>
        Task<List<OdooQuoteSuggestionDto>> SearchQuotesAsync(string query, int limit = 12);

        /// <summary>
        /// One order's lines, each resolved against the local product catalog.
        /// Null when the order doesn't exist or Odoo can't be reached.
        /// </summary>
        Task<OdooOrderDraftDto?> GetOrderDraftAsync(long orderId);
    }
}
