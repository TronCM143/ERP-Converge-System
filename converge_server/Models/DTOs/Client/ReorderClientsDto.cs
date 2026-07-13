using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Client
{
    public class ReorderClientsDto
    {
        [Required]
        public string Stage { get; set; } = string.Empty;

        [Required]
        public List<int> OrderedClientIds { get; set; } = new();
    }
}
