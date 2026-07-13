using System.Security.Claims;
using converge_server.Data;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Middleware
{
    // Enforces single-device-per-account: rejects requests carrying a JWT whose
    // session id no longer matches the account's current active session
    // (i.e. the account was logged out, or logged in from another device).
    public class SessionValidationMiddleware
    {
        private readonly RequestDelegate _next;

        public SessionValidationMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var username = context.User.FindFirstValue(ClaimTypes.Name);
                var sidClaim = context.User.FindFirstValue("sid");

                if (username == null || sidClaim == null || !Guid.TryParse(sidClaim, out var sessionId))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return;
                }

                var isActive = await dbContext.Users
                    .AsNoTracking()
                    .AnyAsync(u => u.Username.ToLower() == username.ToLower() && u.ActiveSessionId == sessionId);

                if (!isActive)
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    await context.Response.WriteAsJsonAsync(new { error = "Session expired or logged out from another device." });
                    return;
                }
            }

            await _next(context);
        }
    }
}
