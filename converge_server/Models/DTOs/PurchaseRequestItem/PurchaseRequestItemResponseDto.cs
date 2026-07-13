using System;

namespace converge_server.Models.DTOs.PurchaseRequestItem
{
    public class PurchaseRequestItemResponseDto
    {
        public Guid Id { get; set; }
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public string Status { get; set; } = string.Empty;
        public string ItemName { get; set; } = string.Empty;
    }
}