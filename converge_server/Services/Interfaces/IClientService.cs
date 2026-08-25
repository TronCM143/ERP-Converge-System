using converge_server.Models.DTOs.Client;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public record StageChangeResult(ClientStage OldStage, ClientStage NewStage, bool EnteredWon, bool EnteredLost);

    public interface IClientService
    {
        Task<List<ClientResponseDto>> GetClientsAsync();
        Task<ClientResponseDto?> GetClientAsync(int clientId);
        Task<ClientResponseDto> CreateClientAsync(CreateClientDto dto);
        Task<ClientResponseDto?> UpdateClientAsync(int clientId, CreateClientDto dto);
        Task<(ClientResponseDto? Client, bool WonSheetSaved)> UpdateClientStageAsync(int clientId, ClientStage stage);
        Task<ClientResponseDto?> UpdateClientAccentAsync(int clientId, string? accentColor);
        /* DecidedQuotationNumber/Amount describe the quotation this move settled:
           APPROVED when the card entered Won, REJECTED when it entered Lost. One
           field pair rather than two, because a single drag can only ever be one
           of the two. */
        Task<(bool Success, bool WonSheetSaved, string? DecidedQuotationNumber, decimal? DecidedAmount)> ReorderClientsAsync(ClientStage stage, List<int> orderedClientIds, string actorUsername, List<string>? wonNotifyEmails = null, string? lossReason = null, bool skipApproval = false);
        Task<StageChangeResult?> PrepareStageChangeAsync(Client trackedClient, ClientStage newStage, string actorUsername, bool skipApproval = false);
    }
}
