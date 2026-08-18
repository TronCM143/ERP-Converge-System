using converge_server.Models.DTOs.PurchaseOrder;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/purchase-orders")]
    [Authorize(Roles = "purchasing,admin")]
    public class PurchaseOrderController : ControllerBase
    {
        private readonly IPurchaseOrderService _purchaseOrderService;

        public PurchaseOrderController(IPurchaseOrderService purchaseOrderService)
        {
            _purchaseOrderService = purchaseOrderService;
        }

        [HttpPost("from-bom/{bomId:guid}")]
        public async Task<IActionResult> CreateFromBom(Guid bomId)
        {
            try
            {
                var po = await _purchaseOrderService.CreateFromBomAsync(bomId);
                var response = new PurchaseOrderResponseDto
                {
                    Id = po.Id,
                    PONumber = po.PONumber,
                    BillOfMaterialId = po.BillOfMaterialId,
                    SupplierId = po.SupplierId,
                    OrderDate = po.OrderDate,
                    ExpectedArrivalDate = po.ExpectedArrivalDate,
                    ShippingAddress = po.ShippingAddress,
                    UntaxedAmount = po.UntaxedAmount,
                    VATAmount = po.VATAmount,
                    DiscountAmount = po.DiscountAmount,
                    GrandTotal = po.GrandTotal,
                    Status = po.Status,
                    CreatedAt = po.CreatedAt,
                    UpdatedAt = po.UpdatedAt,
                    Remarks = po.Remarks,
                    Items = po.Items.Select(i => new PurchaseOrderItemResponseDto
                    {
                        Id = i.Id,
                        ItemName = i.ItemName,
                        Quantity = i.Quantity,
                        Unit = i.Unit,
                        UnitPrice = i.UnitPrice,
                        LineTotal = i.LineTotal,
                        Remarks = i.Remarks
                    }).ToList()
                };

                return CreatedAtAction(nameof(GetPurchaseOrder), new { id = po.Id }, response);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetPurchaseOrder(Guid id)
        {
            var po = await _purchaseOrderService.GetPurchaseOrderAsync(id);
            if (po == null) return NotFound();

            var response = new PurchaseOrderResponseDto
            {
                Id = po.Id,
                PONumber = po.PONumber,
                BillOfMaterialId = po.BillOfMaterialId,
                SupplierId = po.SupplierId,
                OrderDate = po.OrderDate,
                ExpectedArrivalDate = po.ExpectedArrivalDate,
                ShippingAddress = po.ShippingAddress,
                UntaxedAmount = po.UntaxedAmount,
                VATAmount = po.VATAmount,
                DiscountAmount = po.DiscountAmount,
                GrandTotal = po.GrandTotal,
                Status = po.Status,
                CreatedAt = po.CreatedAt,
                UpdatedAt = po.UpdatedAt,
                Remarks = po.Remarks,
                Items = po.Items.Select(i => new PurchaseOrderItemResponseDto
                {
                    Id = i.Id,
                    ItemName = i.ItemName,
                    Quantity = i.Quantity,
                    Unit = i.Unit,
                    UnitPrice = i.UnitPrice,
                    LineTotal = i.LineTotal,
                    Remarks = i.Remarks
                }).ToList()
            };

            return Ok(response);
        }

        [HttpGet]
        public async Task<IActionResult> List()
        {
            var list = await _purchaseOrderService.ListAsync();
            var response = list.Select(po => new PurchaseOrderResponseDto
            {
                Id = po.Id,
                PONumber = po.PONumber,
                BillOfMaterialId = po.BillOfMaterialId,
                SupplierId = po.SupplierId,
                OrderDate = po.OrderDate,
                ExpectedArrivalDate = po.ExpectedArrivalDate,
                ShippingAddress = po.ShippingAddress,
                UntaxedAmount = po.UntaxedAmount,
                VATAmount = po.VATAmount,
                DiscountAmount = po.DiscountAmount,
                GrandTotal = po.GrandTotal,
                Status = po.Status,
                CreatedAt = po.CreatedAt,
                UpdatedAt = po.UpdatedAt,
                Remarks = po.Remarks,
                Items = po.Items.Select(i => new PurchaseOrderItemResponseDto
                {
                    Id = i.Id,
                    ItemName = i.ItemName,
                    Quantity = i.Quantity,
                    Unit = i.Unit,
                    UnitPrice = i.UnitPrice,
                    LineTotal = i.LineTotal,
                    Remarks = i.Remarks
                }).ToList()
            });

            return Ok(response);
        }

        [HttpPut("{id:guid}/status")]
        public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdatePurchaseOrderStatusDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            try
            {
                var po = await _purchaseOrderService.UpdateStatusAsync(id, dto.Status, dto.Remarks);
                return Ok(new { po.Id, po.PONumber, po.Status });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPut("{id:guid}")]
        public async Task<IActionResult> UpdatePurchaseOrder(Guid id, [FromBody] UpdatePurchaseOrderDto dto)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            try
            {
                var po = await _purchaseOrderService.UpdatePurchaseOrderAsync(id, dto);
                // Map to a DTO — returning the entity directly creates a JSON
                // cycle (Items -> PurchaseOrder -> Items -> ...).
                var response = new PurchaseOrderResponseDto
                {
                    Id = po.Id,
                    PONumber = po.PONumber,
                    BillOfMaterialId = po.BillOfMaterialId,
                    SupplierId = po.SupplierId,
                    OrderDate = po.OrderDate,
                    ExpectedArrivalDate = po.ExpectedArrivalDate,
                    ShippingAddress = po.ShippingAddress,
                    UntaxedAmount = po.UntaxedAmount,
                    VATAmount = po.VATAmount,
                    DiscountAmount = po.DiscountAmount,
                    GrandTotal = po.GrandTotal,
                    Status = po.Status,
                    Remarks = po.Remarks,
                    Items = po.Items.Select(i => new PurchaseOrderItemResponseDto
                    {
                        Id = i.Id,
                        ItemName = i.ItemName,
                        Quantity = i.Quantity,
                        Unit = i.Unit,
                        UnitPrice = i.UnitPrice,
                        LineTotal = i.LineTotal,
                        Remarks = i.Remarks
                    }).ToList()
                };
                return Ok(response);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }
    }
}
