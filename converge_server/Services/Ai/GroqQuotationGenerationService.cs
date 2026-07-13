using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using converge_server.Data;
using converge_server.Models.DTOs.Quotation;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Ai
{
    // Two-stage RAG-style pipeline for turning a free-text prompt into quotation line items:
    //   1. Retrieve nothing yet - ask Groq to EXTRACT the items the user actually asked for
    //      (no inventing extras) as structured JSON.
    //   2. Retrieve: for each extracted item, look up real candidates from the Products table
    //      (lexical keyword scoring - the catalog is small/structured enough that this beats
    //      the cost/complexity of a vector store, and Groq has no embeddings endpoint anyway).
    //      Items with no good catalog match are returned as unmatched/"unavailable" rather than
    //      hallucinated into existence.
    public class GroqQuotationGenerationService : IQuotationGenerationService
    {
        private static readonly string[] StopWords =
        {
            "a", "an", "the", "with", "and", "of", "for", "to", "in", "on", "unit", "units",
            "piece", "pieces", "pcs", "set", "sets", "installation", "install", "installed"
        };

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GroqQuotationGenerationService> _logger;

        public GroqQuotationGenerationService(
            IHttpClientFactory httpClientFactory,
            AppDbContext context,
            IConfiguration configuration,
            ILogger<GroqQuotationGenerationService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _context = context;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<GenerateQuotationDraftResponseDto> GenerateDraftAsync(string prompt)
        {
            var extractedItems = await ExtractItemsAsync(prompt);

            var catalog = await _context.Products
                .Where(p => p.IsActive)
                .ToListAsync();

            var draftItems = extractedItems
                .Select(item => MatchToCatalog(item, catalog))
                .ToList();

            return new GenerateQuotationDraftResponseDto
            {
                OriginalPrompt = prompt,
                Items = draftItems
            };
        }

        private async Task<List<ExtractedItem>> ExtractItemsAsync(string prompt)
        {
            const string systemPrompt =
                "You convert a plain-English purchase request into a strict JSON shopping list. " +
                "Extract ONLY the physical products/materials the user explicitly mentions. " +
                "Do not add accessories, tools, cables, mounts, or any item the user did not ask for, " +
                "even if commonly needed for installation. Do not invent brands, models, or specs that " +
                "were not stated. Ignore labor/service/installation actions - only list physical items. " +
                "For each item return: \"description\" (short phrase capturing what was asked, including " +
                "any brand/model/spec keywords the user gave) and \"quantity\" (integer; default to 1 if " +
                "not stated). Respond with ONLY valid JSON of this exact shape, no prose, no markdown " +
                "fences: {\"items\":[{\"description\":\"...\",\"quantity\":1}]}";

            var client = _httpClientFactory.CreateClient("Groq");
            var requestBody = new GroqChatRequest
            {
                Model = _configuration["Groq:Model"] ?? "llama-3.3-70b-versatile",
                Temperature = 0.1,
                ResponseFormat = new GroqResponseFormat { Type = "json_object" },
                Messages = new List<GroqMessage>
                {
                    new GroqMessage { Role = "system", Content = systemPrompt },
                    new GroqMessage { Role = "user", Content = prompt }
                }
            };

            HttpResponseMessage response;
            try
            {
                response = await client.PostAsJsonAsync("chat/completions", requestBody);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Failed to reach Groq API");
                throw new InvalidOperationException("Could not reach the AI service. Try again in a moment.");
            }

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                _logger.LogError("Groq API returned {StatusCode}: {Body}", response.StatusCode, errorBody);
                throw new InvalidOperationException("The AI service could not process that prompt.");
            }

            var payload = await response.Content.ReadFromJsonAsync<GroqChatResponse>();
            var rawContent = payload?.Choices?.FirstOrDefault()?.Message?.Content;
            if (string.IsNullOrWhiteSpace(rawContent))
            {
                throw new InvalidOperationException("The AI service returned an empty response.");
            }

            var jsonText = StripMarkdownFences(rawContent);

            ExtractedItemsPayload? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<ExtractedItemsPayload>(
                    jsonText,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse Groq JSON response: {Content}", rawContent);
                throw new InvalidOperationException("Could not understand the AI service's response.");
            }

            return parsed?.Items?.Where(i => !string.IsNullOrWhiteSpace(i.Description)).ToList()
                   ?? new List<ExtractedItem>();
        }

        private static string StripMarkdownFences(string content)
        {
            var trimmed = content.Trim();
            if (trimmed.StartsWith("```"))
            {
                var firstNewline = trimmed.IndexOf('\n');
                var lastFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
                if (firstNewline >= 0 && lastFence > firstNewline)
                {
                    trimmed = trimmed[(firstNewline + 1)..lastFence].Trim();
                }
            }
            return trimmed;
        }

        private static GenerateQuotationDraftItemDto MatchToCatalog(ExtractedItem item, List<Product> catalog)
        {
            var quantity = item.Quantity <= 0 ? 1 : item.Quantity;
            var tokens = Tokenize(item.Description);

            if (tokens.Count == 0)
            {
                return new GenerateQuotationDraftItemDto
                {
                    RequestedDescription = item.Description,
                    Quantity = quantity,
                    Matched = false
                };
            }

            // A short description (e.g. "RTX 5070") gives us little room for error, so every
            // token must show up somewhere on the product before we call it a match - a single
            // generic word (like "rtx" also appearing inside "rtx3050") is not enough evidence.
            // Longer descriptions get some slack for filler words the LLM didn't fully strip.
            var requiredCoverage = tokens.Count <= 2 ? 1.0 : 0.67;

            Product? best = null;
            var bestCoverage = 0.0;
            var bestRank = -1;

            foreach (var product in catalog)
            {
                var haystack = Normalize(
                    $"{product.ProductName} {product.Brand} {product.Category} {product.Subcategory} {product.Model} {product.Specs}");
                var brandHaystack = Normalize(product.Brand);

                var matchedCount = tokens.Count(token => haystack.Contains(token));
                var coverage = matchedCount / (double)tokens.Count;
                if (coverage < requiredCoverage) continue;

                // Tie-break equally-covered candidates by whether the query also names the brand.
                var brandBonus = brandHaystack.Length > 0 && tokens.Any(brandHaystack.Contains) ? 1 : 0;
                var rank = matchedCount * 10 + brandBonus;

                if (rank > bestRank)
                {
                    best = product;
                    bestCoverage = coverage;
                    bestRank = rank;
                }
            }

            if (best != null && bestCoverage >= requiredCoverage)
            {
                return new GenerateQuotationDraftItemDto
                {
                    RequestedDescription = item.Description,
                    Quantity = quantity,
                    Matched = true,
                    ProductId = best.Id,
                    ProductName = best.ProductName,
                    Brand = best.Brand,
                    Model = best.Model,
                    Category = best.Category,
                    UnitPrice = best.Price
                };
            }

            return new GenerateQuotationDraftItemDto
            {
                RequestedDescription = item.Description,
                Quantity = quantity,
                Matched = false
            };
        }

        private static string Normalize(string value)
        {
            return value.Replace('_', ' ').Replace('-', ' ').ToLowerInvariant();
        }

        private static List<string> Tokenize(string description)
        {
            return Normalize(description)
                .Split(new[] { ' ', ',', '.', '/' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(t => t.Length > 1 && !StopWords.Contains(t))
                .Distinct()
                .ToList();
        }

        private class ExtractedItemsPayload
        {
            [JsonPropertyName("items")]
            public List<ExtractedItem>? Items { get; set; }
        }

        private class ExtractedItem
        {
            [JsonPropertyName("description")]
            public string Description { get; set; } = string.Empty;

            [JsonPropertyName("quantity")]
            public int Quantity { get; set; } = 1;
        }

        private class GroqChatRequest
        {
            [JsonPropertyName("model")]
            public string Model { get; set; } = string.Empty;

            [JsonPropertyName("messages")]
            public List<GroqMessage> Messages { get; set; } = new List<GroqMessage>();

            [JsonPropertyName("temperature")]
            public double Temperature { get; set; }

            [JsonPropertyName("response_format")]
            public GroqResponseFormat? ResponseFormat { get; set; }
        }

        private class GroqMessage
        {
            [JsonPropertyName("role")]
            public string Role { get; set; } = string.Empty;

            [JsonPropertyName("content")]
            public string Content { get; set; } = string.Empty;
        }

        private class GroqResponseFormat
        {
            [JsonPropertyName("type")]
            public string Type { get; set; } = "json_object";
        }

        private class GroqChatResponse
        {
            [JsonPropertyName("choices")]
            public List<GroqChoice>? Choices { get; set; }
        }

        private class GroqChoice
        {
            [JsonPropertyName("message")]
            public GroqMessage? Message { get; set; }
        }
    }
}
