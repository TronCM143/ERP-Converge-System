using System.Text.Json;
using System.Text.Json.Serialization;
using converge_server.Data;
using converge_server.Models.DTOs.Odoo;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Odoo
{
    /* Read-only Odoo client over JSON-RPC.

       Odoo exposes both XML-RPC and JSON-RPC at /jsonrpc; JSON-RPC is used here
       because System.Text.Json handles it without pulling in an XML-RPC
       dependency. Authentication is `common.login` with an API key in place of
       the password (Odoo accepts an API key anywhere a password is accepted,
       and keys are what you get from Settings → Account Security).

       DEGRADATION IS DELIBERATE. Every public method returns empty/null rather
       than throwing when Odoo is unconfigured, unreachable, or slow. This backs
       a suggestion panel that opens next to a prompt box while someone is
       typing — a hard failure there would interrupt work over an optional aid.
       Failures are logged, not surfaced.

       The uid is cached for the process lifetime: `common.login` is a full
       round trip and the credentials don't change between calls. */
    public class OdooService : IOdooService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<OdooService> _logger;

        private static readonly SemaphoreSlim LoginLock = new(1, 1);
        private static int? _cachedUid;

        private static readonly string[] StopWords =
        {
            "a", "an", "the", "with", "and", "of", "for", "to", "in", "on",
            "unit", "units", "piece", "pieces", "pcs", "set", "sets"
        };

        public OdooService(
            IHttpClientFactory httpClientFactory,
            AppDbContext context,
            IConfiguration configuration,
            ILogger<OdooService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _context = context;
            _configuration = configuration;
            _logger = logger;
        }

        /* Two spellings are accepted for each setting.

           .NET maps a DOUBLE underscore in an environment variable to a config
           section separator, so `Odoo__ApiKey` resolves as `Odoo:ApiKey`. A
           SINGLE underscore is not a separator — `ODOO_API_KEY` stays a flat
           key by that literal name and never reaches `Odoo:ApiKey`.

           The .env in this repo uses the flat ODOO_* form while the rest of the
           file (Groq__ApiKey, GoogleOAuth__ClientId, Sms__M360__ApiKey) uses the
           `__` convention, so the credentials were present but invisible to the
           app. Reading both means either spelling works. */
        private string? Setting(string dotted, string flat) =>
            !string.IsNullOrWhiteSpace(_configuration[dotted])
                ? _configuration[dotted]
                : _configuration[flat];

        private string? BaseUrl => Setting("Odoo:BaseUrl", "ODOO_URL");
        private string? Database => Setting("Odoo:Database", "ODOO_DB");
        private string? Username => Setting("Odoo:Username", "ODOO_USERNAME");
        private string? ApiKey => Setting("Odoo:ApiKey", "ODOO_API_KEY");

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(BaseUrl)
            && !string.IsNullOrWhiteSpace(Database)
            && !string.IsNullOrWhiteSpace(Username)
            && !string.IsNullOrWhiteSpace(ApiKey);

        public async Task<List<OdooQuoteSuggestionDto>> SearchQuotesAsync(string query, int limit = 12)
        {
            var tokens = Tokenize(query);
            if (tokens.Count == 0 || !IsConfigured) return new List<OdooQuoteSuggestionDto>();

            limit = Math.Clamp(limit, 1, 30);

            /* Domain: every token must appear SOMEWHERE on the order (AND across
               tokens, OR across fields), so extra words narrow rather than widen.
               Odoo domains are prefix/Polish notation — for each token we build
               ['|','|', ref, customer, line-desc] and AND the groups together
               with a leading run of '&'. */
            var domain = new List<object>();
            for (var i = 0; i < tokens.Count - 1; i++) domain.Add("&");
            foreach (var token in tokens)
            {
                domain.Add("|");
                domain.Add("|");
                domain.Add(new object[] { "name", "ilike", token });
                domain.Add(new object[] { "partner_id.name", "ilike", token });
                domain.Add(new object[] { "order_line.name", "ilike", token });
            }

            var records = await ExecuteKwAsync("sale.order", "search_read", new object[] { domain }, new Dictionary<string, object>
            {
                ["fields"] = new[] { "name", "partner_id", "date_order", "state", "amount_total", "order_line" },
                ["limit"] = limit,
                ["order"] = "date_order desc"
            });

            if (records == null) return new List<OdooQuoteSuggestionDto>();

            var results = new List<OdooQuoteSuggestionDto>();
            // Line ids per order, collected on the way through so the
            // descriptions can be fetched in ONE follow-up read below rather
            // than one call per order.
            var lineIdsByOrder = new Dictionary<long, List<long>>();

            foreach (var record in records.Value.EnumerateArray())
            {
                var name = GetString(record, "name");
                var customer = GetRelationName(record, "partner_id");

                // Report which field each token hit, so the panel can explain
                // itself. Line descriptions aren't in the payload (only their
                // ids), so a hit that isn't on the reference or the customer is
                // attributed to the items.
                var matchedOn = new List<string>();
                if (tokens.Any(t => name.Contains(t, StringComparison.OrdinalIgnoreCase))) matchedOn.Add("reference");
                if (tokens.Any(t => customer.Contains(t, StringComparison.OrdinalIgnoreCase))) matchedOn.Add("customer");
                if (matchedOn.Count == 0) matchedOn.Add("items");

                results.Add(new OdooQuoteSuggestionDto
                {
                    Id = GetLong(record, "id"),
                    Name = name,
                    CustomerName = customer,
                    OrderDate = GetString(record, "date_order"),
                    State = GetString(record, "state"),
                    AmountTotal = GetDecimal(record, "amount_total"),
                    LineCount = record.TryGetProperty("order_line", out var lines) && lines.ValueKind == JsonValueKind.Array
                        ? lines.GetArrayLength()
                        : 0,
                    MatchedOn = matchedOn
                });

                if (record.TryGetProperty("order_line", out var lineIds) && lineIds.ValueKind == JsonValueKind.Array)
                {
                    // Only the first few — the summary shows at most three, and
                    // reading every line of every hit would be a large payload
                    // for text that is then thrown away.
                    lineIdsByOrder[GetLong(record, "id")] = lineIds
                        .EnumerateArray()
                        .Where(x => x.ValueKind == JsonValueKind.Number)
                        .Take(3)
                        .Select(x => x.GetInt64())
                        .ToList();
                }
            }

            await AttachItemSummariesAsync(results, lineIdsByOrder);
            return results;
        }

        /* Fills in each suggestion's ItemSummary — what the order was actually
           for. Odoo's search_read returns order_line as bare ids, so the
           descriptions need a second read; it is batched across every hit and
           best-effort, because a summary is a nicety and a failed read must not
           cost the user the search results themselves. */
        private async Task AttachItemSummariesAsync(
            List<OdooQuoteSuggestionDto> results,
            Dictionary<long, List<long>> lineIdsByOrder)
        {
            var allLineIds = lineIdsByOrder.Values.SelectMany(x => x).Distinct().ToList();
            if (allLineIds.Count == 0) return;

            JsonElement? lineRecords;
            try
            {
                lineRecords = await ExecuteKwAsync("sale.order.line", "read", new object[] { allLineIds },
                    new Dictionary<string, object> { ["fields"] = new[] { "name" } });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not read Odoo order lines for the suggestion summaries.");
                return;
            }

            if (lineRecords == null) return;

            var nameByLineId = new Dictionary<long, string>();
            foreach (var line in lineRecords.Value.EnumerateArray())
            {
                // A line description can run to several lines of text; only the
                // first is a label, the rest is spec detail.
                var text = GetString(line, "name").Split('\n', '\r').FirstOrDefault()?.Trim() ?? string.Empty;
                if (text.Length > 0) nameByLineId[GetLong(line, "id")] = text;
            }

            foreach (var result in results)
            {
                if (!lineIdsByOrder.TryGetValue(result.Id, out var ids)) continue;
                var parts = ids
                    .Select(id => nameByLineId.TryGetValue(id, out var t) ? t : null)
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .ToList();
                if (parts.Count > 0) result.ItemSummary = string.Join(", ", parts);
            }
        }

        public async Task<OdooOrderDraftDto?> GetOrderDraftAsync(long orderId)
        {
            if (!IsConfigured) return null;

            var orders = await ExecuteKwAsync("sale.order", "read",
                new object[] { new[] { orderId } },
                new Dictionary<string, object> { ["fields"] = new[] { "name" } });

            if (orders == null || orders.Value.GetArrayLength() == 0) return null;
            var orderName = GetString(orders.Value[0], "name");

            var lines = await ExecuteKwAsync("sale.order.line", "search_read",
                new object[] { new List<object> { new object[] { "order_id", "=", orderId } } },
                new Dictionary<string, object>
                {
                    ["fields"] = new[] { "name", "product_uom_qty", "price_unit", "product_id", "display_type" },
                    ["order"] = "sequence"
                });

            if (lines == null) return null;

            // The local catalog, loaded once for all lines rather than queried
            // per line.
            var catalog = await _context.Products.Where(p => p.IsActive).AsNoTracking().ToListAsync();

            var items = new List<OdooDraftItemDto>();
            foreach (var line in lines.Value.EnumerateArray())
            {
                // Section headers and notes are order_line rows with a
                // display_type — they carry no product and no price.
                var displayType = GetString(line, "display_type");
                if (!string.IsNullOrEmpty(displayType)) continue;

                var description = GetString(line, "name");
                if (string.IsNullOrWhiteSpace(description)) continue;

                var qty = (int)Math.Round(GetDecimal(line, "product_uom_qty"));
                var match = ResolveCatalogProduct(GetRelationName(line, "product_id"), description, catalog);

                items.Add(new OdooDraftItemDto
                {
                    RequestedDescription = description.Trim(),
                    Quantity = qty <= 0 ? 1 : qty,
                    OdooUnitPrice = GetDecimal(line, "price_unit"),
                    Matched = match != null,
                    ProductId = match?.Id,
                    ProductName = match?.ProductName,
                    CatalogPrice = match?.Price
                });
            }

            return new OdooOrderDraftDto { Name = orderName, Items = items };
        }

        /* Resolve an Odoo line to a local Product.

           Same discipline as the AI quotation generator: require high token
           coverage or return null. An Odoo line that doesn't genuinely exist in
           the catalog must come back unmatched so the row is flagged for
           sourcing — never silently bound to a lookalike product. */
        private static Product? ResolveCatalogProduct(string odooProductName, string description, List<Product> catalog)
        {
            foreach (var candidate in new[] { odooProductName, description })
            {
                var tokens = Tokenize(candidate);
                if (tokens.Count == 0) continue;

                // ≤2 tokens must match fully; longer descriptions allow a third
                // to be missing (Odoo lines often carry extra prose).
                var required = tokens.Count <= 2 ? tokens.Count : (int)Math.Ceiling(tokens.Count * 0.67);

                Product? best = null;
                var bestHits = 0;

                foreach (var product in catalog)
                {
                    var haystack = Normalize($"{product.ProductName} {product.Brand} {product.Model} {product.Category} {product.Subcategory} {product.Specs}");
                    var hits = tokens.Count(t => haystack.Contains(t));
                    if (hits >= required && hits > bestHits)
                    {
                        best = product;
                        bestHits = hits;
                    }
                }

                if (best != null) return best;
            }

            return null;
        }

        // ── JSON-RPC plumbing ───────────────────────────────────────────────

        private async Task<int?> GetUidAsync()
        {
            if (_cachedUid.HasValue) return _cachedUid;

            await LoginLock.WaitAsync();
            try
            {
                if (_cachedUid.HasValue) return _cachedUid;

                var result = await CallAsync(new
                {
                    service = "common",
                    method = "login",
                    args = new object[] { Database!, Username!, ApiKey! }
                });

                // Odoo returns `false` (not an error) for bad credentials.
                if (result == null || result.Value.ValueKind != JsonValueKind.Number) return null;

                _cachedUid = result.Value.GetInt32();
                return _cachedUid;
            }
            finally
            {
                LoginLock.Release();
            }
        }

        private async Task<JsonElement?> ExecuteKwAsync(string model, string method, object[] args, Dictionary<string, object>? kwargs)
        {
            var uid = await GetUidAsync();
            if (uid == null)
            {
                _logger.LogWarning("Odoo login failed — check Odoo:Username and Odoo:ApiKey.");
                return null;
            }

            /* execute_kw(db, uid, password, model, method, args, kwargs) — `args`
               is ONE element: the list of positional arguments for `method`.

               This was AddRange, which spread that list into the outer array, so
               Odoo received the domain's first element ("|") as the whole first
               positional argument instead of the domain. Every search silently
               returned nothing. */
            var allArgs = new List<object> { Database!, uid.Value, ApiKey!, model, method, args };
            if (kwargs != null) allArgs.Add(kwargs);

            var result = await CallAsync(new
            {
                service = "object",
                method = "execute_kw",
                args = allArgs.ToArray()
            });

            return result?.ValueKind == JsonValueKind.Array ? result : null;
        }

        private async Task<JsonElement?> CallAsync(object parameters)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("Odoo");
                var body = new
                {
                    jsonrpc = "2.0",
                    method = "call",
                    @params = parameters,
                    id = Guid.NewGuid().ToString("N")
                };

                using var response = await client.PostAsJsonAsync("jsonrpc", body);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Odoo returned {Status}", response.StatusCode);
                    return null;
                }

                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

                // JSON-RPC reports application errors in `error` with HTTP 200.
                if (doc.RootElement.TryGetProperty("error", out var error))
                {
                    _logger.LogWarning("Odoo RPC error: {Error}", error.ToString());
                    // A stale uid (session invalidated, key rotated) must not
                    // wedge the process — drop it so the next call re-logs in.
                    _cachedUid = null;
                    return null;
                }

                return doc.RootElement.TryGetProperty("result", out var result)
                    ? result.Clone()
                    : null;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                _logger.LogWarning(ex, "Could not reach Odoo");
                return null;
            }
        }

        // ── Helpers ─────────────────────────────────────────────────────────

        private static string Normalize(string value) =>
            (value ?? string.Empty).Replace('_', ' ').Replace('-', ' ').ToLowerInvariant();

        private static List<string> Tokenize(string value) =>
            Normalize(value)
                .Split(new[] { ' ', ',', '.', '/', '(', ')', '[', ']' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(t => t.Length > 1 && !StopWords.Contains(t))
                .Distinct()
                .ToList();

        private static string GetString(JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? string.Empty : string.Empty;

        private static long GetLong(JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt64() : 0;

        private static decimal GetDecimal(JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;

        /* Odoo many2one fields come back as [id, "Display Name"], or `false`
           when unset — hence the array/kind checks rather than a direct read. */
        private static string GetRelationName(JsonElement e, string name)
        {
            if (!e.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array || v.GetArrayLength() < 2)
            {
                return string.Empty;
            }
            var label = v[1];
            return label.ValueKind == JsonValueKind.String ? label.GetString() ?? string.Empty : string.Empty;
        }
    }
}
