using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* Organisation-wide settings, as key/value rows.

       Readable by any signed-in user and writable only by admin. That split is
       deliberate rather than lax: the quotation form needs the default labor
       rate, the PDF needs the company address, and the approval dialog needs the
       threshold — all of them are things the app must know to work, none of them
       are secrets. Writing is what needs the guard. */
    [ApiController]
    [Route("api/settings/app")]
    [Authorize]
    public class AppSettingsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;

        public AppSettingsController(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
        }
        
        private static readonly Dictionary<string, string> Defaults = new()
        {
            [AppSettingKeys.CompanyName] = "Converge IT Solutions Inc.",
            [AppSettingKeys.CompanyAddress] = "Judge Alba St., Zone III City of Koronadal, South Cotabato",
            [AppSettingKeys.CompanyPhone] = "(83)887-4886",
            [AppSettingKeys.CompanyEmail] = "sales@converge.ph",
            [AppSettingKeys.CompanyWebsite] = "www.converge.ph",
        
            [AppSettingKeys.DefaultLaborRate] = "1560",
            [AppSettingKeys.QuotationValidityDays] = "30",
            [AppSettingKeys.QuotationTaxRate] = "0",

            /* Approval routing. Blank/zero defaults on purpose: an install that
               has not configured these behaves exactly as it did before they
               existed - the engineer decides everything, nothing is escalated,
               and no link goes out in the SMS.

               The link signing secret is NOT here. It is a credential, and
               anything in this list is readable by every signed-in role. */
            [AppSettingKeys.QuoteApprovalEngineerCeiling] = "0",
            [AppSettingKeys.QuoteApprovalEscalationHours] = "0",
            [AppSettingKeys.PublicBaseUrl] = ""
        };

        public class SettingWriteDto
        {
            [Required]
            [MaxLength(100)]
            public string Key { get; set; } = string.Empty;

            [MaxLength(500)]
            public string Value { get; set; } = string.Empty;
        }

        /// <summary>Every known setting, with its default where nothing is stored.</summary>
        [HttpGet]
        public async Task<IActionResult> GetSettings()
        {
            var stored = await _context.AppSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);

            var result = Defaults.ToDictionary(
                d => d.Key,
                d => stored.TryGetValue(d.Key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : d.Value);

            return Ok(result);
        }

        [HttpPut]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> UpsertSetting([FromBody] SettingWriteDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            if (!Defaults.ContainsKey(dto.Key))
            {
                return BadRequest(new { error = $"Unknown setting '{dto.Key}'." });
            }

            var row = await _context.AppSettings.FirstOrDefaultAsync(s => s.Key == dto.Key);
            if (row == null)
            {
                row = new AppSetting { Key = dto.Key };
                _context.AppSettings.Add(row);
            }

            var previous = row.Value;
            row.Value = dto.Value?.Trim() ?? string.Empty;
            row.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Setting", dto.Key, "Updated",
                User.Identity?.Name ?? "admin", previous, row.Value);

            return Ok(new { key = row.Key, value = row.Value });
        }
    }
}
