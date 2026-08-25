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

        // Set only when the drag lands the card in Lost: the reason picked in
        // the loss dialog. The board has always sent this; there was nothing on
        // the server reading it, so the answer was discarded. Client has no
        // column for it, so it is recorded on the audit entries for the move.
        public string? LossReason { get; set; }

        /* Set when the user chose Skip on the approval dialog: move to Proposal
           without sign-off. Deliberately an explicit flag rather than something
           the client can imply - the server still decides, still records who did
           it, and a request that simply omits the flag is refused exactly as
           before. Approval is optional by policy here, not bypassable by
           accident. */
        public bool SkipApproval { get; set; }
    }
}
