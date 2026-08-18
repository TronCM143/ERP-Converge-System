using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    public enum ClientStage
    {
        Leads = 0,
        Quote = 1,
        Proposal = 2,
        Won = 3,
        // Appended rather than slotted between Proposal and Won: the value is
        // persisted as an int, so renumbering the existing members would
        // silently re-stage every client already in the database. Board order
        // is a frontend concern (see STAGES in CrmDashboardPage), and there it
        // does sit between Proposal and Won.
        //
        // No migration needed — Stage is already an int column and this adds no
        // schema change, only a value the API will now accept.
        Pending = 4,
        // The board has always had a Lost column, but the enum did not, so the
        // reorder endpoint answered "Unknown stage 'Lost'" with a 400 and the
        // card snapped back — nothing was ever persisted and no quotation was
        // ever rejected, which is why the won/lost chart could not move.
        // Appended (5) for the same reason as Pending: the value is stored.
        Lost = 5
    }

    public class Client
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [MaxLength(400)]
        public string Address { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? ContactNumber { get; set; }

        [MaxLength(100)]
        public string? ContactPerson { get; set; }

        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(2000)]
        public string? Notes { get; set; }

        [Required]
        public ClientStage Stage { get; set; } = ClientStage.Leads;

        // Manual position of the card within its Kanban column (lower = higher up).
        public int SortOrder { get; set; }

        // Kanban card colour as a CSS hex string ("#1f6fb2"). Free-form rather
        // than an ordinal into a fixed palette: the colour is picked from a full
        // colour picker on the client profile, not from four presets. Null means
        // "not chosen", and the board falls back to a colour derived from the
        // client's name so every card still reads as distinct.
        [MaxLength(9)]
        public string? AccentColor { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<Quotation> Quotations { get; set; } = new List<Quotation>();
    }
}
