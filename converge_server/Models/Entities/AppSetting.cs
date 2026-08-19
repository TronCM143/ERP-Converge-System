using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    /* Generic key/value for settings an admin can change at runtime.

       A table rather than appsettings.json because the value has to be editable
       from the Settings page without a redeploy, and one row beats a column per
       setting on a table that would otherwise never grow. DepartmentEmails stays
       as it is — it is a typed list, not a scalar setting. */
    public class AppSetting
    {
        [Key]
        [MaxLength(100)]
        public string Key { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Value { get; set; } = string.Empty;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public static class AppSettingKeys
    {
        /// <summary>Peso figure at or above which a quotation needs engineer approval.</summary>
        public const string QuoteApprovalThreshold = "quote.approval.threshold";
    }
}
