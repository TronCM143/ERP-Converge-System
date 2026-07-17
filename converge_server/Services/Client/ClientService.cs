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
        private readonly INotificationDispatchService _dispatchService;
        private readonly ICacheService _cache;
        private readonly IWonDealSheetService _wonDealSheetService;

        public ClientService(
            AppDbContext context,
            IAuditService auditService,
            INotificationDispatchService dispatchService,
            ICacheService cache,
            IWonDealSheetService wonDealSheetService)
        {
            _context = context;
            _auditService = auditService;
            _dispatchService = dispatchService;
            _cache = cache;
            _wonDealSheetService = wonDealSheetService;
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
                    Stage = c.Stage.ToString(),
                    QuotationCount = c.Quotations.Count,
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
                    Stage = c.Stage.ToString(),
                    QuotationCount = c.Quotations.Count,
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

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);
            await _auditService.LogAsync("Client", clientId.ToString(), "Updated", "system", null, JsonSerializer.Serialize(dto));

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
                    wonSheetSaved = await HandleWonAsync(client);
                }
            }

            return (await GetClientAsync(clientId), wonSheetSaved);
        }

        public async Task<(bool Success, bool WonSheetSaved)> ReorderClientsAsync(ClientStage stage, List<int> orderedClientIds, string actorUsername, List<string>? wonNotifyEmails = null)
        {
            var clientsToUpdate = await _context.Clients
                .Where(c => orderedClientIds.Contains(c.Id))
                .ToListAsync();

            if (clientsToUpdate.Count == 0)
            {
                return (false, false);
            }

            // At most one card changes column per drag; the rest are same-column reorders.
            Client? movedClient = null;
            StageChangeResult? stageChange = null;

            foreach (var client in clientsToUpdate)
            {
                if (client.Stage != stage)
                {
                    movedClient = client;
                    stageChange = await PrepareStageChangeAsync(client, stage, actorUsername);
                }
                client.SortOrder = orderedClientIds.IndexOf(client.Id);
            }

            await _context.SaveChangesAsync();
            await _cache.RemoveAsync(CacheKeys.Clients);

            var wonSheetSaved = false;
            if (stageChange != null && movedClient != null)
            {
                await _auditService.LogAsync("Client", movedClient.Id.ToString(), "StageChanged", actorUsername, stageChange.OldStage.ToString(), stageChange.NewStage.ToString(), $"Stage changed from {stageChange.OldStage} to {stageChange.NewStage}");

                await _dispatchService.DispatchAsync(Models.Entities.NotificationType.StageChanged, "Client Stage Changed", $"Client {movedClient.Name} moved from {stageChange.OldStage} to {stageChange.NewStage}.");

                if (stageChange.EnteredWon)
                {
                    wonSheetSaved = await HandleWonAsync(movedClient, wonNotifyEmails);
                }
            }

            return (true, wonSheetSaved);
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

        public async Task<StageChangeResult?> PrepareStageChangeAsync(Client trackedClient, ClientStage newStage, string actorUsername)
        {
            if (trackedClient.Stage == newStage)
            {
                return null;
            }

            var oldStage = trackedClient.Stage;
            trackedClient.Stage = newStage;
            var enteredWon = oldStage != ClientStage.Won && newStage == ClientStage.Won;

            return new StageChangeResult(oldStage, newStage, enteredWon);
        }
    }
}
