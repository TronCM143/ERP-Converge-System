namespace converge_server.Models.DTOs.PurchaseRequest
{
    public class SubmitPurchaseRequestDto
    {
        // Null = use the admin-configured default recipients (legacy/API callers).
        // Empty list = explicitly skipped by the user in the confirm dialog.
        public List<string>? Emails { get; set; }
    }
}
