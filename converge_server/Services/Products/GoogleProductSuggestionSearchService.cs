using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Web;
using converge_server.Models.DTOs.Products;
using converge_server.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace converge_server.Services.Products
{
    // Same Google Custom Search JSON API as GoogleProductImageSearchService,
    // but a plain web search (no searchType=image) so the results carry real
    // product titles/snippets - used to help correct a typo'd product/model
    // name typed into the quotation form, not to find a picture.
    // Needs the same GoogleCustomSearch:ApiKey / GoogleCustomSearch:SearchEngineId
    // config; no-ops (returns an empty list) until configured.
    public class GoogleProductSuggestionSearchService : IProductSuggestionSearchService
    {
        private const int MaxResults = 5;

        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GoogleProductSuggestionSearchService> _logger;

        public GoogleProductSuggestionSearchService(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleProductSuggestionSearchService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<List<ProductSuggestionDto>> SearchAsync(string query)
        {
            var results = new List<ProductSuggestionDto>();

            var apiKey = _configuration["GoogleCustomSearch:ApiKey"];
            var searchEngineId = _configuration["GoogleCustomSearch:SearchEngineId"];

            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(searchEngineId))
            {
                _logger.LogWarning("Google Custom Search not configured — skipping suggestion search for \"{Query}\"", query);
                return results;
            }

            try
            {
                var url = "https://www.googleapis.com/customsearch/v1"
                    + $"?key={HttpUtility.UrlEncode(apiKey)}"
                    + $"&cx={HttpUtility.UrlEncode(searchEngineId)}"
                    + $"&q={HttpUtility.UrlEncode(query)}"
                    + $"&num={MaxResults}&safe=active";

                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    _logger.LogError("Google Custom Search failed for \"{Query}\": {StatusCode} {Body}", query, response.StatusCode, body);
                    return results;
                }

                await using var stream = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(stream);

                if (!doc.RootElement.TryGetProperty("items", out var items))
                {
                    return results;
                }

                foreach (var item in items.EnumerateArray())
                {
                    results.Add(new ProductSuggestionDto
                    {
                        Title = item.TryGetProperty("title", out var title) ? title.GetString() ?? string.Empty : string.Empty,
                        Snippet = item.TryGetProperty("snippet", out var snippet) ? snippet.GetString() ?? string.Empty : string.Empty,
                        Link = item.TryGetProperty("link", out var link) ? link.GetString() ?? string.Empty : string.Empty
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to search product suggestions for \"{Query}\"", query);
            }

            return results;
        }
    }
}
