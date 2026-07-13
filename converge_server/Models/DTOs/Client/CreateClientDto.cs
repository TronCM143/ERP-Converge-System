using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Client
{
    public class CreateClientDto
    {
        [Required]
        public string Name { get; set; } = string.Empty;

        [Required]
        public string Address { get; set; } = string.Empty;

        public string? ContactNumber { get; set; }

        public string? ContactPerson { get; set; }

        public string? Email { get; set; }
    }
}
