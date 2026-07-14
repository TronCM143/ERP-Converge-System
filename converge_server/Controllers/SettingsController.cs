using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/settings")]
    [Authorize(Roles = "admin,quotation")]
    public class SettingsController : ControllerBase
    {
        private static readonly string[] Departments = { "sales", "purchasing", "inventory" };

        private readonly AppDbContext _context;

        public SettingsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("department-emails")]
        public async Task<IActionResult> GetDepartmentEmails()
        {
            var stored = await _context.DepartmentEmails.AsNoTracking().ToListAsync();

            // Always return every known department, whether or not a row exists yet.
            var result = Departments.Select(dept => new
            {
                department = dept,
                email = stored.FirstOrDefault(d => d.Department == dept)?.Email ?? string.Empty
            });

            return Ok(result);
        }

        [HttpPut("department-emails")]
        public async Task<IActionResult> UpsertDepartmentEmail([FromBody] UpsertDepartmentEmailDto dto)
        {
            var dept = dto.Department.Trim().ToLowerInvariant();
            if (!Departments.Contains(dept))
            {
                return BadRequest(new { error = $"Unknown department '{dto.Department}'. Valid: {string.Join(", ", Departments)}" });
            }

            var email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
            if (email != null && !new EmailAddressAttribute().IsValid(email))
            {
                return BadRequest(new { error = "Invalid email address." });
            }

            var row = await _context.DepartmentEmails.FirstOrDefaultAsync(d => d.Department == dept);
            if (row == null)
            {
                row = new DepartmentEmail { Department = dept };
                _context.DepartmentEmails.Add(row);
            }

            row.Email = email;
            row.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { department = dept, email = row.Email ?? string.Empty });
        }
    }

    public class UpsertDepartmentEmailDto
    {
        [Required]
        public string Department { get; set; } = string.Empty;

        public string? Email { get; set; }
    }
}
