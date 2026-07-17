using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace converge_server.Services.Quotations
{
    // Renders a quotation as a print-ready HTML document and converts it to a
    // PDF with a headless Chromium instance. The browser is expensive to start
    // (downloads Chromium on first use, launches a real process), so this
    // service is registered as a singleton and keeps one browser alive for the
    // app's lifetime rather than launching one per request.
    public class QuotationPdfService : IQuotationPdfService, IAsyncDisposable
    {
        private static readonly SemaphoreSlim InitLock = new(1, 1);
        private static string? _logoDataUri;
        private IBrowser? _browser;
        private readonly ILogger<QuotationPdfService> _logger;
        private readonly string _logoPath;

        private const string CompanyAddress = "Judge Alba St., Zone III City of Koronadal, South Cotabato";
        private const string CompanyPhone = "+63 (83) 887-4886";
        private const string CompanyEmail = "sales@converge.ph";
        private const string CompanyWebsite = "www.converge.ph";
        private const string TermsUrl = "https://convergeit-solutions-inc3.odoo.com/terms";

        public QuotationPdfService(ILogger<QuotationPdfService> logger, IWebHostEnvironment env)
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
                _logger.LogWarning(ex, "Could not load quotation PDF logo from {Path}", _logoPath);
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

        public async Task<byte[]> GeneratePdfAsync(Models.Entities.Quotation quotation)
        {
            var html = BuildHtml(quotation, GetLogoDataUri());
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

        // Product/item names are stored with underscores instead of spaces
        // (e.g. "dahua_2mp_5tb") — mirrors converge_frontend's formatProductName.
        private static string FormatItemName(string raw) =>
            string.IsNullOrEmpty(raw) ? string.Empty : raw.Replace('_', ' ');

        private static string Peso(decimal amount) =>
            "₱ " + amount.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-PH"));

        private static string Esc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

        private static string BuildHtml(Models.Entities.Quotation quotation, string logoDataUri)
        {
            var client = quotation.Client;
            var untaxed = quotation.MaterialsTotal + quotation.LaborTotal;
            var vat = quotation.MaterialItems.Sum(i => i.Quantity * i.UnitPrice * i.TaxPercent / 100m);
            var total = quotation.GrandTotal;

            var itemsHtml = new StringBuilder();
            var rowIndex = 0;

            foreach (var item in quotation.MaterialItems.OrderBy(i => i.SortOrder))
            {
                var rowBg = rowIndex % 2 == 0 ? "#f7f8fa" : "#fff";
                var amount = item.Quantity * item.UnitPrice;
                itemsHtml.Append($@"
                <tr style=""background:{rowBg}"">
                  <td style=""padding:12px 8px 12px 0;vertical-align:top"">
                    <div style=""font-weight:600"">{Esc(FormatItemName(item.ItemName))}</div>
                    {(string.IsNullOrWhiteSpace(item.Specification) ? "" : $@"<div style=""color:#666;font-size:12px;margin-top:2px"">{Esc(item.Specification)}</div>")}
                  </td>
                  <td style=""padding:12px 0;text-align:right;vertical-align:top;white-space:nowrap"">{item.Quantity:0.00} {Esc(item.Unit)}</td>
                  <td style=""padding:12px 0;text-align:right;vertical-align:top"">{item.UnitPrice.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-PH"))}</td>
                  <td style=""padding:12px 0 12px 8px;text-align:right;vertical-align:top"">{amount.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-PH"))} ₱</td>
                </tr>");
                rowIndex++;
            }

            foreach (var labor in quotation.LaborItems.OrderBy(i => i.SortOrder))
            {
                var rowBg = rowIndex % 2 == 0 ? "#f7f8fa" : "#fff";
                var note = $"{labor.Persons} personnel × {labor.Days} day(s) @ {Peso(labor.RatePerPersonPerDay)}/day";
                itemsHtml.Append($@"
                <tr style=""background:{rowBg}"">
                  <td style=""padding:12px 8px 12px 0;vertical-align:top"">
                    <div style=""font-weight:600"">{Esc(labor.Description)}</div>
                    <div style=""color:#666;font-size:12px;margin-top:2px"">{Esc(note)}</div>
                  </td>
                  <td style=""padding:12px 0;text-align:right;vertical-align:top;white-space:nowrap"">1.00 lot</td>
                  <td style=""padding:12px 0;text-align:right;vertical-align:top"">{labor.LineTotal.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-PH"))}</td>
                  <td style=""padding:12px 0 12px 8px;text-align:right;vertical-align:top"">{labor.LineTotal.ToString("N2", System.Globalization.CultureInfo.GetCultureInfo("en-PH"))} ₱</td>
                </tr>");
                rowIndex++;
            }

            var quotationDate = quotation.CreatedAt.ToString("MM/dd/yyyy");

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
      <div style=""font-size:13px;margin-bottom:4px;"">{Esc(client?.Name)}</div>
      <div style=""font-size:13px;color:#555;margin-bottom:24px;"">{Esc(client?.Address)}</div>

      <h1 style=""color:#1f6fb2;font-size:28px;font-weight:600;margin:0 0 28px;"">Quotation # {Esc(quotation.QuotationNumber)}</h1>

      <div style=""background:#f4f6f8;border-radius:6px;padding:16px 24px;display:flex;gap:48px;margin-bottom:28px;"">
        <div>
          <div style=""font-size:11px;font-weight:700;color:#1f6fb2;"">Quotation Date</div>
          <div style=""font-size:13px;"">{quotationDate}</div>
        </div>
        <div>
          <div style=""font-size:11px;font-weight:700;color:#1f6fb2;"">Status</div>
          <div style=""font-size:13px;"">{Esc(quotation.Status.ToString())}</div>
        </div>
      </div>

      <table style=""width:100%;border-collapse:collapse;font-size:13px;"">
        <thead>
          <tr style=""text-align:left;color:#333;"">
            <th style=""padding:8px 0;font-weight:700;width:50%;"">Description</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Qty</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Unit Price</th>
            <th style=""padding:8px 0;font-weight:700;text-align:right;"">Amount</th>
          </tr>
        </thead>
        <tbody>
          {itemsHtml}
        </tbody>
      </table>

      <div style=""display:flex;justify-content:flex-end;margin-top:12px;"">
        <div style=""width:280px;"">
          <div style=""display:flex;justify-content:space-between;background:#f4f6f8;padding:10px 16px;font-size:13px;"">
            <span style=""color:#666"">Untaxed Amount</span><span>{Peso(untaxed)}</span>
          </div>
          <div style=""display:flex;justify-content:space-between;background:#f4f6f8;padding:10px 16px;font-size:13px;margin-top:2px;"">
            <span style=""color:#666"">VAT</span><span>{Peso(vat)}</span>
          </div>
          <div style=""display:flex;justify-content:space-between;background:#e9eff5;padding:12px 16px;font-size:14px;font-weight:700;color:#1f6fb2;margin-top:2px;"">
            <span>Total</span><span>{Peso(total)}</span>
          </div>
        </div>
      </div>

      <div style=""margin-top:36px;font-size:12px;"">
        Terms &amp; Conditions: <span style=""color:#1f6fb2"">{Esc(TermsUrl)}</span>
      </div>
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
