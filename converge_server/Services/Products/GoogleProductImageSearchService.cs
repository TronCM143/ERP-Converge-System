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

        public async Task<string?> FindImageUrlAsync(string query, IReadOnlyCollection<string>? mustMatch = null)
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
                    // Several candidates, not one: the top hit is often a
                    // marketplace listing for a different item, and there is no
                    // way to reject it without alternatives to fall back to.
                    + "&searchType=image&num=8&safe=active";

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

                var tokens = (mustMatch ?? Array.Empty<string>())
                    .Where(t => !string.IsNullOrWhiteSpace(t) && t.Length > 1)
                    .Select(t => t.ToLowerInvariant())
                    .ToList();

                string? firstLink = null;
                foreach (var item in items.EnumerateArray())
                {
                    var link = item.TryGetProperty("link", out var l) ? l.GetString() : null;
                    if (string.IsNullOrWhiteSpace(link)) continue;
                    firstLink ??= link;

                    if (tokens.Count == 0) return link;

                    /* Judge the candidate on the text around it: the image
                       title, the page it sits on, and the host. A manufacturer
                       or reseller page for the right model will carry the brand
                       or model somewhere in those three. */
                    var haystack = string.Join(' ', new[]
                    {
                        item.TryGetProperty("title", out var t) ? t.GetString() : null,
                        item.TryGetProperty("snippet", out var sn) ? sn.GetString() : null,
                        item.TryGetProperty("displayLink", out var dl) ? dl.GetString() : null,
                        item.TryGetProperty("image", out var img) && img.TryGetProperty("contextLink", out var cl)
                            ? cl.GetString()
                            : null
                    }.Where(x => !string.IsNullOrWhiteSpace(x))).ToLowerInvariant();

                    if (tokens.Any(haystack.Contains))
                    {
                        return link;
                    }
                }

                /* Nothing matched. Returning null rather than firstLink is the
                   spec's "reject unrelated images, fall back to placeholder":
                   an obviously wrong picture on a quotation is worse than none,
                   because it is the one thing a client will notice. */
                _logger.LogInformation(
                    "No relevant image for \"{Query}\" - {Count} results, none mentioning {Tokens}",
                    query, items.GetArrayLength(), string.Join('/', tokens));
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to search for a product image for \"{Query}\"", query);
                return null;
            }
        }
    }
}
