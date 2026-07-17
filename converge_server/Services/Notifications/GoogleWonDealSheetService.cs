using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using converge_server.Services.Interfaces;

namespace converge_server.Services.Notifications
{
    /// <summary>
    /// Appends a row to a Google Sheet whenever a deal is marked Won, via a
    /// service-account key (API keys can't write to Sheets — read-only).
    /// Columns: Date Logged | Project Code | Client Name | Date Accomplished | Total Sales.
    /// </summary>
    public class GoogleWonDealSheetService : IWonDealSheetService
    {
        private readonly string? _spreadsheetId;
        private readonly string _sheetName;
        private readonly string? _keyFilePath;
        private readonly ILogger<GoogleWonDealSheetService> _logger;

        public GoogleWonDealSheetService(IConfiguration configuration, IHostEnvironment env, ILogger<GoogleWonDealSheetService> logger)
        {
            _logger = logger;
            _spreadsheetId = configuration["GoogleSheets:SpreadsheetId"];
            _sheetName = configuration["GoogleSheets:SheetName"] ?? "Sheet1";

            var configuredPath = configuration["GoogleSheets:ServiceAccountKeyPath"];
            _keyFilePath = string.IsNullOrWhiteSpace(configuredPath)
                ? null
                : Path.IsPathRooted(configuredPath) ? configuredPath : Path.Combine(env.ContentRootPath, configuredPath);
        }

        public async Task<bool> AppendWonDealAsync(string projectCode, string clientName, decimal totalSales, DateTime wonDate)
        {
            if (string.IsNullOrWhiteSpace(_spreadsheetId) || _keyFilePath == null || !File.Exists(_keyFilePath))
            {
                _logger.LogWarning(
                    "Google Sheets not configured (SpreadsheetId or service-account key file missing at '{Path}') — skipping won-deal log.",
                    _keyFilePath);
                return false;
            }

            try
            {
                GoogleCredential credential;
                using (var stream = new FileStream(_keyFilePath, FileMode.Open, FileAccess.Read))
                {
                    credential = GoogleCredential.FromStream(stream).CreateScoped(SheetsService.Scope.Spreadsheets);
                }

                using var sheetsService = new SheetsService(new BaseClientService.Initializer
                {
                    HttpClientInitializer = credential,
                    ApplicationName = "Converge"
                });

                var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
                var accomplished = wonDate.ToString("yyyy-MM-dd");

                var valueRange = new ValueRange
                {
                    Values = new List<IList<object>>
                    {
                        new List<object> { today, projectCode, clientName, accomplished, totalSales }
                    }
                };

                var appendRequest = sheetsService.Spreadsheets.Values.Append(valueRange, _spreadsheetId, $"{_sheetName}!A:E");
                appendRequest.ValueInputOption = SpreadsheetsResource.ValuesResource.AppendRequest.ValueInputOptionEnum.USERENTERED;
                appendRequest.InsertDataOption = SpreadsheetsResource.ValuesResource.AppendRequest.InsertDataOptionEnum.INSERTROWS;

                await appendRequest.ExecuteAsync();
                return true;
            }
            catch (Exception ex)
            {
                // A Sheets outage/permission error must never block the CRM stage change.
                _logger.LogError(ex, "Failed to append won-deal row to Google Sheets for {ClientName}", clientName);
                return false;
            }
        }
    }
}
