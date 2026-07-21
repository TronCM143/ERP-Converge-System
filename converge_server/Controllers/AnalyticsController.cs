using converge_server.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    // Small read-only aggregate endpoints backing the trend charts on the
    // CRM dashboard and the Inventory page. Any authenticated role can read
    // these — they're just counts, nothing sensitive.
    [ApiController]
    [Route("api/analytics")]
    [Authorize]
    public class AnalyticsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AnalyticsController(AppDbContext context)
        {
            _context = context;
        }

        // New clients created per month — "client requests" coming into the
        // pipeline — for the last `months` months including the current one.
        [HttpGet("client-requests-monthly")]
        public async Task<IActionResult> ClientRequestsMonthly([FromQuery] int months = 6)
        {
            months = Math.Clamp(months, 1, 24);

            var now = DateTime.UtcNow;
            var rangeStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-(months - 1));

            var raw = await _context.Clients
                .AsNoTracking()
                .Where(c => c.CreatedAt >= rangeStart)
                .Select(c => c.CreatedAt)
                .ToListAsync();

            var counts = raw
                .GroupBy(d => new DateTime(d.Year, d.Month, 1))
                .ToDictionary(g => g.Key, g => g.Count());

            var series = new List<object>();
            for (var i = 0; i < months; i++)
            {
                var bucket = rangeStart.AddMonths(i);
                series.Add(new
                {
                    label = bucket.ToString("MMM"),
                    period = bucket.ToString("yyyy-MM"),
                    value = counts.TryGetValue(bucket, out var count) ? count : 0
                });
            }

            return Ok(series);
        }

        // Total item quantity marked Received per week — "products bought" —
        // for the last `weeks` weeks including the current one (weeks start Monday).
        [HttpGet("products-bought-weekly")]
        public async Task<IActionResult> ProductsBoughtWeekly([FromQuery] int weeks = 8)
        {
            weeks = Math.Clamp(weeks, 1, 26);

            var now = DateTime.UtcNow;
            var currentWeekStart = StartOfWeek(now);
            var rangeStart = currentWeekStart.AddDays(-7 * (weeks - 1));

            var raw = await _context.BillOfMaterialItems
                .AsNoTracking()
                .Where(i => i.ReceivedAt != null && i.ReceivedAt >= rangeStart)
                .Select(i => new { i.ReceivedAt, i.RequiredQuantity })
                .ToListAsync();

            var quantities = raw
                .GroupBy(i => StartOfWeek(i.ReceivedAt!.Value))
                .ToDictionary(g => g.Key, g => g.Sum(i => i.RequiredQuantity));

            var series = new List<object>();
            for (var i = 0; i < weeks; i++)
            {
                var bucket = rangeStart.AddDays(7 * i);
                series.Add(new
                {
                    label = bucket.ToString("MMM d"),
                    weekStart = bucket.ToString("yyyy-MM-dd"),
                    value = quantities.TryGetValue(bucket, out var qty) ? qty : 0
                });
            }

            return Ok(series);
        }

        // One series per pipeline stage — Leads (new clients created), and
        // Quote/Proposal/Won (from the StageChanged audit trail, i.e. clients
        // that entered that stage in the period) — bucketed by month or week.
        [HttpGet("pipeline-stage-trend")]
        public async Task<IActionResult> PipelineStageTrend([FromQuery] string granularity = "month", [FromQuery] int periods = 0)
        {
            var byWeek = string.Equals(granularity, "week", StringComparison.OrdinalIgnoreCase);
            if (periods <= 0) periods = byWeek ? 8 : 6;
            periods = Math.Clamp(periods, 1, byWeek ? 26 : 24);

            var now = DateTime.UtcNow;
            DateTime rangeStart;
            if (byWeek)
            {
                rangeStart = StartOfWeek(now).AddDays(-7 * (periods - 1));
            }
            else
            {
                rangeStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-(periods - 1));
            }

            DateTime Bucket(DateTime d) => byWeek ? StartOfWeek(d) : new DateTime(d.Year, d.Month, 1);

            var leadsRaw = await _context.Clients
                .AsNoTracking()
                .Where(c => c.CreatedAt >= rangeStart)
                .Select(c => c.CreatedAt)
                .ToListAsync();
            var leadsCounts = leadsRaw.GroupBy(Bucket).ToDictionary(g => g.Key, g => g.Count());

            var stageChanges = await _context.AuditLogs
                .AsNoTracking()
                .Where(a => a.EntityType == "Client" && a.Action == "StageChanged" && a.ChangedAt >= rangeStart)
                .Where(a => a.NewValue == "Quote" || a.NewValue == "Proposal" || a.NewValue == "Won")
                .Select(a => new { a.ChangedAt, a.NewValue })
                .ToListAsync();

            var quoteCounts = stageChanges.Where(a => a.NewValue == "Quote").GroupBy(a => Bucket(a.ChangedAt)).ToDictionary(g => g.Key, g => g.Count());
            var proposalCounts = stageChanges.Where(a => a.NewValue == "Proposal").GroupBy(a => Bucket(a.ChangedAt)).ToDictionary(g => g.Key, g => g.Count());
            var wonCounts = stageChanges.Where(a => a.NewValue == "Won").GroupBy(a => Bucket(a.ChangedAt)).ToDictionary(g => g.Key, g => g.Count());

            var series = new List<object>();
            for (var i = 0; i < periods; i++)
            {
                var bucket = byWeek ? rangeStart.AddDays(7 * i) : rangeStart.AddMonths(i);
                series.Add(new
                {
                    period = byWeek ? bucket.ToString("MMM d") : bucket.ToString("MMM"),
                    leads = leadsCounts.TryGetValue(bucket, out var l) ? l : 0,
                    quote = quoteCounts.TryGetValue(bucket, out var q) ? q : 0,
                    proposal = proposalCounts.TryGetValue(bucket, out var p) ? p : 0,
                    won = wonCounts.TryGetValue(bucket, out var w) ? w : 0
                });
            }

            return Ok(series);
        }

        private static DateTime StartOfWeek(DateTime date)
        {
            var d = date.Date;
            // Monday-start week.
            var diff = ((int)d.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
            return d.AddDays(-diff);
        }
    }
}
