using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace converge_server.Services.PurchaseRequests
{
    // Renders a submitted purchase request as a print-ready PDF, the same way
    // QuotationPdfService does for quotations. Kept as its own singleton with
    // its own headless Chromium instance rather than sharing one with
    // QuotationPdfService, to avoid touching the already-working quotation
    // PDF path for this app's modest scale.
    public class PurchaseRequestPdfService : IPurchaseRequestPdfService, IAsyncDisposable
    {
        private static readonly SemaphoreSlim InitLock = new(1, 1);
        private static string? _logoDataUri;
        private IBrowser? _browser;
        private readonly ILogger<PurchaseRequestPdfService> _logger;
        private readonly string _logoPath;

        private const string CompanyAddress = "Judge Alba St., Zone III City of Koronadal, South Cotabato";
        private const string CompanyPhone = "+63 (83) 887-4886";
        private const string CompanyEmail = "sales@converge.ph";
        private const string CompanyWebsite = "www.converge.ph";

        public PurchaseRequestPdfService(ILogger<PurchaseRequestPdfService> logger, IWebHostEnvironment env)
        {
            _logger = logger;
            _logoPath = Path.Combine(env.ContentRootPath, "resources", "CSiLogo_web.png");
        }

        private string GetLogoDataUri()
        {
            if (_logoDataUri != null)
            {
                return _logoDataUri;
            }

            try
            {
                var bytes = File.ReadAllBytes(_logoPath);
                _logoDataUri = $"data:image/png;base64,{Convert.ToBase64String(bytes)}";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not load purchase request PDF logo from {Path}", _logoPath);
                _logoDataUri = string.Empty;
            }

            return _logoDataUri;
        }

        private async Task<IBrowser> GetBrowserAsync()
        {
            if (_browser != null && _browser.IsConnected)
            {
                return _browser;
            }

            await InitLock.WaitAsync();
            try
            {
                if (_browser != null && _browser.IsConnected)
                {
                    return _browser;
                }

                var browserFetcher = new BrowserFetcher();
                await browserFetcher.DownloadAsync();

                _browser = await Puppeteer.LaunchAsync(new LaunchOptions
                {
                    Headless = true,
                    Args = new[] { "--no-sandbox" }
                });

                return _browser;
            }
            finally
            {
                InitLock.Release();
            }
        }

        public async Task<byte[]> GeneratePdfAsync(Models.Entities.PurchaseRequest purchaseRequest)
        {
            var html = BuildHtml(purchaseRequest, GetLogoDataUri());
            var browser = await GetBrowserAsync();

            await using var page = await browser.NewPageAsync();
            await page.SetContentAsync(html);
            var pdfBytes = await page.PdfDataAsync(new PdfOptions
            {
                Width = "8.27in",
                Height = "11.69in",
                PrintBackground = true,
                MarginOptions = new PuppeteerSharp.Media.MarginOptions { Top = "0", Bottom = "0", Left = "0", Right = "0" }
            });

            return pdfBytes;
        }

        private static string FormatItemName(string raw) =>
            string.IsNullOrEmpty(raw) ? string.Empty : raw.Replace('_', ' ');

        private static string Esc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

        private static string BuildHtml(Models.Entities.PurchaseRequest pr, string logoDataUri)
        {
            var itemsHtml = new StringBuilder();
            var rowIndex = 0;
            var items = pr.BillOfMaterial?.Items ?? new System.Collections.Generic.List<Models.Entities.BillOfMaterialItem>();

            foreach (var item in items)
            {
                var rowBg = rowIndex % 2 == 0 ? "#f7f8fa" : "#fff";
                itemsHtml.Append($@"
                <tr style=""background:{rowBg}"">
                  <td style=""padding:10px 8px 10px 0;vertical-align:top"">{Esc(FormatItemName(item.ItemName))}</td>
                  <td style=""padding:10px 0;text-align:right;vertical-align:top;white-space:nowrap"">{item.RequiredQuantity} {Esc(item.Unit)}</td>
                  <td style=""padding:10px 0 10px 8px;vertical-align:top;color:#555;font-size:11.5px"">{Esc(item.Remarks)}</td>
                  <td style=""padding:10px 0;text-align:right;vertical-align:top;white-space:nowrap"">{(item.OrderDate.HasValue ? item.OrderDate.Value.ToString("MM/dd/yyyy") : "—")}</td>
                  <td style=""padding:10px 0;text-align:right;vertical-align:top;white-space:nowrap"">{(item.DeliveryDate.HasValue ? item.DeliveryDate.Value.ToString("MM/dd/yyyy") : "—")}</td>
                  <td style=""padding:10px 0 10px 8px;text-align:right;vertical-align:top;white-space:nowrap"">{Esc(item.Status)}</td>
                </tr>");
                rowIndex++;
            }

            var requestDate = pr.RequestDate.ToString("MM/dd/yyyy");

            return $@"
<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"" />
<style>
  body {{ margin:0; font-family: Arial, Helvetica, sans-serif; color:#2b2b2b; }}
</style>
</head>
<body>
  <div style=""max-width:820px;margin:0 auto;background:#fff;"">
    <div style=""background:#e9eff5;padding:32px 48px 56px;"">
      <div style=""display:flex;justify-content:space-between;align-items:flex-start;"">
        <div>
          {(string.IsNullOrEmpty(logoDataUri)
              ? @"<span style=""font-size:20px;font-weight:800;color:#1f6fb2;letter-spacing:0.2px;"">CONVERGE<span style=""color:#e8770f"">.IT</span></span>"
              : $@"<img src=""{logoDataUri}"" style=""height:64px;width:auto;display:block;"" />")}
        </div>
        <div style=""text-align:right;font-size:11.5px;line-height:1.6;color:#333;"">
          <div><strong>Koronadal City:</strong> {Esc(CompanyAddress)}</div>
          <div>{Esc(CompanyPhone)}</div>
          <div style=""margin-top:6px;"">
            <span style=""color:#1f6fb2"">{Esc(CompanyEmail)}</span> | <span style=""color:#1f6fb2"">{Esc(CompanyWebsite)}</span>
          </div>
        </div>
      </div>
    </div>

    <div style=""padding:8px 48px 40px;margin-top:-32px;"">
      <div style=""font-size:13px;margin-bottom:4px;"">{Esc(pr.ClientName)}</div>
      <div style=""font-size:13px;color:#555;margin-bottom:24px;"">{Esc(pr.ShippingAddress)}</div>

      <h1 style=""color:#1f6fb2;font-size:28px;font-weight:600;margin:0 0 28px;"">Purchase Request # {Esc(pr.PRNumber)}</h1>

      <div style=""background:#f4f6f8;border-radius:6px;padding:16px 24px;display:flex;gap:48px;margin-bottom:28px;"">
        <div>
          <div style=""font-size:11px;font-weight:700;color:#1f6fb2;"">Request Date</div>
          <div style=""font-size:13px;"">{requestDate}</div>
        </div>
        <div>
          <div style=""font-size:11px;font-weight:700;color:#1f6fb2;"">Status</div>
          <div style=""font-size:13px;"">{Esc(pr.Status)}</div>
        </div>
      </div>

      {(string.IsNullOrWhiteSpace(pr.Remarks) ? "" : $@"
      <div style=""margin-bottom:24px;"">
        <div style=""font-size:11px;font-weight:700;color:#1f6fb2;margin-bottom:4px;"">Notes</div>
        <div style=""font-size:13px;color:#333;"">{Esc(pr.Remarks)}</div>
      </div>")}

      <table style=""width:100%;border-collapse:collapse;font-size:13px;"">
        <thead>
          <tr style=""text-align:left;color:#333;"">
            <th style=""padding:8px 0;font-weight:700;width:34%;"">Item</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Qty</th>
            <th style=""padding:8px 0 8px 8px;font-weight:700;"">Note</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Order Date</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Delivery Date</th>
            <th style=""padding:8px 0 8px 8px;font-weight:700;text-align:right;"">Status</th>
          </tr>
        </thead>
        <tbody>
          {itemsHtml}
        </tbody>
      </table>
    </div>

    <div style=""background:#e9eff5;text-align:center;padding:18px 0 10px;font-size:12px;color:#444;"">
      <div>{Esc(CompanyEmail)} http://{Esc(CompanyWebsite)}</div>
      <div style=""color:#999;font-size:11px;margin-top:6px;"">Page 1 / 1</div>
    </div>
  </div>
</body>
</html>";
        }

        public async ValueTask DisposeAsync()
        {
            if (_browser != null)
            {
                await _browser.CloseAsync();
            }
        }
    }
}
