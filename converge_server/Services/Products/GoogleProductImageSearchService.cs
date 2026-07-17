using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Web;
using converge_server.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace converge_server.Services.Products
{
    // Looks up a product image via the Google Custom Search JSON API
    // (https://developers.google.com/custom-search/v1/overview). Needs
    // GoogleCustomSearch:ApiKey and GoogleCustomSearch:SearchEngineId — both
    // blank by default; no-ops (logs a warning, returns null) until configured,
    // same pattern as the SMS/SMTP senders.
    public class GoogleProductImageSearchService : IProductImageSearchService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GoogleProductImageSearchService> _logger;

        public GoogleProductImageSearchService(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleProductImageSearchService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<string?> FindImageUrlAsync(string query)
        {
            var apiKey = _configuration["GoogleCustomSearch:ApiKey"];
            var searchEngineId = _configuration["GoogleCustomSearch:SearchEngineId"];

            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(searchEngineId))
            {
                _logger.LogWarning("Google Custom Search not configured — skipping image search for \"{Query}\"", query);
                return null;
            }

            try
            {
                var url = "https://www.googleapis.com/customsearch/v1"
                    + $"?key={HttpUtility.UrlEncode(apiKey)}"
                    + $"&cx={HttpUtility.UrlEncode(searchEngineId)}"
                    + $"&q={HttpUtility.UrlEncode(query)}"
                    + "&searchType=image&num=1&safe=active";

                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    _logger.LogError("Google Custom Search failed for \"{Query}\": {StatusCode} {Body}", query, response.StatusCode, body);
                    return null;
                }

                await using var stream = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(stream);

                if (!doc.RootElement.TryGetProperty("items", out var items) || items.GetArrayLength() == 0)
                {
                    return null;
                }

                return items[0].TryGetProperty("link", out var link) ? link.GetString() : null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to search for a product image for \"{Query}\"", query);
                return null;
            }
        }
    }
}
