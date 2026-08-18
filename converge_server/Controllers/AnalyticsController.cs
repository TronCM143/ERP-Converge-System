using converge_server.Data;
using converge_server.Models.Entities;
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

        // ── Sales monitoring ──────────────────────────────────────────────────
        //
        // A note on what "won" and "lost" mean here, because the obvious answer
        // is wrong: they are NOT read from Client.Stage. `ClientStage` has no
        // Lost member at all (the 2026-07-13 MigrateClientStageData migration
        // folded the old Lost value back into Quote), so a client can never be
        // recorded as lost. Quotations CAN: QuotationStatus carries both
        // Approved and Rejected, and both transitions are audit-logged. So the
        // unit of won/lost business here is the QUOTATION, not the client.
        //
        // Time basis is Quotation.UpdatedAt, which is stamped when the status
        // changes. Caveat: editing an already-approved quotation also moves its
        // UpdatedAt, which would re-date that sale into the current month. The
        // AuditLog holds the exact Approved/Rejected timestamps if this ever
        // needs to be exact; UpdatedAt is used here because it is one query and
        // matches how the rest of the app dates a quotation.

        // Headline figures for the CRM dashboard's sales monitor.
        [HttpGet("crm-summary")]
        public async Task<IActionResult> CrmSummary()
        {
            var now = DateTime.UtcNow;
            var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var prevMonthStart = monthStart.AddMonths(-1);

            // One pass over the quotations that matter, then bucket in memory —
            // cheaper than five separate aggregate round-trips.
            var decided = await _context.Quotations
                .AsNoTracking()
                .Where(q => (q.Status == QuotationStatus.Approved || q.Status == QuotationStatus.Rejected)
                            && q.UpdatedAt >= prevMonthStart)
                .Select(q => new { q.Status, q.UpdatedAt, q.GrandTotal })
                .ToListAsync();

            var thisMonth = decided.Where(q => q.UpdatedAt >= monthStart).ToList();
            var prevMonth = decided.Where(q => q.UpdatedAt < monthStart).ToList();

            var salesThisMonth = thisMonth.Where(q => q.Status == QuotationStatus.Approved).Sum(q => q.GrandTotal);
            var salesPrevMonth = prevMonth.Where(q => q.Status == QuotationStatus.Approved).Sum(q => q.GrandTotal);

            // Null rather than 0 when there's no prior month to compare against —
            // "0% change" would be a claim, "no prior month" is the truth.
            double? changePercent = salesPrevMonth == 0
                ? null
                : Math.Round((double)((salesThisMonth - salesPrevMonth) / salesPrevMonth) * 100, 1);

            // Still open: quoted but not yet decided. This is the pipeline value.
            var open = await _context.Quotations
                .AsNoTracking()
                .Where(q => q.Status == QuotationStatus.Draft || q.Status == QuotationStatus.Sent)
                .Select(q => new { q.Status, q.GrandTotal })
                .ToListAsync();

            return Ok(new
            {
                salesThisMonth,
                salesPrevMonth,
                changePercent,
                wonThisMonth = thisMonth.Count(q => q.Status == QuotationStatus.Approved),
                lostThisMonth = thisMonth.Count(q => q.Status == QuotationStatus.Rejected),
                lostValueThisMonth = thisMonth.Where(q => q.Status == QuotationStatus.Rejected).Sum(q => q.GrandTotal),
                activeLeads = await _context.Clients.CountAsync(c => c.Stage == ClientStage.Leads),
                // "Awaiting the customer" — sent out, no decision yet.
                pendingProposals = open.Count(q => q.Status == QuotationStatus.Sent),
                openQuotationValue = open.Sum(q => q.GrandTotal)
            });
        }

        // Won/lost breakdown for a calendar year — backs the sales analytics page.
        [HttpGet("sales-performance")]
        public async Task<IActionResult> SalesPerformance([FromQuery] int year = 0)
        {
            if (year <= 0) year = DateTime.UtcNow.Year;
            var yearStart = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var yearEnd = yearStart.AddYears(1);

            var decided = await _context.Quotations
                .AsNoTracking()
                .Where(q => (q.Status == QuotationStatus.Approved || q.Status == QuotationStatus.Rejected)
                            && q.UpdatedAt >= yearStart && q.UpdatedAt < yearEnd)
                .Select(q => new
                {
                    q.Status,
                    q.UpdatedAt,
                    q.GrandTotal,
                    q.ClientId,
                    ClientName = q.Client != null ? q.Client.Name : "(unknown)"
                })
                .ToListAsync();

            var won = decided.Where(q => q.Status == QuotationStatus.Approved).ToList();
            var lost = decided.Where(q => q.Status == QuotationStatus.Rejected).ToList();

            var months = Enumerable.Range(1, 12).Select(m =>
            {
                var w = won.Where(q => q.UpdatedAt.Month == m).ToList();
                var l = lost.Where(q => q.UpdatedAt.Month == m).ToList();
                return new
                {
                    month = m,
                    name = new DateTime(year, m, 1).ToString("MMMM"),
                    wonCount = w.Count,
                    wonValue = w.Sum(q => q.GrandTotal),
                    lostCount = l.Count,
                    lostValue = l.Sum(q => q.GrandTotal)
                };
            }).ToList();

            var decidedCount = won.Count + lost.Count;

            // Open quotations aren't year-scoped: what's in play is in play now,
            // regardless of which year it was raised in.
            var open = await _context.Quotations
                .AsNoTracking()
                .Where(q => q.Status == QuotationStatus.Draft || q.Status == QuotationStatus.Sent)
                .Select(q => q.GrandTotal)
                .ToListAsync();

            return Ok(new
            {
                year,
                wonCount = won.Count,
                wonValue = won.Sum(q => q.GrandTotal),
                lostCount = lost.Count,
                lostValue = lost.Sum(q => q.GrandTotal),
                openCount = open.Count,
                openValue = open.Sum(),
                // Share of DECIDED quotations that were approved. Open ones are
                // excluded — counting them as losses would understate the rate.
                winRatePercent = decidedCount == 0
                    ? (double?)null
                    : Math.Round(won.Count * 100.0 / decidedCount, 1),
                averageDealSize = won.Count == 0 ? 0m : Math.Round(won.Sum(q => q.GrandTotal) / won.Count, 2),
                months,
                topClients = won
                    .GroupBy(q => new { q.ClientId, q.ClientName })
                    .Select(g => new
                    {
                        clientId = g.Key.ClientId,
                        clientName = g.Key.ClientName,
                        wonCount = g.Count(),
                        wonValue = g.Sum(q => q.GrandTotal)
                    })
                    .OrderByDescending(c => c.wonValue)
                    .Take(5)
                    .ToList(),
                lostClients = lost
                    .GroupBy(q => new { q.ClientId, q.ClientName })
                    .Select(g => new
                    {
                        clientId = g.Key.ClientId,
                        clientName = g.Key.ClientName,
                        lostCount = g.Count(),
                        lostValue = g.Sum(q => q.GrandTotal)
                    })
                    .OrderByDescending(c => c.lostValue)
                    .Take(5)
                    .ToList()
            });
        }

        // Month-by-month booked revenue with the individual deals behind each
        // month — backs the sales history page.
        [HttpGet("sales-history")]
        public async Task<IActionResult> SalesHistory([FromQuery] int year = 0)
        {
            if (year <= 0) year = DateTime.UtcNow.Year;
            var yearStart = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var yearEnd = yearStart.AddYears(1);

            var approved = await _context.Quotations
                .AsNoTracking()
                .Where(q => q.Status == QuotationStatus.Approved
                            && q.UpdatedAt >= yearStart && q.UpdatedAt < yearEnd)
                .Select(q => new
                {
                    q.ClientId,
                    ClientName = q.Client != null ? q.Client.Name : "(unknown)",
                    q.GrandTotal,
                    q.UpdatedAt
                })
                .ToListAsync();

            var months = Enumerable.Range(1, 12).Select(m =>
            {
                var deals = approved.Where(q => q.UpdatedAt.Month == m)
                    .OrderByDescending(q => q.UpdatedAt)
                    .Select(q => new
                    {
                        clientId = q.ClientId,
                        clientName = q.ClientName,
                        value = q.GrandTotal,
                        closedAt = q.UpdatedAt
                    })
                    .ToList();
                return new
                {
                    month = m,
                    name = new DateTime(year, m, 1).ToString("MMMM"),
                    total = deals.Sum(d => d.value),
                    dealsClosed = deals.Count,
                    deals
                };
            }).ToList();

            return Ok(new
            {
                year,
                yearTotal = approved.Sum(q => q.GrandTotal),
                dealsClosed = approved.Count,
                averageSale = approved.Count == 0 ? 0m : Math.Round(approved.Sum(q => q.GrandTotal) / approved.Count, 2),
                months
            });
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
