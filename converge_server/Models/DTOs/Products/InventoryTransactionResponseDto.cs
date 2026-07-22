using System;

namespace converge_server.Models.DTOs.Products
{
    public class InventoryTransactionResponseDto
    {
        public Guid Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string Direction { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public int ResultingStock { get; set; }
        public string? Reason { get; set; }
        public string PerformedBy { get; set; } = string.Empty;
        public DateTime OccurredAt { get; set; }
    }
}
