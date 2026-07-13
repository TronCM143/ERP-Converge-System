using System.Text.Json;
using converge_server.Services.Interfaces;
using Microsoft.Extensions.Caching.Distributed;

namespace converge_server.Services.Caching
{
    public class CacheService : ICacheService
    {
        private static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(5);

        private readonly IDistributedCache _cache;
        private readonly ILogger<CacheService> _logger;

        public CacheService(IDistributedCache cache, ILogger<CacheService> logger)
        {
            _cache = cache;
            _logger = logger;
        }

        // Every operation swallows cache-backend failures: if Redis is
        // configured but unreachable, requests fall through to the database
        // instead of erroring out.
        public async Task<T?> GetAsync<T>(string key)
        {
            try
            {
                var json = await _cache.GetStringAsync(key);
                return json == null ? default : JsonSerializer.Deserialize<T>(json);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cache GET failed for key {Key}; falling back to source.", key);
                return default;
            }
        }

        public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null)
        {
            try
            {
                var options = new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl ?? DefaultTtl
                };
                await _cache.SetStringAsync(key, JsonSerializer.Serialize(value), options);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cache SET failed for key {Key}.", key);
            }
        }

        public async Task RemoveAsync(string key)
        {
            try
            {
                await _cache.RemoveAsync(key);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cache REMOVE failed for key {Key}.", key);
            }
        }
    }
}
