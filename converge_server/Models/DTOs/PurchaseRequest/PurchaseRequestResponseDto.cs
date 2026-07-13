using System;
using System.Collections.Generic;
using converge_server.Models.DTOs.PurchaseRequestItem;

namespace converge_server.Models.DTOs.PurchaseRequest
{
    public class PurchaseRequestResponseDto
    {
        public Guid Id { get; set; }
        public string PRNumber { get; set; } = string.Empty;
        public string ClientName { get; set; } = string.Empty;
        public string ShippingAddress { get; set; } = string.Empty;
        public string? Remarks { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<PurchaseRequestItemResponseDto> Products { get; set; } = new List<PurchaseRequestItemResponseDto>();
    }
}
