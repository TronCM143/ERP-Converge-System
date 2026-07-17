using converge_server.Models.DTOs.Client;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public record StageChangeResult(ClientStage OldStage, ClientStage NewStage, bool EnteredWon);

    public interface IClientService
    {
        Task<List<ClientResponseDto>> GetClientsAsync();
        Task<ClientResponseDto?> GetClientAsync(int clientId);
        Task<ClientResponseDto> CreateClientAsync(CreateClientDto dto);
        Task<ClientResponseDto?> UpdateClientAsync(int clientId, CreateClientDto dto);
        Task<(ClientResponseDto? Client, bool WonSheetSaved)> UpdateClientStageAsync(int clientId, ClientStage stage);
        Task<(bool Success, bool WonSheetSaved)> ReorderClientsAsync(ClientStage stage, List<int> orderedClientIds, string actorUsername, List<string>? wonNotifyEmails = null);
        Task<StageChangeResult?> PrepareStageChangeAsync(Client trackedClient, ClientStage newStage, string actorUsername);
    }
}
