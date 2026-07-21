using converge_server.Models.DTOs.Quotation;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    // Class level allows admin (read-only oversight); mutation endpoints re-restrict to quotation.
    [ApiController]
    [Route("api/quotations")]
    [Authorize(Roles = "quotation,admin")]
    public class QuotationController : ControllerBase
    {
        private readonly IQuotationService _quotationService;
        private readonly IQuotationGenerationService _quotationGenerationService;

        public QuotationController(
            IQuotationService quotationService,
            IQuotationGenerationService quotationGenerationService)
        {
            _quotationService = quotationService;
            _quotationGenerationService = quotationGenerationService;
        }

        [HttpGet]
        public async Task<IActionResult> GetQuotations([FromQuery] int? clientId)
        {
            var list = await _quotationService.GetQuotationsAsync(clientId);
            var response = list.Select(MapToResponse);
            return Ok(response);
        }

        [HttpGet("{quotationId:int}")]
        public async Task<IActionResult> GetQuotation(int quotationId)
        {
            var quotation = await _quotationService.GetQuotationAsync(quotationId);
            if (quotation == null)
            {
                return NotFound();
            }

            return Ok(MapToResponse(quotation));
        }

        [HttpPost]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> CreateQuotation([FromBody] CreateQuotationDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var quotation = await _quotationService.CreateQuotationAsync(dto);
                var full = await _quotationService.GetQuotationAsync(quotation.Id);
                return CreatedAtAction(nameof(GetQuotation), new { quotationId = quotation.Id }, MapToResponse(full!));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("{quotationId:int}")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> UpdateQuotation(int quotationId, [FromBody] CreateQuotationDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var actorUsername = User.Identity?.Name ?? "system";
                await _quotationService.UpdateQuotationAsync(quotationId, dto, actorUsername);
                var full = await _quotationService.GetQuotationAsync(quotationId);
                return Ok(MapToResponse(full!));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("generate")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> GenerateDraft([FromBody] GenerateQuotationRequestDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var draft = await _quotationGenerationService.GenerateDraftAsync(dto.Prompt);
                return Ok(draft);
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(502, new { error = ex.Message });
            }
        }

        [HttpPost("{quotationId:int}/send-to-purchasing")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> SendToPurchasing(int quotationId)
        {
            try
            {
                var purchaseRequest = await _quotationService.SendToPurchasingAsync(quotationId);
                return Ok(new
                {
                    purchaseRequest.Id,
                    purchaseRequest.PRNumber,
                    purchaseRequest.Status
                });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{quotationId:int}/approve")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> Approve(int quotationId, [FromBody] SendQuotationPdfDto? dto)
        {
            try
            {
                var actorUsername = User.Identity?.Name ?? "system";
                var wonSheetSaved = await _quotationService.ApproveAsync(quotationId, actorUsername, dto?.Emails);
                var quotation = await _quotationService.GetQuotationAsync(quotationId);
                return Ok(new { message = "Quotation approved.", quotation = MapToResponse(quotation!), wonSheetSaved });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{quotationId:int}/reject")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> Reject(int quotationId)
        {
            try
            {
                var actorUsername = User.Identity?.Name ?? "system";
                await _quotationService.RejectAsync(quotationId, actorUsername);
                var quotation = await _quotationService.GetQuotationAsync(quotationId);
                return Ok(new { message = "Quotation rejected.", quotation = MapToResponse(quotation!) });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("{quotationId:int}/pdf")]
        public async Task<IActionResult> GetQuotationPdf(int quotationId)
        {
            try
            {
                var (bytes, fileName) = await _quotationService.GenerateQuotationPdfAsync(quotationId);
                return File(bytes, "application/pdf", fileName);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPost("{quotationId:int}/send-pdf")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> SendQuotationPdf(int quotationId, [FromBody] SendQuotationPdfDto dto)
        {
            if (dto.Emails == null || dto.Emails.Count == 0)
            {
                return BadRequest(new { error = "At least one email is required." });
            }

            try
            {
                var actorUsername = User.Identity?.Name ?? "system";
                var sentCount = await _quotationService.SendQuotationPdfAsync(quotationId, dto.Emails, actorUsername);
                return Ok(new { message = $"Sent to {sentCount} recipient(s).", sentCount });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        private static QuotationResponseDto MapToResponse(Models.Entities.Quotation quotation)
        {
            return new QuotationResponseDto
            {
                Id = quotation.Id,
                QuotationNumber = quotation.QuotationNumber,
                QuotationName = quotation.QuotationName,
                OriginalPrompt = quotation.OriginalPrompt,
                Notes = quotation.Notes,
                ClientId = quotation.ClientId,
                ClientName = quotation.Client?.Name ?? string.Empty,
                Status = quotation.Status.ToString(),
                MaterialsTotal = quotation.MaterialsTotal,
                LaborTotal = quotation.LaborTotal,
                GrandTotal = quotation.GrandTotal,
                PurchaseRequestId = quotation.PurchaseRequestId,
                CreatedAt = quotation.CreatedAt,
                UpdatedAt = quotation.UpdatedAt,
                MaterialItems = quotation.MaterialItems.Select(i => new QuotationMaterialItemResponseDto
                {
                    Id = i.Id,
                    ProductId = i.ProductId,
                    ItemName = i.ItemName,
                    Note = i.Specification,
                    Model = i.Model,
                    Quantity = i.Quantity,
                    Unit = i.Unit,
                    UnitPrice = i.UnitPrice,
                    TaxPercent = i.TaxPercent,
                    LineTotal = i.LineTotal
                }).ToList(),
                LaborItems = quotation.LaborItems.Select(i => new QuotationLaborItemResponseDto
                {
                    Id = i.Id,
                    Description = i.Description,
                    Days = i.Days,
                    Persons = i.Persons,
                    RatePerPersonPerDay = i.RatePerPersonPerDay,
                    LineTotal = i.LineTotal
                }).ToList()
            };
        }
    }
}
