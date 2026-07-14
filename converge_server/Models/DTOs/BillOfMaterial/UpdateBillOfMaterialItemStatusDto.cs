using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.BillOfMaterial
{
    public class UpdateBillOfMaterialItemStatusDto
    {
        [Required]
        public string Status { get; set; } = string.Empty;

        public string? Remarks { get; set; }

        // Expected arrival date assigned by purchasing staff (yyyy-MM-dd).
        public DateTime? DeliveryDate { get; set; }
    }
}
