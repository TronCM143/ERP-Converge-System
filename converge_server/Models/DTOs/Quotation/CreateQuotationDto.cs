using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Quotation
{
    public class CreateQuotationDto
    {
        [Required]
        public int ClientId { get; set; }

        [Required]
        public string QuotationName { get; set; } = string.Empty;

        public string? ProjectType { get; set; }

        public string? ProcurementType { get; set; }

        public string? OriginalPrompt { get; set; }

        public string? Notes { get; set; }

        public string? EndorsedBy { get; set; }

        public DateTime? EndorsementDate { get; set; }

        [Required]
        [MinLength(1)]
        public List<CreateQuotationMaterialItemDto> MaterialItems { get; set; } = new List<CreateQuotationMaterialItemDto>();

        public List<CreateQuotationLaborItemDto> LaborItems { get; set; } = new List<CreateQuotationLaborItemDto>();
    }
}
