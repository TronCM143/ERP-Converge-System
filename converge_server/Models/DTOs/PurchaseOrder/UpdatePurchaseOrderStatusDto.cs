using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.PurchaseOrder
{
    public class UpdatePurchaseOrderStatusDto
    {
        [Required]
        public string Status { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }
}
