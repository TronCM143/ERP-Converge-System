using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    /// <summary>
    /// The single connected Google account used to send email via the Gmail
    /// API (e.g. "converge@gmail.com"), captured once through the OAuth
    /// consent flow. Only one row is ever kept — connecting again overwrites
    /// it, matching the "one shared sender mailbox" model of the app's other
    /// notification email settings.
    /// </summary>
    public class GoogleOAuthCredential
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string RefreshToken { get; set; } = string.Empty;

        // Cached short-lived access token — refreshed on demand when expired.
        public string? AccessToken { get; set; }

        public DateTime? AccessTokenExpiresAt { get; set; }

        public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(50)]
        public string? ConnectedBy { get; set; }
    }
}
