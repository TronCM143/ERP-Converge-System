using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using converge_server.Data;
using converge_server.Models.DTOs.Auth;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace converge_server.Services.Auth
{
    /* Sign-in, and staying signed in.

       A session used to be exactly as long as one access token: twelve hours,
       after which the browser was silently thrown back to the login page even
       though nobody had logged out. That is what the refresh token fixes. The
       access token stays short - it is the thing sitting in localStorage where
       a script could read it - while the refresh token lives in an httpOnly
       cookie the page cannot touch, and is rotated every time it is used. */
    public class AuthService : IAuthService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthService(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        private double AccessTokenHours => _configuration.GetValue<double>("Jwt:AccessTokenExpiryHours", 12);

        /* How long a device may stay away before it has to type a password
           again. Refreshed on every use, so somebody working daily is never
           asked; a laptop left in a drawer for a month is. */
        private int RefreshTokenDays => _configuration.GetValue<int>("Jwt:RefreshTokenExpiryDays", 30);

        private static string HashToken(string raw)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
            return Convert.ToBase64String(bytes);
        }

        public async Task<AuthResult> LoginAsync(LoginDto dto, string? presentedRefreshToken = null)
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username.ToLower() == dto.Username.Trim().ToLower());

            if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            {
                throw new UnauthorizedAccessException("Invalid username or password.");
            }

            /* Single-device: one live session per account. The lock exists so two
               people cannot share one login, and it is measured against the
               REFRESH window now rather than the access token - a session that
               survives a closed tab has to be visible here too, or the account
               would look free while a device is still holding it. */
            var sessionAlive = user.ActiveSessionId.HasValue
                && (user.RefreshTokenExpiresAt.HasValue
                    ? user.RefreshTokenExpiresAt.Value > DateTime.UtcNow
                    : user.ActiveSessionIssuedAt.HasValue
                      && user.ActiveSessionIssuedAt.Value.AddHours(AccessTokenHours) > DateTime.UtcNow);

            /* Unless the caller already IS that session. A browser whose cookie
               still matches is reclaiming its own seat - refusing it was the
               behaviour that had people running a script against the database to
               get back into their own account. */
            var ownsSession = presentedRefreshToken != null
                && user.RefreshTokenHash != null
                && CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(HashToken(presentedRefreshToken)),
                    Encoding.UTF8.GetBytes(user.RefreshTokenHash));

            if (sessionAlive && !ownsSession)
            {
                throw new InvalidOperationException(
                    $"The {user.Role} account is already logged in on another device. Log out from that device first.");
            }

            return await IssueAsync(user, Guid.NewGuid());
        }

        public async Task<AuthResult> RefreshAsync(string refreshToken)
        {
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                throw new UnauthorizedAccessException("No session to resume.");
            }

            var hash = HashToken(refreshToken);
            var user = await _context.Users.FirstOrDefaultAsync(u => u.RefreshTokenHash == hash);

            if (user == null || user.RefreshTokenExpiresAt == null || user.RefreshTokenExpiresAt <= DateTime.UtcNow)
            {
                /* Also the path a REPLAYED token takes: rotation means an
                   already-exchanged token no longer matches any row, so a copy
                   of it buys nothing. */
                throw new UnauthorizedAccessException("This session has expired. Please sign in again.");
            }

            /* The session id is kept. It is what SessionValidationMiddleware
               matches on, and minting a new one here would invalidate the access
               token this device is still using for in-flight requests. */
            var sessionId = user.ActiveSessionId ?? Guid.NewGuid();
            return await IssueAsync(user, sessionId);
        }

        private async Task<AuthResult> IssueAsync(Models.Entities.User user, Guid sessionId)
        {
            var accessExpiresAt = DateTime.UtcNow.AddHours(AccessTokenHours);
            var refreshExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenDays);

            // 32 bytes of CSPRNG output. Not a JWT: it carries no claims, it is
            // only ever looked up, so there is nothing to read out of it.
            var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace("+", "-").Replace("/", "_").TrimEnd('=');

            user.ActiveSessionId = sessionId;
            user.ActiveSessionIssuedAt = DateTime.UtcNow;
            user.RefreshTokenHash = HashToken(refreshToken);
            user.RefreshTokenExpiresAt = refreshExpiresAt;
            await _context.SaveChangesAsync();

            var response = new LoginResponseDto
            {
                Token = GenerateToken(user.Username, user.Role, sessionId, accessExpiresAt),
                Username = user.Username,
                Role = user.Role,
                ExpiresAt = accessExpiresAt
            };

            return new AuthResult(response, refreshToken, refreshExpiresAt);
        }

        public async Task LogoutAsync(string username, Guid sessionId)
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username.ToLower() == username.ToLower());

            if (user == null || user.ActiveSessionId != sessionId)
            {
                return;
            }

            user.ActiveSessionId = null;
            user.ActiveSessionIssuedAt = null;
            // The refresh token dies with the session. Explicit logout is the one
            // thing that must end it everywhere, immediately.
            user.RefreshTokenHash = null;
            user.RefreshTokenExpiresAt = null;
            await _context.SaveChangesAsync();
        }

        public async Task LogoutByRefreshTokenAsync(string refreshToken)
        {
            if (string.IsNullOrWhiteSpace(refreshToken)) return;

            var hash = HashToken(refreshToken);
            var user = await _context.Users.FirstOrDefaultAsync(u => u.RefreshTokenHash == hash);
            if (user == null) return;

            user.ActiveSessionId = null;
            user.ActiveSessionIssuedAt = null;
            user.RefreshTokenHash = null;
            user.RefreshTokenExpiresAt = null;
            await _context.SaveChangesAsync();
        }

        private string GenerateToken(string username, string role, Guid sessionId, DateTime expiresAt)
        {
            var keyBytes = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);
            var credentials = new SigningCredentials(new SymmetricSecurityKey(keyBytes), SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, username),
                new Claim(ClaimTypes.Name, username),
                new Claim(ClaimTypes.Role, role),
                new Claim("sid", sessionId.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: expiresAt,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
