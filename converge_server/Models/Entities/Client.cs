using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    public enum ClientStage
    {
        Leads = 0,
        RFQ = 1,
        Proposal = 2,
        Negotiation = 3,
        Won = 4,
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

        [Required]
        public ClientStage Stage { get; set; } = ClientStage.Leads;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<Quotation> Quotations { get; set; } = new List<Quotation>();
    }
}
