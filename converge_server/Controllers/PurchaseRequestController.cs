using converge_server.Models.DTOs.BillOfMaterial;
using converge_server.Models.DTOs.PurchaseRequest;
using converge_server.Models.DTOs.PurchaseRequestItem;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/purchase-requests")]
    [Authorize(Roles = "purchasing")]
    public class PurchaseRequestController : ControllerBase
    {
        private readonly IPurchaseRequestService _purchaseRequestService;
        private readonly IBillOfMaterialService _billOfMaterialService;
        private readonly IWebHostEnvironment _env;

        public PurchaseRequestController(
            IPurchaseRequestService purchaseRequestService,
            IBillOfMaterialService billOfMaterialService,
            IWebHostEnvironment env)
        {
            _purchaseRequestService = purchaseRequestService;
            _billOfMaterialService = billOfMaterialService;
            _env = env;
        }

        [HttpGet]
        public async Task<IActionResult> GetPurchaseRequests()
        {
            var list = await _purchaseRequestService.GetPurchaseRequestsAsync();
            var response = list.Select(pr => new
            {
                pr.Id,
                pr.PRNumber,
                pr.ClientName,
                pr.ShippingAddress,
                pr.RequestDate,
                pr.Status,
                pr.Remarks,
                pr.Source,
                pr.QuotationId,
                pr.IsSeenByPurchasing,
                pr.AttachmentPdfUrl,
                pr.CreatedAt,
                pr.UpdatedAt,
                Items = pr.Items.Select(item => new
                {
                    item.Id,
                    item.ItemName,
                    item.Quantity,
                    item.Unit,
                    item.Status,
                    item.ProductId
                }).ToList(),
                BillOfMaterial = pr.BillOfMaterial == null ? null : new
                {
                    pr.BillOfMaterial.Id,
                    pr.BillOfMaterial.BOMNumber,
                    pr.BillOfMaterial.Status,
                    pr.BillOfMaterial.Remarks,
                    Items = pr.BillOfMaterial.Items.Select(bomItem => new
                    {
                        bomItem.Id,
                        bomItem.ItemName,
                        bomItem.RequiredQuantity,
                        bomItem.Unit,
                        bomItem.Status,
                        bomItem.QuantityToPurchase,
                        bomItem.OrderDate,
                        bomItem.DeliveryDate,
                        bomItem.ReceivedAt,
                        bomItem.Remarks,
                        bomItem.Supplier,
                        bomItem.EvidenceImageUrl
                    }).ToList()
                }
            });

            return Ok(response);
        }

        [HttpPost]
        public async Task<IActionResult> CreatePurchaseRequest([FromBody] CreatePurchaseRequestDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var purchaseRequest = await _purchaseRequestService.CreatePurchaseRequestAsync(dto);
                var response = new PurchaseRequestResponseDto
                {
                    Id = purchaseRequest.Id,
                    PRNumber = purchaseRequest.PRNumber,
                    ClientName = purchaseRequest.ClientName,
                    ShippingAddress = purchaseRequest.ShippingAddress,
                    Remarks = purchaseRequest.Remarks,
                    Status = purchaseRequest.Status,
                    CreatedAt = purchaseRequest.CreatedAt,
                    UpdatedAt = purchaseRequest.UpdatedAt ?? purchaseRequest.CreatedAt,
                    Products = purchaseRequest.Items.Select(item => new PurchaseRequestItemResponseDto
                    {
                        Id = item.Id,
                        ProductId = item.ProductId ?? 0,
                        Quantity = item.Quantity,
                        Status = item.Status,
                        ItemName = item.ItemName
                    }).ToList()
                };

                return CreatedAtAction(nameof(GetPurchaseRequestProcess), new { purchaseRequestId = purchaseRequest.Id }, response);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("{purchaseRequestId:guid}")]
        public async Task<IActionResult> UpdateRequestDetails(Guid purchaseRequestId, [FromBody] UpdatePurchaseRequestDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var pr = await _purchaseRequestService.UpdateRequestDetailsAsync(purchaseRequestId, dto);
                return Ok(new { pr.Id, pr.ClientName, pr.ShippingAddress, pr.Remarks });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPut("{purchaseRequestId:guid}/mark-seen")]
        public async Task<IActionResult> MarkSeen(Guid purchaseRequestId)
        {
            try
            {
                var pr = await _purchaseRequestService.MarkSeenAsync(purchaseRequestId);
                return Ok(new { pr.Id, pr.IsSeenByPurchasing });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        // Whole-request supporting document (e.g. supplier quote). PDF only.
        [HttpPost("{purchaseRequestId:guid}/attachment")]
        public async Task<IActionResult> UploadRequestAttachment(Guid purchaseRequestId, IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { error = "No file uploaded." });
            }

            try
            {
                var pr = await _purchaseRequestService.SaveRequestAttachmentAsync(purchaseRequestId, file, _env.ContentRootPath);
                return Ok(new { pr.Id, pr.AttachmentPdfUrl });
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

        [HttpPost("{purchaseRequestId:guid}/submit")]
        public async Task<IActionResult> SubmitRequest(Guid purchaseRequestId)
        {
            try
            {
                var actor = User.Identity?.Name ?? "purchasing";
                var pr = await _purchaseRequestService.SubmitRequestAsync(purchaseRequestId, actor);
                return Ok(new { pr.Id, pr.Status });
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

        [HttpPost("{purchaseRequestId:guid}/bill-of-material")]
        public async Task<IActionResult> CreateBillOfMaterial(Guid purchaseRequestId)
        {
            try
            {
                var bom = await _purchaseRequestService.CreateBillOfMaterialForPurchaseRequestAsync(purchaseRequestId);
                return CreatedAtAction(nameof(GetBillOfMaterial), new { billOfMaterialId = bom.Id }, new
                {
                    bom.Id,
                    bom.BOMNumber,
                    bom.Status
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
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    Message = ex.Message,
                    Inner = ex.InnerException?.Message,
                    Type = ex.GetType().FullName
                });
            }
        }

        [HttpGet("{purchaseRequestId:guid}/process")]
        public async Task<IActionResult> GetPurchaseRequestProcess(Guid purchaseRequestId)
        {
            var purchaseRequest = await _purchaseRequestService.GetPurchaseRequestProcessAsync(purchaseRequestId);
            if (purchaseRequest == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                purchaseRequest.Id,
                purchaseRequest.PRNumber,
                purchaseRequest.ClientName,
                purchaseRequest.ShippingAddress,
                purchaseRequest.RequestDate,
                purchaseRequest.Status,
                Items = purchaseRequest.Items.Select(item => new
                {
                    item.Id,
                    item.ItemName,
                    item.Quantity,
                    item.Unit,
                    item.Status,
                    item.ProductId
                }),
                BillOfMaterial = purchaseRequest.BillOfMaterial == null ? null : new
                {
                    purchaseRequest.BillOfMaterial.Id,
                    purchaseRequest.BillOfMaterial.BOMNumber,
                    purchaseRequest.BillOfMaterial.Status,
                    purchaseRequest.BillOfMaterial.Remarks,
                    Items = purchaseRequest.BillOfMaterial.Items.Select(item => new
                    {
                        item.Id,
                        item.ItemName,
                        item.RequiredQuantity,
                        item.Unit,
                        item.Status,
                        item.QuantityToPurchase,
                        item.DeliveryDate,
                        item.ReceivedAt,
                        item.Remarks
                    })
                }
            });
        }

        [HttpGet("bill-of-materials/{billOfMaterialId:guid}")]
        public async Task<IActionResult> GetBillOfMaterial(Guid billOfMaterialId)
        {
            var bom = await _purchaseRequestService.GetBillOfMaterialAsync(billOfMaterialId);
            if (bom == null)
            {
                return NotFound();
            }

            return Ok(new
            {
                bom.Id,
                bom.BOMNumber,
                bom.Status,
                bom.Source,
                bom.Remarks,
                Items = bom.Items.Select(item => new
                {
                    item.Id,
                    item.ItemName,
                    item.RequiredQuantity,
                    item.Unit,
                    item.Status,
                    item.QuantityToPurchase,
                    item.DeliveryDate,
                    item.ReceivedAt,
                    item.Remarks
                })
            });
        }

        // Proof-of-transaction image (receipt / delivery photo) for one item.
        [HttpPost("bill-of-material-items/{itemId:guid}/evidence")]
        public async Task<IActionResult> UploadBillOfMaterialItemEvidence(Guid itemId, IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { error = "No file uploaded." });
            }

            try
            {
                var item = await _billOfMaterialService.SaveItemEvidenceAsync(itemId, file, _env.ContentRootPath);
                return Ok(new { item.Id, item.EvidenceImageUrl });
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

        [HttpPut("bill-of-material-items/{itemId:guid}/status")]
        public async Task<IActionResult> UpdateBillOfMaterialItemStatus(Guid itemId, [FromBody] UpdateBillOfMaterialItemStatusDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var item = await _billOfMaterialService.UpdateBillOfMaterialItemStatusAsync(itemId, dto);
                return Ok(new
                {
                    item.Id,
                    item.ItemName,
                    item.Status,
                    item.Remarks
                });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPost("bill-of-materials/{billOfMaterialId:guid}/complete")]
        public async Task<IActionResult> CompleteBillOfMaterial(Guid billOfMaterialId)
        {
            try
            {
                var bom = await _billOfMaterialService.CompleteBillOfMaterialAsync(billOfMaterialId);
                return Ok(new
                {
                    bom.Id,
                    bom.BOMNumber,
                    bom.Status
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
    }
}
 