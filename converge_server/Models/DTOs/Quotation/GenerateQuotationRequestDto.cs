using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Quotation
{
    public class GenerateQuotationRequestDto
    {
        [Required]
        [MinLength(3)]
        public string Prompt { get; set; } = string.Empty;
    }
}
