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

        // "quotation" or "purchasing" - identifies which app/department this account belongs to
        [Required]
        [MaxLength(20)]
        public string Role { get; set; } = string.Empty;

        // Non-null while a device holds an active session; cleared on logout or expiry
        public Guid? ActiveSessionId { get; set; }

        public DateTime? ActiveSessionIssuedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
