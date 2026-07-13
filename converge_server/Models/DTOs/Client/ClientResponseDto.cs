namespace converge_server.Models.DTOs.Client
{
    public class ClientResponseDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string? ContactNumber { get; set; }
        public string? ContactPerson { get; set; }
        public string? Email { get; set; }
        public string Stage { get; set; } = string.Empty;
        public int QuotationCount { get; set; }
        public DateTime LastUpdated { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
