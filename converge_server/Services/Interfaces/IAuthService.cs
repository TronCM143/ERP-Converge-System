using converge_server.Models.DTOs.Auth;

namespace converge_server.Services.Interfaces
{
    public interface IAuthService
    {
        Task<LoginResponseDto> LoginAsync(LoginDto dto);

        Task LogoutAsync(string username, Guid sessionId);
    }
}
