using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    /// <summary>
    /// One notification email address per department (sales, purchasing,
    /// inventory), editable from the Settings page.
    /// </summary>
    public class DepartmentEmail
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Department { get; set; } = string.Empty;

        [MaxLength(200)]
        public string? Email { get; set; }

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
