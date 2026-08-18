using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    /* Read-only view of the Odoo sale-order archive, backing the "Matching past
       work" panel beside the quotation prompt box.

       Both endpoints degrade rather than fail: an unconfigured or unreachable
       Odoo returns an empty list / 404, never a 5xx. The panel is an optional
       aid shown while someone is typing, and an error toast there would
       interrupt work over something they didn't ask for. */
    [ApiController]
    [Route("api/odoo")]
    [Authorize(Roles = "quotation,admin")]
    public class OdooController : ControllerBase
    {
        private readonly IOdooService _odooService;

        public OdooController(IOdooService odooService)
        {
            _odooService = odooService;
        }

        [HttpGet("quote-search")]
        public async Task<IActionResult> SearchQuotes([FromQuery] string q, [FromQuery] int limit = 12)
        {
            if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 3)
            {
                return Ok(Array.Empty<object>());
            }

            return Ok(await _odooService.SearchQuotesAsync(q.Trim(), limit));
        }

        [HttpGet("sales-orders/{orderId:long}/draft")]
        public async Task<IActionResult> GetOrderDraft(long orderId)
        {
            var draft = await _odooService.GetOrderDraftAsync(orderId);
            if (draft == null)
            {
                // This one IS user-initiated (they clicked an order), so unlike
                // the search it gets a real message.
                return NotFound(new
                {
                    error = _odooService.IsConfigured
                        ? "Could not load that Odoo order."
                        : "Odoo is not connected. Set Odoo__Username and Odoo__ApiKey."
                });
            }

            return Ok(draft);
        }

        /// <summary>Lets the UI tell "not connected" apart from "no matches".</summary>
        [HttpGet("status")]
        public IActionResult Status() => Ok(new { configured = _odooService.IsConfigured });
    }
}
