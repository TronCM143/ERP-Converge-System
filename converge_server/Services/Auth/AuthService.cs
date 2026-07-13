using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using converge_server.Data;
using converge_server.Models.DTOs.Auth;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace converge_server.Services.Auth
{
    public class AuthService : IAuthService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthService(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public async Task<LoginResponseDto> LoginAsync(LoginDto dto)
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username.ToLower() == dto.Username.Trim().ToLower());

            if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            {
                throw new UnauthorizedAccessException("Invalid username or password.");
            }

            var expiryHours = _configuration.GetValue<double>("Jwt:AccessTokenExpiryHours", 12);

            var hasActiveSession = user.ActiveSessionId.HasValue
                && user.ActiveSessionIssuedAt.HasValue
                && user.ActiveSessionIssuedAt.Value.AddHours(expiryHours) > DateTime.UtcNow;

            if (hasActiveSession)
            {
                throw new InvalidOperationException(
                    $"The {user.Role} account is already logged in on another device. Log out from that device first.");
            }

            var sessionId = Guid.NewGuid();
            user.ActiveSessionId = sessionId;
            user.ActiveSessionIssuedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var expiresAt = DateTime.UtcNow.AddHours(expiryHours);
            var token = GenerateToken(user.Username, user.Role, sessionId, expiresAt);

            return new LoginResponseDto
            {
                Token = token,
                Username = user.Username,
                Role = user.Role,
                ExpiresAt = expiresAt
            };
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
