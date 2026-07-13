using System;
using System.Collections.Generic;

namespace converge_server.Models.DTOs.PurchaseOrder
{
    public class UpdatePurchaseOrderDto
    {
        public string ShippingAddress { get; set; } = string.Empty;
        public string? Remarks { get; set; }
        public DateTime? ExpectedArrivalDate { get; set; }
        public decimal UntaxedAmount { get; set; }
        public decimal VATAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal GrandTotal { get; set; }
        public string Status { get; set; } = "Draft";
        public List<UpdatePurchaseOrderItemDto> Items { get; set; } = new();
    }

    public class UpdatePurchaseOrderItemDto
    {
        public Guid Id { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public string? Remarks { get; set; }
    }
}
