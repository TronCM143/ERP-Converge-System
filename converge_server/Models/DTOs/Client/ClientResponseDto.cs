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
        public string? Notes { get; set; }
        public string Stage { get; set; } = string.Empty;
        // CSS hex, or null when the user hasn't picked one. See Client.AccentColor.
        public string? AccentColor { get; set; }
        public int QuotationCount { get; set; }
        // Everything this client has already bought: approved quotations only.
        public decimal TotalSales { get; set; }
        // The deal on the table right now — the newest quotation's total and
        // name, whatever its status. Distinct from TotalSales, which stays 0
        // until a quotation is actually approved.
        public decimal? CurrentOpportunity { get; set; }
        public string? CurrentService { get; set; }

        /// <summary>
        /// Engineer sign-off state of the client's newest quotation:
        /// NotRequired / Pending / Approved / Rejected. The board shows it on the
        /// card so a salesperson sees a quote is stuck before dragging it.
        /// </summary>
        public string ApprovalState { get; set; } = "NotRequired";
        public DateTime LastUpdated { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
