using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* The signed-in user's own account.

       Its own controller rather than an action on UserAccountsController, which
       is admin-only at the class level: ASP.NET combines controller and action
       [Authorize] with AND, so a "me" endpoint living there could never be
       reached by the people it exists for. Any authenticated user, their own
       record, nobody else's — the route carries no id at all, so there is no
       parameter to tamper with.
    */
    [ApiController]
    [Route("api/me")]
    [Authorize]
    public class MyAccountController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;

        public MyAccountController(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
        }

        public class MyAccountDto
        {
            /* Required to set a new password. An admin resetting someone else's
               password does not need it — they are trusted by role — but a user
               changing their own does: without it, an unattended signed-in
               session is enough for a passer-by to lock out the owner. */
            public string? CurrentPassword { get; set; }

            [MinLength(8)]
            public string? NewPassword { get; set; }

            [MaxLength(150)]
            [EmailAddress]
            public string? Email { get; set; }

            [MaxLength(40)]
            public string? Phone { get; set; }
        }

        /* The signed-in user's own record.

           Deliberately outside the admin-only guard on the rest of this
           controller: before this existed nobody could change their own password
           or fix their own phone number — they had to ask an admin, who would do
           it through the Users table. That is the wrong shape for a system where
           the notification you miss is the one sent to a number you cannot
           correct yourself. */
        [HttpGet]
        public async Task<IActionResult> GetMe()
        {
            var username = User.Identity?.Name;
            var me = await _context.Users
                .AsNoTracking()
                .Where(u => u.Username == username)
                .Select(u => new { u.Id, u.Username, u.Role, u.Email, u.Phone })
                .FirstOrDefaultAsync();

            return me == null ? NotFound() : Ok(me);
        }

        [HttpPut]
        public async Task<IActionResult> UpdateMe([FromBody] MyAccountDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = User.Identity?.Name;
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null)
            {
                return NotFound(new { error = "Account not found." });
            }

            var changes = new List<string>();
            var signedOut = false;

            if (!string.IsNullOrWhiteSpace(dto.NewPassword))
            {
                if (string.IsNullOrWhiteSpace(dto.CurrentPassword)
                    || !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
                {
                    return BadRequest(new { error = "Your current password is not correct." });
                }

                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
                changes.Add("password changed");

                // Same rule as an admin reset: the credential changed, so the
                // session built on the old one ends.
                user.ActiveSessionId = null;
                user.ActiveSessionIssuedAt = null;
                signedOut = true;
            }

            // Contact details never end a session — they are not credentials.
            if (dto.Email != null)
            {
                var email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
                if (user.Email != email) { user.Email = email; changes.Add("email"); }
            }

            if (dto.Phone != null)
            {
                var phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
                if (user.Phone != phone) { user.Phone = phone; changes.Add("phone"); }
            }

            if (changes.Count == 0)
            {
                return Ok(new { signedOut = false, changed = false });
            }

            await _context.SaveChangesAsync();

            await _auditService.LogAsync("User", user.Id.ToString(), "Updated", username ?? "self",
                null, user.Username, $"self-service: {string.Join(", ", changes)}");

            return Ok(new { signedOut, changed = true });
        }

    }
}
