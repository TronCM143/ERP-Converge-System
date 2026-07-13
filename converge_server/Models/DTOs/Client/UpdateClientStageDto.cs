using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Client
{
    public class UpdateClientStageDto
    {
        [Required]
        public string Stage { get; set; } = string.Empty;
    }
}
