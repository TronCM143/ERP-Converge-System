using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Client
{
    public class ReorderClientsDto
    {
        [Required]
        public string Stage { get; set; } = string.Empty;

        [Required]
        public List<int> OrderedClientIds { get; set; } = new();

        // Set only when the drag lands the card in Won: the exact email list
        // the user confirmed (or an explicit empty list, meaning they chose to
        // skip the email) from the pre-move dialog. Null means this call didn't
        // go through that dialog, so the default admin-configured recipients apply.
        public List<string>? WonNotifyEmails { get; set; }
    }
}
