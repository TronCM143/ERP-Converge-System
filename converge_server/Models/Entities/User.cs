using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Username { get; set; } = string.Empty;

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        // "quotation", "purchasing", "admin" or "engineer" - identifies which app
        // this account belongs to, and who a notification for that area reaches.
        [Required]
        [MaxLength(20)]
        public string Role { get; set; } = string.Empty;

        /* Where this account is reached. Notifications used to go to a separate
           NotificationRecipients list and a DepartmentEmails table, which meant
           three places described the same people and could disagree - an account
           existed, a recipient row existed, and a department address existed,
           with nothing tying them together. The account IS the person now:
           notifications for a role are sent to the accounts holding that role.

           Both optional. An account with neither is simply not contactable, and
           dispatch skips it rather than failing. */
        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(40)]
        public string? Phone { get; set; }

        // Non-null while a device holds an active session; cleared on logout or expiry
        public Guid? ActiveSessionId { get; set; }

        public DateTime? ActiveSessionIssuedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
