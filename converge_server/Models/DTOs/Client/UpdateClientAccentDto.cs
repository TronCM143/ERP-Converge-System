using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Client
{
    public class UpdateClientAccentDto
    {
        // CSS hex colour, 3/6/8 digits ("#abc", "#1f6fb2", "#1f6fb2ff"), or null
        // to clear the choice and fall back to the name-derived colour on the
        // board. Regex-validated rather than free text because this value is
        // interpolated straight into a style attribute on the client.
        [RegularExpression(
            "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
            ErrorMessage = "AccentColor must be a hex colour such as #1f6fb2.")]
        [MaxLength(9)]
        public string? AccentColor { get; set; }
    }
}
