using System.Collections.Concurrent;
using converge_server.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    // Connects the single Google mailbox used to send admin notification
    // emails (Purchase Request PDFs, Won-deal notices) via the Gmail API.
    //
    // The actual "start OAuth" step is a full browser redirect chain, which
    // can't carry the app's JWT (it lives in localStorage, not a cookie), so
    // [Authorize] can't gate it directly. Instead, an authenticated call
    // mints a short-lived one-time ticket that the redirect step consumes.
    [ApiController]
    [Route("api/admin/google")]
    public class GoogleOAuthController : ControllerBase
    {
        private static readonly ConcurrentDictionary<string, DateTime> PendingTickets = new();
        private static readonly TimeSpan TicketLifetime = TimeSpan.FromMinutes(2);

        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public GoogleOAuthController(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpPost("connect-ticket")]
        [Authorize(Roles = "admin")]
        public IActionResult CreateConnectTicket()
        {
            PurgeExpiredTickets();
            var ticket = Guid.NewGuid().ToString("N");
            PendingTickets[ticket] = DateTime.UtcNow.Add(TicketLifetime);
            return Ok(new { url = Url.Action(nameof(Connect), "GoogleOAuth", new { ticket })! });
        }

        // Full browser navigation, not fetch/XHR — it's a redirect chain.
        [HttpGet("connect")]
        public IActionResult Connect([FromQuery] string ticket)
        {
            if (string.IsNullOrEmpty(ticket) || !PendingTickets.TryRemove(ticket, out var expiresAt) || expiresAt < DateTime.UtcNow)
            {
                return Unauthorized(new { error = "This connect link has expired. Start again from Settings." });
            }

            var redirectUri = Url.Action(nameof(Callback), "GoogleOAuth")!;
            return Challenge(new AuthenticationProperties { RedirectUri = redirectUri }, GoogleDefaults.AuthenticationScheme);
        }

        // Lands here after Google redirects back to the app's callback path
        // and the Google auth handler has already captured the tokens (see
        // OnTicketReceived in Program.cs, which persists them and signs the
        // temporary cookie back out). Just bounces the browser to Settings.
        [HttpGet("callback")]
        public IActionResult Callback([FromQuery] string? connected)
        {
            var status = connected == "1" ? "connected" : "error";
            // Must be absolute: this redirect fires on the backend's own
            // origin (5090), but /admin/settings is a React route served by
            // the separate frontend dev server — a relative path here 404s.
            var frontendBaseUrl = (_configuration["Frontend:BaseUrl"] ?? "http://localhost:5173").TrimEnd('/');
            return Redirect($"{frontendBaseUrl}/admin/settings?google={status}");
        }

        [HttpGet("status")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Status()
        {
            var credential = await _context.GoogleOAuthCredentials.AsNoTracking().FirstOrDefaultAsync();
            if (credential == null)
            {
                return Ok(new { connected = false, email = (string?)null });
            }
            return Ok(new { connected = true, email = credential.Email, connectedAt = credential.ConnectedAt });
        }

        [HttpPost("disconnect")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Disconnect()
        {
            var credentials = await _context.GoogleOAuthCredentials.ToListAsync();
            _context.GoogleOAuthCredentials.RemoveRange(credentials);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static void PurgeExpiredTickets()
        {
            var now = DateTime.UtcNow;
            foreach (var kv in PendingTickets)
            {
                if (kv.Value < now)
                {
                    PendingTickets.TryRemove(kv.Key, out _);
                }
            }
        }
    }
}
