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
    // RAG pipeline for turning a free-text prompt into quotation line items.
    // The catalog is large (thousands of rows), so it can't be dumped wholesale
    // into a prompt - genuine retrieval has to narrow it down first:
    //   1. Extract - ask Groq to pull the physical items + quantities the user
    //      actually asked for out of the free-text prompt. No catalog involved
    //      yet, so this call stays small regardless of catalog size.
    //   2. Retrieve - scan the REAL, CURRENT database catalog and, for each
    //      extracted item, keyword-rank every active product to shortlist a
    //      handful of plausible candidates (cheap, in-process, scales to
    //      thousands of rows). An item with zero lexical overlap against the
    //      whole catalog is unmatched immediately - no LLM call wasted on it.
    //   3. Decide - hand Groq ONLY those short per-item candidate lists (never
    //      the full catalog) and ask it to pick the single best real productId
    //      per item, or say none of them fit. This is where semantic judgement
    //      (synonyms, spec phrasing) beats plain keyword scoring.
    //   4. Verify - every productId Groq returns is checked against the same
    //      catalog dictionary server-side before use. A hallucinated or
    //      out-of-candidate id is downgraded to unmatched, and every displayed
    //      field (name/brand/model/price) is always re-read from the real
    //      Product row, never from the LLM's output.
    // This guarantees a quotation can never contain a product that doesn't
    // exist in the database, while keeping every prompt bounded regardless of
    // how large the catalog grows. (Groq has no embeddings endpoint, so the
    // retrieval step is lexical rather than vector search - fine at this
    // catalog size; a much larger catalog would want real vector retrieval.)
    public class GroqQuotationGenerationService : IQuotationGenerationService
    {
        private const int MaxCandidatesPerItem = 6;

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
            var (extractedItems, laborDays, laborPersons) = await ExtractItemsAsync(prompt);

            // Retrieve: scan the database BEFORE any catalog-aware generation.
            var catalog = await _context.Products
                .Where(p => p.IsActive)
                .ToListAsync();
            var catalogById = catalog.ToDictionary(p => p.Id);

            // Historical grounding: past prompts and which real products they
            // actually resolved to. A colloquial term ("CCTV") may never
            // appear in a formal catalog name/spec, but if a similar past
            // customer request WAS matched to a specific product, that's
            // real-world evidence the catalog text alone can't provide.
            var pastQuotationData = await _context.Quotations
                .Where(q => q.OriginalPrompt != null && q.OriginalPrompt != "")
                .Select(q => new
                {
                    q.OriginalPrompt,
                    ProductIds = q.MaterialItems.Where(mi => mi.ProductId != null).Select(mi => mi.ProductId!.Value).ToList()
                })
                .ToListAsync();
            var pastPromptTokens = pastQuotationData
                .Where(x => x.ProductIds.Count > 0)
                .Select(x => (PromptTokens: Tokenize(x.OriginalPrompt!), x.ProductIds))
                .ToList();

            var candidatesByItem = extractedItems
                .Select((item, index) => (index, item, candidates: RetrieveCandidates(item.Description, catalog, pastPromptTokens)))
                .ToList();

            // Decide: only items with at least one lexical candidate are worth
            // an LLM call - anything with zero overlap against the whole
            // catalog is unmatched without spending a token on it.
            var itemsNeedingDecision = candidatesByItem.Where(x => x.candidates.Count > 0).ToList();
            var decisions = itemsNeedingDecision.Count > 0
                ? await DecideAsync(itemsNeedingDecision)
                : new Dictionary<int, int?>();

            var draftItems = candidatesByItem.Select(x =>
            {
                var quantity = x.item.Quantity <= 0 ? 1 : x.item.Quantity;

                // Verify: only trust a productId that (a) Groq actually chose
                // and (b) is really in the catalog we retrieved candidates
                // from. Anything else - including "no candidates at all" -
                // surfaces as unmatched rather than a guess.
                if (decisions.TryGetValue(x.index, out var chosenId)
                    && chosenId.HasValue
                    && catalogById.TryGetValue(chosenId.Value, out var product))
                {
                    return new GenerateQuotationDraftItemDto
                    {
                        RequestedDescription = x.item.Description,
                        Quantity = quantity,
                        Matched = true,
                        ProductId = product.Id,
                        ProductName = product.ProductName,
                        Brand = product.Brand,
                        Model = product.Model,
                        Category = product.Category,
                        UnitPrice = product.Price
                    };
                }

                return new GenerateQuotationDraftItemDto
                {
                    RequestedDescription = x.item.Description,
                    Quantity = quantity,
                    Matched = false
                };
            }).ToList();

            return new GenerateQuotationDraftResponseDto
            {
                OriginalPrompt = prompt,
                Items = draftItems,
                Labor = laborDays.HasValue || laborPersons.HasValue
                    ? new GenerateQuotationLaborSuggestionDto { Days = laborDays, Persons = laborPersons }
                    : null
            };
        }

        private async Task<(List<ExtractedItem> Items, int? LaborDays, int? LaborPersons)> ExtractItemsAsync(string prompt)
        {
            const string systemPrompt =
                "You convert a plain-English purchase request into a strict JSON shopping list. " +
                "Extract ONLY the physical products/materials the user explicitly mentions. " +
                "Do not add accessories, tools, cables, mounts, or any item the user did not ask for, " +
                "even if commonly needed for installation. Do not invent brands, models, or specs that " +
                "were not stated. Ignore labor/service/installation actions when listing items - only list " +
                "physical items there. Correct obvious spelling and typing mistakes in product names, brands, " +
                "and model numbers (e.g. \"dahau\" -> \"dahua\", \"camara\" -> \"camera\") while preserving the " +
                "user's actual intent - never change a brand/model into a different real brand/model, only fix " +
                "the spelling of what they clearly meant. For each item return: \"description\" (short phrase " +
                "capturing what was asked, spelling-corrected, including any brand/model/spec keywords the user " +
                "gave) and \"quantity\" (integer; default to 1 if not stated). Separately, also extract any " +
                "labor/manpower/installation crew details mentioned: \"laborDays\" (integer number of days of " +
                "work/installation, or null if not mentioned) and \"laborPersons\" (integer number of " +
                "workers/people/manpower for that labor, or null if not mentioned) - these describe service " +
                "duration and crew size, not a physical item, so never create an item entry for them. Respond " +
                "with ONLY valid JSON of this exact shape, no prose, no markdown fences: " +
                "{\"items\":[{\"description\":\"...\",\"quantity\":1}],\"laborDays\":null,\"laborPersons\":null}";

            var rawContent = await CallGroqAsync(systemPrompt, prompt);

            ExtractedItemsPayload? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<ExtractedItemsPayload>(
                    StripMarkdownFences(rawContent),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse Groq extraction response: {Content}", rawContent);
                throw new InvalidOperationException("Could not understand the AI service's response.");
            }

            var items = parsed?.Items?.Where(i => !string.IsNullOrWhiteSpace(i.Description)).ToList()
                        ?? new List<ExtractedItem>();
            return (items, parsed?.LaborDays, parsed?.LaborPersons);
        }

        // Lexical retrieval: rank the whole catalog by token overlap against
        // the item description and keep only the top few plausible options.
        // This is the piece that lets a 3000+ row catalog stay usable - the
        // LLM never sees more than a handful of real candidates per item.
        // Also folds in historical grounding from past quotation prompts (see
        // GenerateDraftAsync) so a colloquial phrasing that shares no tokens
        // with the formal catalog text can still surface a real candidate.
        private static List<Product> RetrieveCandidates(
            string description,
            List<Product> catalog,
            List<(List<string> PromptTokens, List<int> ProductIds)> pastPromptTokens)
        {
            var tokens = Tokenize(description);
            if (tokens.Count == 0) return new List<Product>();

            var historicalScoreByProductId = new Dictionary<int, int>();
            foreach (var (promptTokens, productIds) in pastPromptTokens)
            {
                var overlap = promptTokens.Count(tokens.Contains);
                if (overlap == 0) continue;
                foreach (var id in productIds)
                {
                    historicalScoreByProductId[id] = historicalScoreByProductId.TryGetValue(id, out var existing)
                        ? Math.Max(existing, overlap)
                        : overlap;
                }
            }

            return catalog
                .Select(p =>
                {
                    var haystack = Normalize($"{p.ProductName} {p.Brand} {p.Category} {p.Subcategory} {p.Model} {p.Specs}");
                    var brandHaystack = Normalize(p.Brand);
                    var matchedCount = tokens.Count(t => haystack.Contains(t));
                    var brandBonus = brandHaystack.Length > 0 && tokens.Any(brandHaystack.Contains) ? 1 : 0;
                    var historicalBonus = historicalScoreByProductId.TryGetValue(p.Id, out var h) ? h : 0;
                    return (product: p, score: matchedCount * 10 + brandBonus + historicalBonus * 3, matchedCount, historicalBonus);
                })
                .Where(x => x.matchedCount > 0 || x.historicalBonus > 0)
                .OrderByDescending(x => x.score)
                .Take(MaxCandidatesPerItem)
                .Select(x => x.product)
                .ToList();
        }

        private async Task<Dictionary<int, int?>> DecideAsync(
            List<(int index, ExtractedItem item, List<Product> candidates)> itemsWithCandidates)
        {
            var itemBlocks = itemsWithCandidates.Select(x =>
            {
                var candidateLines = x.candidates.Select(p =>
                    $"    {p.Id} | {p.ProductName.Replace('_', ' ')} | {p.Brand} | {p.Model} | {TruncateSpecs(p.Specs)} | ₱{p.Price}");
                return $"Item {x.index}: \"{x.item.Description}\" (qty {x.item.Quantity})\n  Candidates:\n{string.Join('\n', candidateLines)}";
            });

            var systemPrompt =
                "You are a purchasing assistant matching requested items to real product candidates from " +
                "our database. For each numbered item below, pick the SINGLE candidate that best matches what " +
                "was requested, using its id. If none of the listed candidates are actually a reasonable match " +
                "(wrong product entirely, not just an imperfect spec), return null for that item.\n\n" +
                "CRITICAL: You may ONLY return a productId that appears in that item's own candidate list, or " +
                "null. Never return an id from a different item's list, and never invent an id.\n\n" +
                "Respond with ONLY valid JSON of this exact shape, no prose, no markdown fences: " +
                "{\"decisions\":[{\"itemIndex\":0,\"productId\":123}]} (productId may be null)";

            var userPrompt = string.Join("\n\n", itemBlocks);
            var rawContent = await CallGroqAsync(systemPrompt, userPrompt);

            DecisionPayload? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<DecisionPayload>(
                    StripMarkdownFences(rawContent),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse Groq decision response: {Content}", rawContent);
                // Don't fail the whole draft over a malformed decision reply -
                // every item just falls back to unmatched (verified downstream).
                return new Dictionary<int, int?>();
            }

            var validCandidateIds = itemsWithCandidates.ToDictionary(
                x => x.index,
                x => x.candidates.Select(p => p.Id).ToHashSet());

            var result = new Dictionary<int, int?>();
            foreach (var decision in parsed?.Decisions ?? new List<Decision>())
            {
                if (decision.ProductId.HasValue
                    && validCandidateIds.TryGetValue(decision.ItemIndex, out var allowedIds)
                    && allowedIds.Contains(decision.ProductId.Value))
                {
                    result[decision.ItemIndex] = decision.ProductId;
                }
            }
            return result;
        }

        private async Task<string> CallGroqAsync(string systemPrompt, string userPrompt)
        {
            var client = _httpClientFactory.CreateClient("Groq");
            var requestBody = new GroqChatRequest
            {
                // Groq retires models; llama-3.3-70b-versatile was withdrawn and every
                // generate call started coming back 404 model_not_found, surfaced to
                // the user as "The AI service could not process that prompt." Both
                // this fallback and appsettings' Groq:Model have to be a model the
                // account can actually see — check /v1/models when it breaks again.
                Model = _configuration["Groq:Model"] ?? "openai/gpt-oss-120b",
                Temperature = 0.1,
                ResponseFormat = new GroqResponseFormat { Type = "json_object" },
                Messages = new List<GroqMessage>
                {
                    new GroqMessage { Role = "system", Content = systemPrompt },
                    new GroqMessage { Role = "user", Content = userPrompt }
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

            return rawContent;
        }

        private static string TruncateSpecs(string specs)
        {
            const int maxLength = 160;
            if (string.IsNullOrEmpty(specs) || specs.Length <= maxLength) return specs.Replace('_', ' ');
            return specs[..maxLength].Replace('_', ' ') + "…";
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

            [JsonPropertyName("laborDays")]
            public int? LaborDays { get; set; }

            [JsonPropertyName("laborPersons")]
            public int? LaborPersons { get; set; }
        }

        private class ExtractedItem
        {
            [JsonPropertyName("description")]
            public string Description { get; set; } = string.Empty;

            [JsonPropertyName("quantity")]
            public int Quantity { get; set; } = 1;
        }

        private class DecisionPayload
        {
            [JsonPropertyName("decisions")]
            public List<Decision>? Decisions { get; set; }
        }

        private class Decision
        {
            [JsonPropertyName("itemIndex")]
            public int ItemIndex { get; set; }

            [JsonPropertyName("productId")]
            public int? ProductId { get; set; }
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
