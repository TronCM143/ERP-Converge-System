using converge_server.Data;
using converge_server.Models.DTOs.Client;
using converge_server.Models.Entities;
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

        public ClientService(AppDbContext context, IAuditService auditService, INotificationDispatchService dispatchService)
        {
            _context = context;
            _auditService = auditService;
            _dispatchService = dispatchService;
        }

        public async Task<List<ClientResponseDto>> GetClientsAsync()
        {
            return await _context.Clients
                .OrderBy(c => c.Name)
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
            var client = new Client
            {
                Name = dto.Name,
                Address = dto.Address,
                ContactNumber = dto.ContactNumber,
                ContactPerson = dto.ContactPerson,
                Email = dto.Email,
                Stage = ClientStage.Leads,
                CreatedAt = DateTime.UtcNow
            };

            _context.Clients.Add(client);
            await _context.SaveChangesAsync();

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
            await _auditService.LogAsync("Client", clientId.ToString(), "Updated", "system", null, JsonSerializer.Serialize(dto));

            return await GetClientAsync(clientId);
        }

        public async Task<ClientResponseDto?> UpdateClientStageAsync(int clientId, ClientStage stage)
        {
            var client = await _context.Clients.FindAsync(clientId);
            if (client == null)
            {
                return null;
            }

            var result = await PrepareStageChangeAsync(client, stage, "system");
            await _context.SaveChangesAsync();

            if (result != null)
            {
                await _auditService.LogAsync("Client", clientId.ToString(), "StageChanged", "system", result.OldStage.ToString(), result.NewStage.ToString(), $"Stage changed from {result.OldStage} to {result.NewStage}");

                // Dispatch notifications
                await _dispatchService.DispatchAsync(Models.Entities.NotificationType.StageChanged, "Client Stage Changed", $"Client {client.Name} moved from {result.OldStage} to {result.NewStage}.");

                if (result.EnteredWon)
                {
                    await _dispatchService.DispatchAsync(Models.Entities.NotificationType.WonApproval, "Deal Won", $"Congratulations! You've won the deal with {client.Name}!");
                }
            }

            return await GetClientAsync(clientId);
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
