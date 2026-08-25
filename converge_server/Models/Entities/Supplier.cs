using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    /* A company purchasing buys from.

       Previously a supplier was whatever text someone typed on a BOM line, which
       meant "Dahua Phils.", "dahua philippines" and "Dahua Ph" were three
       different suppliers as far as the system was concerned. Nothing could be
       aggregated: not spend per supplier, not who quoted cheapest for a part, not
       even a reliable contact number, because each line carried its own copy of
       the address and each copy could differ.

       BillOfMaterialItem now points here by id. The old free-text Supplier and
       SupplierAddress columns stay on the line as a snapshot of what was agreed
       at the time — the same reasoning as the product snapshot on a quotation
       line: renaming a supplier next year must not rewrite what a completed
       purchase order says. */
    public class Supplier
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(300)]
        public string? Address { get; set; }

        [MaxLength(150)]
        public string? ContactPerson { get; set; }

        [MaxLength(40)]
        public string? ContactNumber { get; set; }

        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(1000)]
        public string? Notes { get; set; }

        /* Retired rather than deleted. A supplier referenced by historical BOM
           lines cannot be removed without either orphaning them or rewriting
           history, and "we stopped using them" is the thing actually being
           recorded — so they drop out of the picker and stay in the reports. */
        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public ICollection<BillOfMaterialItem> Items { get; set; } = new List<BillOfMaterialItem>();
    }
}
