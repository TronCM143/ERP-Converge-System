using System;

namespace converge_server.Models.DTOs.PurchaseOrder
{
    public class PurchaseOrderItemResponseDto
    {
        public Guid Id { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public string Unit { get; set; } = string.Empty;
        public decimal UnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public string? Remarks { get; set; }
    }
}
