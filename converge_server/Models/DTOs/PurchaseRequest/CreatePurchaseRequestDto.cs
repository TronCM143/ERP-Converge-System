using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using converge_server.Models.DTOs.PurchaseRequestItem;

namespace converge_server.Models.DTOs.PurchaseRequest
{
    public class CreatePurchaseRequestDto
    {
        [Required]
        public string ClientName { get; set; } = string.Empty;

        [Required]
        public string ShippingAddress { get; set; } = string.Empty;

        public string? Remarks { get; set; }

        [Required]
        public List<CreatePurchaseRequestItemDto> Products { get; set; } = new List<CreatePurchaseRequestItemDto>();
    }
}
