using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;

namespace converge_server.Services.Notifications
{
    public class GoogleSalesTrackerService : ISalesTrackerService
    {
        private readonly string? _spreadsheetId;
        private readonly string _sheetName;
        private readonly string? _keyFilePath;
        private readonly ILogger<GoogleSalesTrackerService> _logger;

        public GoogleSalesTrackerService(
            IConfiguration configuration,
            IHostEnvironment env,
            ILogger<GoogleSalesTrackerService> logger)
        {
            _spreadsheetId = configuration["GoogleSheets:SalesTrackerSpreadsheetId"];
            _sheetName = configuration["GoogleSheets:SalesTrackerSheetName"] ?? "Sales Tracker";
            _logger = logger;

            var configuredPath = configuration["GoogleSheets:ServiceAccountKeyPath"];
            _keyFilePath = string.IsNullOrWhiteSpace(configuredPath)
                ? null
                : Path.IsPathRooted(configuredPath)
                    ? configuredPath
                    : Path.Combine(env.ContentRootPath, configuredPath);
        }

        public async Task<bool> SyncQuotationAsync(Quotation quotation, Client client)
        {
            if (string.IsNullOrWhiteSpace(_spreadsheetId) ||
                _keyFilePath == null ||
                !File.Exists(_keyFilePath))
            {
                _logger.LogWarning(
                    "Sales tracker is not configured (spreadsheet ID or service-account key is missing). Skipping quotation {QuotationNumber}.",
                    quotation.QuotationNumber);
                return false;
            }

            try
            {
                GoogleCredential credential;
                await using (var stream = new FileStream(_keyFilePath, FileMode.Open, FileAccess.Read))
                {
                    credential = GoogleCredential
                        .FromStream(stream)
                        .CreateScoped(SheetsService.Scope.Spreadsheets);
                }

                using var sheetsService = new SheetsService(new BaseClientService.Initializer
                {
                    HttpClientInitializer = credential,
                    ApplicationName = "Converge"
                });

                var row = new List<object>
                {
                    quotation.ServiceRequestNumber,
                    quotation.Status.ToString(),
                    quotation.CreatedAt.ToString("yyyy-MM-dd"),
                    "",
                    client.Name,
                    quotation.QuotationName,
                    client.Address,
                    quotation.ProjectType ?? "",
                    quotation.ProcurementType ?? "",
                    "Direct Quotation",
                    quotation.QuotationNumber,
                    quotation.CreatedAt.ToString("yyyy-MM-dd"),
                    quotation.GrandTotal,
                    quotation.EndorsedBy ?? "",
                    quotation.EndorsementDate?.ToString("yyyy-MM-dd") ?? "",
                    quotation.Notes ?? ""
                };

                var existing = await sheetsService.Spreadsheets.Values.Get(
                    _spreadsheetId,
                    $"{_sheetName}!K:K").ExecuteAsync();
                var rowIndex = existing.Values?
                    .Select((values, index) => new { values, index })
                    .FirstOrDefault(x => x.values.Count > 0 &&
                        string.Equals(x.values[0]?.ToString(), quotation.QuotationNumber, StringComparison.OrdinalIgnoreCase))?
                    .index + 1;

                if (rowIndex.HasValue)
                {
                    var update = sheetsService.Spreadsheets.Values.Update(
                        new ValueRange { Values = new List<IList<object>> { row } },
                        _spreadsheetId,
                        $"{_sheetName}!A{rowIndex}:P{rowIndex}");
                    update.ValueInputOption = SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.USERENTERED;
                    await update.ExecuteAsync();
                }
                else
                {
                    var appendRequest = sheetsService.Spreadsheets.Values.Append(
                        new ValueRange { Values = new List<IList<object>> { row } },
                        _spreadsheetId,
                        $"{_sheetName}!A:P");
                    appendRequest.ValueInputOption = SpreadsheetsResource.ValuesResource.AppendRequest.ValueInputOptionEnum.USERENTERED;
                    appendRequest.InsertDataOption = SpreadsheetsResource.ValuesResource.AppendRequest.InsertDataOptionEnum.INSERTROWS;
                    await appendRequest.ExecuteAsync();
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to append quotation {QuotationNumber} to the sales tracker.",
                    quotation.QuotationNumber);
                return false;
            }
        }
    }
}