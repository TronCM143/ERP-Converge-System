namespace converge_server.Services.Interfaces
{
    /// <summary>
    /// Queue of product ids awaiting an image lookup. Producers never block:
    /// TryEnqueue returns false when the queue is full rather than waiting, so
    /// neither product creation nor the backfill scan is ever held up by image
    /// work. See ProductImageQueue for why dropping is safe.
    /// </summary>
    public interface IProductImageQueue
    {
        bool TryEnqueue(int productId);

        IAsyncEnumerable<int> ReadAllAsync(CancellationToken cancellationToken);

        /// <summary>Queue depth, for the backfill endpoint to report progress.</summary>
        int ApproximateCount { get; }
    }
}
