using System;
using System.Collections.Generic;

namespace converge_server.Models.DTOs.PurchaseOrder
{
    public class PurchaseOrderResponseDto
    {
        public Guid Id { get; set; }
        public string PONumber { get; set; } = string.Empty;
        public Guid BillOfMaterialId { get; set; }
        public Guid? SupplierId { get; set; }
        public DateTime OrderDate { get; set; }
        public DateTime? ExpectedArrivalDate { get; set; }
        public string ShippingAddress { get; set; } = string.Empty;
        public decimal UntaxedAmount { get; set; }
        public decimal VATAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal GrandTotal { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? Remarks { get; set; }
        public List<PurchaseOrderItemResponseDto> Items { get; set; } = new List<PurchaseOrderItemResponseDto>();
    }
}
