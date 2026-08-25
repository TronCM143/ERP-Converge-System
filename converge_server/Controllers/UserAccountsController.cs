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

            /* Contact details. Empty string clears; null (omitted) leaves alone -
               so a password reset does not wipe an address the caller did not
               send. Having an address is the opt-in for that channel. */
            [MaxLength(150)]
            [EmailAddress]
            public string? Email { get; set; }

            [MaxLength(40)]
            public string? Phone { get; set; }
        }

        public class CreateUserDto
        {
            [Required]
            [MinLength(3)]
            [MaxLength(50)]
            public string Username { get; set; } = string.Empty;

            [Required]
            [MinLength(8)]
            public string Password { get; set; } = string.Empty;

            [Required]
            public string Role { get; set; } = string.Empty;

            [MaxLength(150)]
            [EmailAddress]
            public string? Email { get; set; }

            [MaxLength(40)]
            public string? Phone { get; set; }
        }

        // The roles the app actually understands. A typo here would create an
        // account that can sign in and reach nothing, so it is a whitelist.
        private static readonly string[] AllowedRoles = { "quotation", "purchasing", "admin", "engineer" };

        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = dto.Username.Trim();
            var role = dto.Role.Trim().ToLowerInvariant();

            if (!AllowedRoles.Contains(role))
            {
                return BadRequest(new { error = $"Unknown role '{dto.Role}'." });
            }

            if (await _context.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower()))
            {
                return Conflict(new { error = $"The username '{username}' is already taken." });
            }

            var user = new Models.Entities.User
            {
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                Role = role,
                Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim(),
                Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim(),
                CreatedAt = DateTime.UtcNow
            };
            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("User", user.Id.ToString(), "Created",
                User.Identity?.Name ?? "admin", null, user.Username, $"role {user.Role}");

            return Ok(new { user.Id, user.Username, user.Role, user.Email, user.Phone });
        }

        [HttpDelete("{userId:int}")]
        public async Task<IActionResult> DeleteUser(int userId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                return NotFound(new { error = "Account not found." });
            }

            /* Two guards, both about not locking everyone out: you cannot delete
               the account you are signed in as, and you cannot remove the last
               admin. Either would leave the system with no way back in. */
            if (string.Equals(user.Username, User.Identity?.Name, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { error = "You cannot delete the account you are signed in with." });
            }

            if (user.Role == "admin" && await _context.Users.CountAsync(u => u.Role == "admin") <= 1)
            {
                return BadRequest(new { error = "This is the only admin account — deleting it would lock everyone out." });
            }

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("User", userId.ToString(), "Deleted",
                User.Identity?.Name ?? "admin", user.Username, null, $"role {user.Role}");

            return Ok(new { deleted = true });
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
                    u.Email,
                    u.Phone,
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

            if (!wantsUsername && !wantsPassword && dto.Email == null && dto.Phone == null)
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

            /* Contact edits do NOT end the session: they change where this
               account is notified, not how it authenticates. Only a credential
               change needs to sign anyone out. */
            var contactChanged = false;
            if (dto.Email != null)
            {
                var email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
                if (user.Email != email)
                {
                    user.Email = email;
                    contactChanged = true;
                }
            }
            if (dto.Phone != null)
            {
                var phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
                if (user.Phone != phone)
                {
                    user.Phone = phone;
                    contactChanged = true;
                }
            }

            if (contactChanged && changes.Count == 0)
            {
                await _context.SaveChangesAsync();
                await _auditService.LogAsync("User", user.Id.ToString(), "Updated",
                    User.Identity?.Name ?? "admin", null, user.Username, "contact details changed");
                return Ok(new { user.Id, user.Username, user.Role, signedOut = false });
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
