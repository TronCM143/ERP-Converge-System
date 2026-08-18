namespace converge_server.Models.DTOs.Odoo
{
    /// <summary>One past Odoo sale order offered beside the AI prompt box.</summary>
    public class OdooQuoteSuggestionDto
    {
        public long Id { get; set; }
        /// <summary>Odoo's order reference, e.g. "S00123".</summary>
        public string Name { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string OrderDate { get; set; } = string.Empty;
        /// <summary>Odoo state: draft / sent / sale / done / cancel.</summary>
        public string State { get; set; } = string.Empty;
        public decimal AmountTotal { get; set; }
        public int LineCount { get; set; }
        /// <summary>Which fields the query hit — shown as the "why" hint.</summary>
        public List<string> MatchedOn { get; set; } = new();
    }

    /// <summary>A single order line, resolved against the local catalog.</summary>
    public class OdooDraftItemDto
    {
        /// <summary>The description as it reads in Odoo.</summary>
        public string RequestedDescription { get; set; } = string.Empty;
        public int Quantity { get; set; }
        /// <summary>What was actually charged on that order.</summary>
        public decimal OdooUnitPrice { get; set; }
        /// <summary>True only when a real local Product was resolved.</summary>
        public bool Matched { get; set; }
        public int? ProductId { get; set; }
        public string? ProductName { get; set; }
        public decimal? CatalogPrice { get; set; }
    }

    public class OdooOrderDraftDto
    {
        public string Name { get; set; } = string.Empty;
        public List<OdooDraftItemDto> Items { get; set; } = new();
    }
}
