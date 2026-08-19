using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* Account administration: rename a login or reset its password.

       Admin-only, and deliberately narrow — it edits the credentials of accounts
       that already exist and cannot create or delete them. The account set is
       fixed by the seeding in Program.cs (one login per department), so adding
       or removing logins is a deployment decision, not a settings-page one.

       Roles are read-only here for the same reason: a role IS the account's
       identity in this system (every route guard reads it), so changing one
       would silently repoint a department's login at another module. */
    [ApiController]
    [Route("api/admin/users")]
    [Authorize(Roles = "admin")]
    public class UserAccountsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;

        public UserAccountsController(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
        }

        public class UpdateUserAccountDto
        {
            // Both optional: the settings page sends only what was actually
            // edited, so a password reset never has to restate the username.
            [MinLength(3)]
            [MaxLength(50)]
            public string? Username { get; set; }

            [MinLength(8)]
            public string? Password { get; set; }
        }

        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            // PasswordHash is never projected. There is no read path for it.
            var users = await _context.Users
                .AsNoTracking()
                .OrderBy(u => u.Role)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.Role,
                    u.CreatedAt,
                    // Whether someone currently holds this single-device session,
                    // so the page can warn that a change will sign them out.
                    IsSignedIn = u.ActiveSessionId != null
                })
                .ToListAsync();

            return Ok(users);
        }

        [HttpPut("{userId:int}")]
        public async Task<IActionResult> UpdateUser(int userId, [FromBody] UpdateUserAccountDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = dto.Username?.Trim();
            var password = dto.Password;
            var wantsUsername = !string.IsNullOrWhiteSpace(username);
            var wantsPassword = !string.IsNullOrWhiteSpace(password);

            if (!wantsUsername && !wantsPassword)
            {
                return BadRequest(new { error = "Nothing to update." });
            }

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                return NotFound(new { error = "Account not found." });
            }

            var changes = new List<string>();

            if (wantsUsername && !string.Equals(user.Username, username, StringComparison.Ordinal))
            {
                // Case-insensitive, because login resolves the username that way —
                // "Admin" and "admin" would otherwise be two accounts that cannot
                // both sign in.
                var taken = await _context.Users
                    .AnyAsync(u => u.Id != userId && u.Username.ToLower() == username!.ToLower());
                if (taken)
                {
                    return Conflict(new { error = $"The username '{username}' is already taken." });
                }

                changes.Add($"username {user.Username} → {username}");
                user.Username = username!;
            }

            if (wantsPassword)
            {
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
                changes.Add("password reset");
            }

            if (changes.Count == 0)
            {
                return Ok(new { user.Id, user.Username, user.Role, signedOut = false });
            }

            /* Any credential change ends the current session.

               Necessary rather than tidy: the JWT carries the username, and
               SessionValidationMiddleware matches it against the account on every
               request, so a rename leaves the holder with a token that resolves to
               nobody. Logins are also single-device — an untouched ActiveSessionId
               would then reject the new credentials with "already logged in on
               another device" until the session expired on its own. */
            user.ActiveSessionId = null;
            user.ActiveSessionIssuedAt = null;

            await _context.SaveChangesAsync();

            // The detail line names what changed, never the value of a password.
            await _auditService.LogAsync(
                "User", user.Id.ToString(), "Updated", User.Identity?.Name ?? "admin",
                null, user.Username, string.Join(", ", changes));

            return Ok(new { user.Id, user.Username, user.Role, signedOut = true });
        }
    }
}
