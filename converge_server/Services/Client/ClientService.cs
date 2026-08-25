using converge_server.Data;
using converge_server.Models.DTOs.Client;
using converge_server.Models.Entities;
using converge_server.Services.Caching;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace converge_server.Services.Clients
{
    public class ClientService : IClientService
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;
        private readonly IQuoteApprovalService _approvalService;
        private readonly INotificationDispatchService _dispatchService;
        private readonly ICacheService _cache;
        private readonly IWonDealSheetService _wonDealSheetService;

        public ClientService(
            AppDbContext context,
            IAuditService auditService,
            INotificationDispatchService dispatchService,
            ICacheService cache,
            IWonDealSheetService wonDealSheetService,
            IQuoteApprovalService approvalService)
        {
            _context = context;
            _auditService = auditService;
            _dispatchService = dispatchService;
            _cache = cache;
            _wonDealSheetService = wonDealSheetService;
            _approvalService = approvalService;
        }

        public async Task<List<ClientResponseDto>> GetClientsAsync()
        {
            var cached = await _cache.GetAsync<List<ClientResponseDto>>(CacheKeys.Clients);
            if (cached != null)
            {
                return cached;
            }

            var clients = await _context.Clients
                .OrderBy(c => c.SortOrder)
                .ThenBy(c => c.Id)
                .Select(c => new ClientResponseDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Address = c.Address,
                    ContactNumber = c.ContactNumber,
                    ContactPerson = c.ContactPerson,
                    Email = c.Email,
                    Notes = c.Notes,
                    Stage = c.Stage.ToString(),
                    AccentColor = c.AccentColor,
                    QuotationCount = c.Quotations.Count,
                    TotalSales = c.Quotations.Where(q => q.Status == QuotationStatus.Approved).Sum(q => (decimal?)q.GrandTotal) ?? 0,
                    // Newest quotation regardless of status — this is what the
                    // board card shows, so a client with a live (unapproved)
                    // deal reads as its real value instead of a flat 0.
                    CurrentOpportunity = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => (decimal?)q.GrandTotal)
                        .FirstOrDefault(),
                    // Same "newest quotation" the gate judges, so the badge on the
                    // card and the server's answer to a drag can never disagree.
                    ApprovalState = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => q.ApprovalState.ToString())
                        .FirstOrDefault() ?? "NotRequired",
                    CurrentService = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => q.QuotationName)
                        .FirstOrDefault(),
                    LastUpdated = c.Quotations.Any() ? c.Quotations.Max(q => q.UpdatedAt) : c.CreatedAt,
                    CreatedAt = c.CreatedAt
                })
                .ToListAsync();

            await _cache.SetAsync(CacheKeys.Clients, clients, TimeSpan.FromMinutes(2));
            return clients;
        }

        public async Task<ClientResponseDto?> GetClientAsync(int clientId)
        {
            return await _context.Clients
                .Where(c => c.Id == clientId)
                .Select(c => new ClientResponseDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Address = c.Address,
                    ContactNumber = c.ContactNumber,
                    ContactPerson = c.ContactPerson,
                    Email = c.Email,
                    Notes = c.Notes,
                    Stage = c.Stage.ToString(),
                    AccentColor = c.AccentColor,
                    QuotationCount = c.Quotations.Count,
                    TotalSales = c.Quotations.Where(q => q.Status == QuotationStatus.Approved).Sum(q => (decimal?)q.GrandTotal) ?? 0,
                    // Newest quotation regardless of status — this is what the
                    // board card shows, so a client with a live (unapproved)
                    // deal reads as its real value instead of a flat 0.
                    CurrentOpportunity = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => (decimal?)q.GrandTotal)
                        .FirstOrDefault(),
                    // Same "newest quotation" the gate judges, so the badge on the
                    // card and the server's answer to a drag can never disagree.
                    ApprovalState = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => q.ApprovalState.ToString())
                        .FirstOrDefault() ?? "NotRequired",
                    CurrentService = c.Quotations
                        .OrderByDescending(q => q.CreatedAt)
                        .Select(q => q.QuotationName)
                        .FirstOrDefault(),
                    LastUpdated = c.Quotations.Any() ? c.Quotations.Max(q => q.UpdatedAt) : c.CreatedAt,
                    CreatedAt = c.CreatedAt
                })
                .FirstOrDefaultAsync();
        }

        public async Task<ClientResponseDto> CreateClientAsync(CreateClientDto dto)
        {
            // New cards land at the bottom of their column.
            var maxSortOrder = await _context.Clients.MaxAsync(c => (int?)c.SortOrder) ?? 0;

            var client = new Client
            {
                Name = dto.Name,
                Address = dto.Address,
                ContactNumber = dto.ContactNumber,
                ContactPerson = dto.ContactPerson,
                Email = dto.Email,
                Notes = dto.Notes,
                Stage = ClientStage.Leads,
                SortOrder = maxSortOrder + 1,
                CreatedAt = DateTime.UtcNow
            };

            _context.Clients.Add(client);
            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            await _auditService.LogAsync("Client", client.Id.ToString(), "Created", "system", null, JsonSerializer.Serialize(dto));

            return (await GetClientAsync(client.Id))!;
        }

        public async Task<ClientResponseDto?> UpdateClientAsync(int clientId, CreateClientDto dto)
        {
            var client = await _context.Clients.FindAsync(clientId);
            if (client == null)
            {
                return null;
            }

            client.Name = dto.Name;
            client.Address = dto.Address;
            client.ContactNumber = dto.ContactNumber;
            client.ContactPerson = dto.ContactPerson;
            client.Email = dto.Email;
            client.Notes = dto.Notes;

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);
            await _auditService.LogAsync("Client", clientId.ToString(), "Updated", "system", null, JsonSerializer.Serialize(dto));

            return await GetClientAsync(clientId);
        }

        public async Task<ClientResponseDto?> UpdateClientAccentAsync(int clientId, string? accentColor)
        {
            var client = await _context.Clients.FindAsync(clientId);
            if (client == null)
            {
                return null;
            }

            // Normalised to lowercase so "#1F6FB2" and "#1f6fb2" don't render as
            // two different-looking values in the picker's "current colour" dot.
            client.AccentColor = string.IsNullOrWhiteSpace(accentColor)
                ? null
                : accentColor.Trim().ToLowerInvariant();

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            // Deliberately not audit-logged: a card colour is a display
            // preference, and logging it would bury real pipeline changes in
            // the activity feed.

            return await GetClientAsync(clientId);
        }

        public async Task<(ClientResponseDto? Client, bool WonSheetSaved)> UpdateClientStageAsync(int clientId, ClientStage stage)
        {
            var client = await _context.Clients.FindAsync(clientId);
            if (client == null)
            {
                return (null, false);
            }

            var result = await PrepareStageChangeAsync(client, stage, "system");
            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            var wonSheetSaved = false;
            if (result != null)
            {
                await _auditService.LogAsync("Client", clientId.ToString(), "StageChanged", "system", result.OldStage.ToString(), result.NewStage.ToString(), $"Stage changed from {result.OldStage} to {result.NewStage}");

                // Dispatch notifications
                await _dispatchService.DispatchAsync(Models.Entities.NotificationType.StageChanged, "Client Stage Changed", $"Client {client.Name} moved from {result.OldStage} to {result.NewStage}.");

                if (result.EnteredWon)
                {
                    var approved = await ApproveWonQuotationAsync(client, "system");
                    if (approved != null) await _context.SaveChangesAsync();

                    wonSheetSaved = await HandleWonAsync(client);
                }
                // Kept in step with the board's reorder path: whichever route a
                // client reaches Lost by, its sent quotation is settled the same
                // way. No reason is available here — this endpoint has no dialog
                // behind it.
                else if (result.EnteredLost)
                {
                    var rejected = await RejectLostQuotationAsync(client, "system", null);
                    if (rejected != null) await _context.SaveChangesAsync();
                }
            }

            return (await GetClientAsync(clientId), wonSheetSaved);
        }

        public async Task<(bool Success, bool WonSheetSaved, string? DecidedQuotationNumber, decimal? DecidedAmount)> ReorderClientsAsync(ClientStage stage, List<int> orderedClientIds, string actorUsername, List<string>? wonNotifyEmails = null, string? lossReason = null, bool skipApproval = false)
        {
            var clientsToUpdate = await _context.Clients
                .Where(c => orderedClientIds.Contains(c.Id))
                .ToListAsync();

            if (clientsToUpdate.Count == 0)
            {
                return (false, false, null, null);
            }

            // At most one card changes column per drag; the rest are same-column reorders.
            Client? movedClient = null;
            StageChangeResult? stageChange = null;

            foreach (var client in clientsToUpdate)
            {
                if (client.Stage != stage)
                {
                    movedClient = client;
                    stageChange = await PrepareStageChangeAsync(client, stage, actorUsername, skipApproval);
                }
                client.SortOrder = orderedClientIds.IndexOf(client.Id);
            }

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            var wonSheetSaved = false;
            Quotation? decided = null;
            if (stageChange != null && movedClient != null)
            {
                // The loss reason the board collected has no column of its own on Client,
                // so the audit entry is where it is kept — otherwise the dialog
                // asks "why?" and throws the answer away.
                var stageDetail = $"Stage changed from {stageChange.OldStage} to {stageChange.NewStage}"
                    + (stageChange.EnteredLost && !string.IsNullOrWhiteSpace(lossReason) ? $" — {lossReason.Trim()}" : "");
                await _auditService.LogAsync("Client", movedClient.Id.ToString(), "StageChanged", actorUsername, stageChange.OldStage.ToString(), stageChange.NewStage.ToString(), stageDetail);

                await _dispatchService.DispatchAsync(Models.Entities.NotificationType.StageChanged, "Client Stage Changed", $"Client {movedClient.Name} moved from {stageChange.OldStage} to {stageChange.NewStage}.");

                if (stageChange.EnteredWon)
                {
                    // Book the deal BEFORE the sheet/email so the row logged to
                    // the spreadsheet reflects an approved quotation.
                    decided = await ApproveWonQuotationAsync(movedClient, actorUsername);
                    if (decided != null) await _context.SaveChangesAsync();

                    wonSheetSaved = await HandleWonAsync(movedClient, wonNotifyEmails);
                }
                else if (stageChange.EnteredLost)
                {
                    // The mirror of the Won booking. Every "lost" figure in the
                    // app — the won/lost chart included — counts REJECTED
                    // quotations, so a card in Lost whose quotation is still
                    // sitting at Sent registers nowhere.
                    decided = await RejectLostQuotationAsync(movedClient, actorUsername, lossReason);
                    if (decided != null) await _context.SaveChangesAsync();
                }
            }

            return (true, wonSheetSaved, decided?.QuotationNumber, decided?.GrandTotal);
        }

        // Fires everything tied to a client entering Won: the notification
        // email and a logged row in the "Deals Won" Google Sheet. Named after
        // the client's latest quotation, e.g. project code "QTN-2026-0004".
        // overrideEmails is non-null only when the Kanban drag went through the
        // pre-move confirmation dialog: null keeps the default admin-configured
        // recipient list, a (possibly empty) list sends to exactly those emails.
        private async Task<bool> HandleWonAsync(Client client, List<string>? overrideEmails = null)
        {
            var latestQuotation = await _context.Quotations
                .Where(q => q.ClientId == client.Id)
                .OrderByDescending(q => q.CreatedAt)
                .Select(q => new { q.QuotationNumber, q.GrandTotal })
                .FirstOrDefaultAsync();

            var subject = $"🎉 Deal Won — {client.Name}";
            var body = latestQuotation != null
                ? $"<p>Quotation <strong>{latestQuotation.QuotationNumber}</strong> from client <strong>{client.Name}</strong> was already <strong>WON</strong>! 🎉</p>"
                : $"<p>Client <strong>{client.Name}</strong> was moved to <strong>WON</strong>! 🎉</p>";

            if (overrideEmails != null)
            {
                await _dispatchService.DispatchToExplicitRecipientsAsync(Models.Entities.NotificationType.WonApproval, subject, body, overrideEmails);
            }
            else
            {
                await _dispatchService.DispatchAsync(Models.Entities.NotificationType.WonApproval, subject, body);
            }

            return await _wonDealSheetService.AppendWonDealAsync(
                projectCode: latestQuotation?.QuotationNumber ?? $"CLIENT-{client.Id}",
                clientName: client.Name,
                totalSales: latestQuotation?.GrandTotal ?? 0m,
                wonDate: DateTime.UtcNow);
        }

        public async Task<StageChangeResult?> PrepareStageChangeAsync(Client trackedClient, ClientStage newStage, string actorUsername, bool skipApproval = false)
        {
            if (trackedClient.Stage == newStage)
            {
                return null;
            }

            /* The approval gate, enforced here rather than in the controller so
               EVERY route into Proposal passes it - the board's reorder, the
               PATCH stage endpoint, and anything added later. The spec requires
               that an API call cannot bypass approval, and a check in one
               controller action would not deliver that. */
            if (newStage == ClientStage.Proposal && trackedClient.Stage != ClientStage.Proposal)
            {
                var gate = await _approvalService.EvaluateClientAsync(trackedClient.Id);
                if (!gate.Allowed)
                {
                    if (!skipApproval)
                    {
                        throw new ApprovalRequiredException(gate);
                    }

                    /* Skipped. Recorded against the QUOTATION, not just the
                       client, so the trail sits with the money: who moved a
                       quotation past sign-off, for how much, and when. Without
                       this the option would be indistinguishable from a
                       quotation that never needed approval at all. */
                    await _auditService.LogAsync(
                        "Quotation", gate.QuotationId?.ToString() ?? "0", "ApprovalSkipped", actorUsername,
                        gate.Reason, "Proposal",
                        $"Moved to Proposal without approval by {actorUsername} - {gate.QuotationNumber} ({gate.Amount:N2})");
                }
            }

            var oldStage = trackedClient.Stage;
            trackedClient.Stage = newStage;
            var enteredWon = oldStage != ClientStage.Won && newStage == ClientStage.Won;
            var enteredLost = oldStage != ClientStage.Lost && newStage == ClientStage.Lost;

            return new StageChangeResult(oldStage, newStage, enteredWon, enteredLost);
        }

        /* Books the deal when a client is dragged into Won.

           The link between the board and the money was one-way: approving a
           quotation moved its client to Won, but moving a card to Won did
           nothing to any quotation. Since every revenue figure in the app is
           derived from APPROVED quotations — "Sales this month", the client's
           Total Sales, the whole analytics page — a card dragged to Won
           produced no revenue anywhere, which reads as the dashboard being
           broken.

           Approves the most recently updated SENT quotation. Deliberately not
           all of them: several sent quotations for one client are usually
           competing versions of the same job, and approving every one would
           multiply the booked value. Draft quotations are skipped — the
           existing rule is that a quotation reaches purchasing before it can be
           approved, and that rule isn't this method's to overturn.

           Returns the approved quotation, or null when there was nothing
           approvable, so the caller can tell the user which happened instead of
           silently booking nothing. */
        /* The Lost counterpart of ApproveWonQuotationAsync.

           Rejects the most recently updated SENT quotation, for the same reason
           and with the same restraint: several sent quotations for one client
           are usually competing versions of one job, so rejecting all of them
           would multiply the lost value. Drafts are left alone — a draft was
           never put to the client, so it cannot have been lost.

           Returns null when there is nothing at Sent. That is a real outcome,
           not a failure: the card still moves to Lost, there is simply no
           quotation for the chart to count. */
        private async Task<Quotation?> RejectLostQuotationAsync(Client client, string actorUsername, string? lossReason)
        {
            var quotation = await _context.Quotations
                .Where(q => q.ClientId == client.Id && q.Status == QuotationStatus.Sent)
                .OrderByDescending(q => q.UpdatedAt)
                .FirstOrDefaultAsync();

            if (quotation == null)
            {
                return null;
            }

            quotation.Status = QuotationStatus.Rejected;
            // Same stamp as the approval path: the monthly buckets on the
            // analytics endpoints are keyed on UpdatedAt, so without this the
            // rejection would land in whatever month the quotation last changed.
            quotation.UpdatedAt = DateTime.UtcNow;

            var reason = string.IsNullOrWhiteSpace(lossReason) ? "" : $" — {lossReason.Trim()}";
            await _auditService.LogAsync(
                "Quotation", quotation.Id.ToString(), "Rejected", actorUsername,
                null, quotation.QuotationNumber,
                $"Rejected automatically — {client.Name} moved to Lost{reason}");

            return quotation;
        }

        private async Task<Quotation?> ApproveWonQuotationAsync(Client client, string actorUsername)
        {
            var quotation = await _context.Quotations
                .Where(q => q.ClientId == client.Id && q.Status == QuotationStatus.Sent)
                .OrderByDescending(q => q.UpdatedAt)
                .FirstOrDefaultAsync();

            if (quotation == null)
            {
                return null;
            }

            quotation.Status = QuotationStatus.Approved;
            // Stamps the booking date — this is what the monthly sales figures
            // and the analytics page bucket on.
            quotation.UpdatedAt = DateTime.UtcNow;

            await _auditService.LogAsync(
                "Quotation", quotation.Id.ToString(), "Approved", actorUsername,
                null, quotation.QuotationNumber,
                $"Approved automatically — {client.Name} moved to Won");

            return quotation;
        }
    }
}
