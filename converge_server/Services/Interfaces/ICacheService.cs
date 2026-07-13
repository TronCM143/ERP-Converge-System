namespace converge_server.Services.Interfaces
{
    /// <summary>
    /// Read-through cache used to avoid re-querying hot, mostly-read data
    /// (product catalog, CRM client list). Backed by Redis when a
    /// ConnectionStrings:Redis value is configured, otherwise by in-process
    /// memory so local dev works without a Redis instance.
    /// </summary>
    public interface ICacheService
    {
        Task<T?> GetAsync<T>(string key);
        Task SetAsync<T>(string key, T value, TimeSpan? ttl = null);
        Task RemoveAsync(string key);
    }
}
