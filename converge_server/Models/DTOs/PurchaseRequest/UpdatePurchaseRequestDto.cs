using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.PurchaseRequest
{
    public class UpdatePurchaseRequestDto
    {
        [Required]
        public string ClientName { get; set; } = string.Empty;

        [Required]
        public string ShippingAddress { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }
}