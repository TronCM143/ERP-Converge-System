using System.Security.Claims;
using converge_server.Models.DTOs.Auth;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        /* The refresh cookie. httpOnly so no script on the page can read it,
           which is the entire reason the long-lived half of the session lives
           in a cookie instead of localStorage next to the access token. */
        private const string RefreshCookie = "converge_refresh";

        private readonly IAuthService _authService;

        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

        private void SetRefreshCookie(string token, DateTime expiresAt)
        {
            Response.Cookies.Append(RefreshCookie, token, new CookieOptions
            {
                HttpOnly = true,
                /* Secure only over HTTPS. Marking it Secure unconditionally would
                   make the browser drop it on the office LAN, where the app is
                   served over plain http at http://192.168.x.x:5173 - the cookie
                   would silently never arrive and nobody would stay signed in. */
                Secure = Request.IsHttps,
                // Lax, not None: the cookie is never needed on a cross-site
                // request, and refusing to send it on one is the CSRF defence.
                SameSite = SameSiteMode.Lax,
                // Scoped to the one endpoint that consumes it.
                Path = "/api/auth",
                Expires = new DateTimeOffset(expiresAt, TimeSpan.Zero)
            });
        }

        private void ClearRefreshCookie()
        {
            Response.Cookies.Delete(RefreshCookie, new CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/api/auth"
            });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                // The cookie is passed in so a browser reclaiming its own live
                // session is not turned away by the single-device lock.
                Request.Cookies.TryGetValue(RefreshCookie, out var existing);

                var result = await _authService.LoginAsync(dto, existing);
                SetRefreshCookie(result.RefreshToken, result.RefreshExpiresAt);
                return Ok(result.Response);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(new { error = ex.Message });
            }
        }

        /* Resume a session. Anonymous by necessity - it is called precisely when
           the access token has expired - so the cookie is the credential. */
        [HttpPost("refresh")]
        [AllowAnonymous]
        public async Task<IActionResult> Refresh()
        {
            if (!Request.Cookies.TryGetValue(RefreshCookie, out var refreshToken) || string.IsNullOrWhiteSpace(refreshToken))
            {
                return Unauthorized(new { error = "No session to resume." });
            }

            try
            {
                var result = await _authService.RefreshAsync(refreshToken);
                SetRefreshCookie(result.RefreshToken, result.RefreshExpiresAt);
                return Ok(result.Response);
            }
            catch (UnauthorizedAccessException ex)
            {
                // A dead cookie is cleared rather than left to fail on every
                // future page load.
                ClearRefreshCookie();
                return Unauthorized(new { error = ex.Message });
            }
        }

        /* Anonymous on purpose. Logging out is the one action that must always
           succeed: a tab left open overnight has a dead access token, and
           refusing it there would strand the session server-side and lock the
           account to a device nobody is sitting at. The cookie identifies the
           session when the token no longer can, and neither one lets the caller
           end anybody else's session. */
        [HttpPost("logout")]
        [AllowAnonymous]
        public async Task<IActionResult> Logout()
        {
            var username = User.FindFirstValue(ClaimTypes.Name);
            var sidClaim = User.FindFirstValue("sid");

            if (username != null && sidClaim != null && Guid.TryParse(sidClaim, out var sessionId))
            {
                await _authService.LogoutAsync(username, sessionId);
            }
            else if (Request.Cookies.TryGetValue(RefreshCookie, out var refreshToken))
            {
                await _authService.LogoutByRefreshTokenAsync(refreshToken);
            }

            ClearRefreshCookie();
            return NoContent();
        }

        [HttpGet("me")]
        [Authorize]
        public IActionResult Me()
        {
            return Ok(new
            {
                Username = User.FindFirstValue(ClaimTypes.Name),
                Role = User.FindFirstValue(ClaimTypes.Role)
            });
        }
    }
}
