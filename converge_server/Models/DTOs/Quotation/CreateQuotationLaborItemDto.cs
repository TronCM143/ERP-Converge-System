using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Quotation
{
    public class CreateQuotationLaborItemDto
    {
        [Required]
        public string Description { get; set; } = string.Empty;

        [Required]
        [Range(1, int.MaxValue)]
        public int Days { get; set; }

        [Required]
        [Range(1, int.MaxValue)]
        public int Persons { get; set; }

        [Required]
        public decimal RatePerPersonPerDay { get; set; }
    }
}
