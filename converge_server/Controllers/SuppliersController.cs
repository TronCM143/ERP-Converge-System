using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* The supplier master.

       Purchasing owns this list; sales and admin can read it so a quotation can
       show where a part comes from. Retiring rather than deleting is the norm
       here — see Supplier.IsActive. */
    [ApiController]
    [Route("api/suppliers")]
    [Authorize(Roles = "purchasing,admin,quotation")]
    public class SuppliersController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;

        public SuppliersController(AppDbContext context, IAuditService auditService)
        {
            _context = context;
            _auditService = auditService;
        }

        public class SupplierUpsertDto
        {
            [Required]
            [MaxLength(200)]
            public string Name { get; set; } = string.Empty;

            [MaxLength(300)]
            public string? Address { get; set; }

            [MaxLength(150)]
            public string? ContactPerson { get; set; }

            [MaxLength(40)]
            public string? ContactNumber { get; set; }

            [MaxLength(150)]
            public string? Email { get; set; }

            [MaxLength(1000)]
            public string? Notes { get; set; }

            public bool IsActive { get; set; } = true;
        }

        private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

        /// <summary>The picker list and the management table. search matches name.</summary>
        [HttpGet]
        public async Task<IActionResult> GetSuppliers([FromQuery] string? search, [FromQuery] bool includeInactive = false)
        {
            var query = _context.Suppliers.AsNoTracking().AsQueryable();

            if (!includeInactive)
            {
                query = query.Where(s => s.IsActive);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var needle = search.Trim().ToLower();
                query = query.Where(s => s.Name.ToLower().Contains(needle));
            }

            var rows = await query
                .OrderBy(s => s.Name)
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Address,
                    s.ContactPerson,
                    s.ContactNumber,
                    s.Email,
                    s.Notes,
                    s.IsActive,
                    // What this supplier is actually used for — the number the
                    // free-text version could never produce.
                    LineCount = s.Items.Count
                })
                .ToListAsync();

            return Ok(rows);
        }

        /// <summary>Everything bought from one supplier, newest first.</summary>
        [HttpGet("{supplierId:int}/lines")]
        public async Task<IActionResult> GetSupplierLines(int supplierId, [FromQuery] int limit = 100)
        {
            limit = Math.Clamp(limit, 1, 500);

            var lines = await _context.BillOfMaterialItems
                .AsNoTracking()
                .Where(i => i.SupplierId == supplierId)
                .OrderByDescending(i => i.OrderDate ?? DateTime.MinValue)
                .Take(limit)
                .Select(i => new
                {
                    i.Id,
                    i.ItemName,
                    i.RequiredQuantity,
                    i.Unit,
                    i.UnitPrice,
                    i.Status,
                    i.OrderDate,
                    i.DeliveryDate,
                    // Line value at the agreed price; null price means not yet
                    // negotiated, and is reported as such rather than as zero.
                    LineTotal = i.UnitPrice.HasValue
                        ? (decimal?)((i.UnitPrice.Value * i.RequiredQuantity) - i.DiscountAmount)
                        : null
                })
                .ToListAsync();

            return Ok(lines);
        }

        [HttpPost]
        [Authorize(Roles = "purchasing,admin")]
        public async Task<IActionResult> CreateSupplier([FromBody] SupplierUpsertDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var name = dto.Name.Trim();

            /* Case-insensitive duplicate check. The whole point of this table is
               that one supplier is one row — letting "Dahua" and "dahua" both in
               would recreate the problem it exists to solve. */
            if (await _context.Suppliers.AnyAsync(s => s.Name.ToLower() == name.ToLower()))
            {
                return Conflict(new { error = $"A supplier named '{name}' already exists." });
            }

            var supplier = new Supplier
            {
                Name = name,
                Address = Clean(dto.Address),
                ContactPerson = Clean(dto.ContactPerson),
                ContactNumber = Clean(dto.ContactNumber),
                Email = Clean(dto.Email),
                Notes = Clean(dto.Notes),
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow
            };

            _context.Suppliers.Add(supplier);
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Supplier", supplier.Id.ToString(), "Created",
                User.Identity?.Name ?? "purchasing", null, supplier.Name);

            return Ok(new { supplier.Id, supplier.Name, supplier.Address, supplier.ContactPerson, supplier.ContactNumber, supplier.Email, supplier.Notes, supplier.IsActive });
        }

        [HttpPut("{supplierId:int}")]
        [Authorize(Roles = "purchasing,admin")]
        public async Task<IActionResult> UpdateSupplier(int supplierId, [FromBody] SupplierUpsertDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var supplier = await _context.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId);
            if (supplier == null)
            {
                return NotFound(new { error = "Supplier not found." });
            }

            var name = dto.Name.Trim();
            if (await _context.Suppliers.AnyAsync(s => s.Id != supplierId && s.Name.ToLower() == name.ToLower()))
            {
                return Conflict(new { error = $"A supplier named '{name}' already exists." });
            }

            var previousName = supplier.Name;
            supplier.Name = name;
            supplier.Address = Clean(dto.Address);
            supplier.ContactPerson = Clean(dto.ContactPerson);
            supplier.ContactNumber = Clean(dto.ContactNumber);
            supplier.Email = Clean(dto.Email);
            supplier.Notes = Clean(dto.Notes);
            supplier.IsActive = dto.IsActive;
            supplier.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Supplier", supplier.Id.ToString(), "Updated",
                User.Identity?.Name ?? "purchasing", previousName, supplier.Name);

            return Ok(new { supplier.Id, supplier.Name, supplier.IsActive });
        }

        /* Retire, not delete. A supplier with history cannot be removed without
           orphaning the lines that reference it, and the thing being recorded is
           "we stopped using them" — which is what IsActive says. A supplier that
           was never used at all is genuinely deletable. */
        [HttpDelete("{supplierId:int}")]
        [Authorize(Roles = "purchasing,admin")]
        public async Task<IActionResult> RetireSupplier(int supplierId)
        {
            var supplier = await _context.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId);
            if (supplier == null)
            {
                return NotFound(new { error = "Supplier not found." });
            }

            var used = await _context.BillOfMaterialItems.AnyAsync(i => i.SupplierId == supplierId);

            if (used)
            {
                supplier.IsActive = false;
                supplier.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                await _auditService.LogAsync("Supplier", supplier.Id.ToString(), "Retired",
                    User.Identity?.Name ?? "purchasing", null, supplier.Name, "Has purchase history — retired instead of deleted");

                return Ok(new { retired = true, deleted = false });
            }

            _context.Suppliers.Remove(supplier);
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Supplier", supplierId.ToString(), "Deleted",
                User.Identity?.Name ?? "purchasing", supplier.Name, null, "Never used on a purchase");

            return Ok(new { retired = false, deleted = true });
        }
    }
}
