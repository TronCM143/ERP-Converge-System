using converge_server.Services.Interfaces;

namespace converge_server.Services.Products
{
    /* Drains the product image queue, one product at a time.

       Single consumer on purpose. The spec's safety requirement is not to
       overload the external service, and the simplest honest way to hold to a
       rate limit is to have exactly one thing making the calls: a parallel
       worker pool would need a shared limiter to achieve the same thing and
       could still burst past it.

       Failure policy: retry with exponential backoff, then give up on that
       product and move on. A product without an image is a cosmetic gap, and a
       worker that retries one bad row forever starves every other product in
       the queue. ResolveProductImageAsync marks the attempt either way, so a
       given product is not retried on the next backfill unless it is forced. */
    public class ProductImageWorker : BackgroundService
    {
        // Minimum gap between external lookups. Google Custom Search bills per
        // query and rate-limits free tiers hard; one every two seconds keeps a
        // 3000-row backfill inside a day without ever bursting.
        private static readonly TimeSpan MinDelayBetweenLookups = TimeSpan.FromSeconds(2);
        private const int MaxAttempts = 3;

        private readonly IProductImageQueue _queue;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<ProductImageWorker> _logger;

        public ProductImageWorker(
            IProductImageQueue queue,
            IServiceScopeFactory scopeFactory,
            ILogger<ProductImageWorker> logger)
        {
            _queue = queue;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Product image worker started.");

            await foreach (var productId in _queue.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessAsync(productId, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // Nothing may kill the loop: one unhandled failure would end
                    // image processing for the lifetime of the process.
                    _logger.LogError(ex, "Product image worker failed on product {ProductId}", productId);
                }

                await Task.Delay(MinDelayBetweenLookups, stoppingToken);
            }
        }

        private async Task ProcessAsync(int productId, CancellationToken stoppingToken)
        {
            for (var attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                try
                {
                    /* A scope per product: ProductService and its DbContext are
                       scoped, and a BackgroundService is a singleton — resolving
                       them once and holding them would keep one DbContext alive
                       for the life of the process, accumulating tracked entities
                       and eventually serving stale reads. */
                    using var scope = _scopeFactory.CreateScope();
                    var products = scope.ServiceProvider.GetRequiredService<IProductService>();

                    var result = await products.ResolveProductImageAsync(productId);
                    _logger.LogInformation(
                        result.Found
                            ? "Found an image for product {ProductId}."
                            : "No usable image for product {ProductId}.",
                        productId);
                    return;
                }
                catch (KeyNotFoundException)
                {
                    // Deleted between being queued and being processed.
                    return;
                }
                catch (Exception ex) when (attempt < MaxAttempts)
                {
                    // 2s, 4s, 8s — enough to ride out a transient network blip or
                    // a short-lived rate limit without hammering.
                    var backoff = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                    _logger.LogWarning(ex,
                        "Image lookup for product {ProductId} failed (attempt {Attempt}/{Max}); retrying in {Backoff}s",
                        productId, attempt, MaxAttempts, backoff.TotalSeconds);
                    await Task.Delay(backoff, stoppingToken);
                }
            }

            _logger.LogWarning("Giving up on the image for product {ProductId} after {Max} attempts.", productId, MaxAttempts);
        }
    }
}
