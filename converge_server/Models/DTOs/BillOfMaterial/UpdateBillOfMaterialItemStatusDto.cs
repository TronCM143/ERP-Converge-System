using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.BillOfMaterial
{
    public class UpdateBillOfMaterialItemStatusDto
    {
        [Required]
        public string Status { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }
}
