using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class QuotationLaborItem
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int QuotationId { get; set; }

        [ForeignKey(nameof(QuotationId))]
        public Quotation? Quotation { get; set; }

        [Required]
        [MaxLength(300)]
        public string Description { get; set; } = string.Empty;

        [Required]
        public int Days { get; set; }

        [Required]
        public int Persons { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal RatePerPersonPerDay { get; set; }

        public int SortOrder { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal LineTotal { get; set; }
    }
}
