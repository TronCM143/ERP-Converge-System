using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    /* An extra document or link hanging off a product - a manual, a warranty
       sheet, a compliance certificate. Its own table rather than more columns on
       Product because the count is open-ended, which is exactly the case a
       column-per-item cannot serve.

       Url covers both an uploaded file (a /images/... path this server wrote)
       and an external link, so a manufacturer PDF does not have to be mirrored
       locally to be attached. */
    public class ProductAttachment
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int ProductId { get; set; }

        [ForeignKey(nameof(ProductId))]
        public Product? Product { get; set; }

        [Required]
        [MaxLength(200)]
        public string Label { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Url { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
