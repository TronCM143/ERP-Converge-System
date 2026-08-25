using System.Threading.Channels;
using converge_server.Services.Interfaces;

namespace converge_server.Services.Products
{
    /* Work queue for product image lookups.

       In-process rather than a broker: the job is one HTTP call per product and
       the only hard requirement is that it happens off the request thread. A
       Redis/Hangfire queue would survive a restart, which this does not — but
       the resumability the spec asks for comes from the data, not the queue.
       Product.ImageSearchAttempted marks every product already tried, so a
       backfill interrupted by a restart is resumed simply by running it again:
       it re-scans and enqueues only what is still unhandled, and never repeats
       a product that succeeded.

       Bounded, and full means DROP the newest rather than block. The producers
       are an HTTP request thread (product creation) and the backfill scan; the
       spec is explicit that neither may be held up by image work, and a dropped
       lookup costs nothing permanent because the same scan will find that
       product again next run. */
    public class ProductImageQueue : IProductImageQueue
    {
        private const int Capacity = 500;

        private readonly Channel<int> _channel = Channel.CreateBounded<int>(
            new BoundedChannelOptions(Capacity)
            {
                FullMode = BoundedChannelFullMode.DropWrite,
                SingleReader = true
            });

        public bool TryEnqueue(int productId) => _channel.Writer.TryWrite(productId);

        public IAsyncEnumerable<int> ReadAllAsync(CancellationToken cancellationToken) =>
            _channel.Reader.ReadAllAsync(cancellationToken);

        public int ApproximateCount => _channel.Reader.Count;
    }
}
