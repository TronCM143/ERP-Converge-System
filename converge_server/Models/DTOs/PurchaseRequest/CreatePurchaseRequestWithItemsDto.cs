using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using converge_server.Models.DTOs.PurchaseRequestItem;

namespace converge_server.Models.DTOs.PurchaseRequest
{
    public class CreatePurchaseRequestWithItemsDto
    {
        [Required]
        public string ClientName { get; set; } = string.Empty;

        [Required]
        public string ShippingAddress { get; set; } = string.Empty;

        public string? Remarks { get; set; }

        public string? Source { get; set; }

        [Required]
        public List<CreatePurchaseRequestItemDto> Items { get; set; } = new List<CreatePurchaseRequestItemDto>();
    }
}
