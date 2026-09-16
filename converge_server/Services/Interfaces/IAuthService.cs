using converge_server.Models.DTOs.Auth;

namespace converge_server.Services.Interfaces
{
    /* A signed-in session is two tokens.

       The ACCESS token is the short-lived JWT every request carries. The
       REFRESH token is long-lived, never leaves an httpOnly cookie, and does
       nothing but mint a new access token. Splitting them is what lets a browser
       stay signed in for weeks without a stealable credential sitting in
       localStorage for weeks. */
    public record AuthResult(LoginResponseDto Response, string RefreshToken, DateTime RefreshExpiresAt);

    public interface IAuthService
    {
        /// <param name="presentedRefreshToken">
        /// The refresh cookie the caller already holds, when there is one. A
        /// browser signing in again while it still owns the live session is
        /// taking over its OWN seat, not competing for someone else's, so it is
        /// let through the single-device lock.
        /// </param>
        Task<AuthResult> LoginAsync(LoginDto dto, string? presentedRefreshToken = null);

        /// <summary>Exchanges a refresh token for a fresh access token, rotating it.</summary>
        Task<AuthResult> RefreshAsync(string refreshToken);

        Task LogoutAsync(string username, Guid sessionId);

        /// <summary>
        /// Ends the session identified by a refresh token. The fallback for
        /// logging out after the access token has already expired - without it
        /// the account stays locked to a device nobody is using.
        /// </summary>
        Task LogoutByRefreshTokenAsync(string refreshToken);
    }
}
