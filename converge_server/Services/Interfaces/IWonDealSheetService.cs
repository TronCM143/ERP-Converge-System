namespace converge_server.Services.Interfaces
{
    public interface IWonDealSheetService
    {
        /// <summary>
        /// Appends one row to the "Deals Won" Google Sheet. Returns false
        /// (never throws) if the integration isn't configured or the write
        /// failed, so a spreadsheet outage never blocks a stage change.
        /// </summary>
        Task<bool> AppendWonDealAsync(string projectCode, string clientName, decimal totalSales, DateTime wonDate);
    }
}
