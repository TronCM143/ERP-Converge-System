using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Products
{
    public class SetProductImageUrlDto
    {
        [Required]
        public string Url { get; set; } = string.Empty;
    }
}
