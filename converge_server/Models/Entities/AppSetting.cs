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

        /* Company identity, printed on every quotation PDF. These were C#
           constants in QuotationPdfService, so changing a phone number meant a
           code change and a redeploy - the definition of something that belongs
           in settings. The constants remain as fallbacks for a fresh install. */
        public const string CompanyName = "company.name";
        public const string CompanyAddress = "company.address";
        public const string CompanyPhone = "company.phone";
        public const string CompanyEmail = "company.email";
        public const string CompanyWebsite = "company.website";
        public const string CompanyTermsUrl = "company.terms.url";

        /* Default labor rate per person per day. Lived in appsettings.json AND
           as a hardcoded constant in the quotation form, with a comment warning
           that the two had to be changed together or the AI budget check would
           disagree with the form's totals. One row, read by both. */
        public const string DefaultLaborRate = "quotation.labor.rate";

        /// <summary>How many days a quotation is valid for, printed on the PDF.</summary>
        public const string QuotationValidityDays = "quotation.validity.days";

        /* Tax percentage a new quotation line starts at. Zero by default rather
           than the statutory 12%: guessing a tax rate on someone's behalf would
           change every total in the system the moment this shipped. An admin
           sets it once and every new line then starts correct. */
        public const string QuotationTaxRate = "quotation.tax.rate";

        /* Amount-band routing. An engineer decides up to this figure; above it
           the decision is admin-only. Zero means no ceiling - the engineer
           decides everything, which is how the system behaved before this
           setting existed, so an unconfigured install is unchanged. */
        public const string QuoteApprovalEngineerCeiling = "quote.approval.engineerCeiling";

        /// <summary>Hours a request may sit pending before approvers are chased again. 0 disables.</summary>
        public const string QuoteApprovalEscalationHours = "quote.approval.escalationHours";

        /* Where this system is reachable from a phone. Used to build the
           one-tap approval link in the SMS and email. Left blank on purpose
           until an admin sets it: a link to localhost in a text message is
           worse than no link at all. */
        public const string PublicBaseUrl = "app.publicBaseUrl";

        /* Signing key for those links. Generated on first use and never shown
           in the settings API - it is a credential, not a preference. */
        public const string ApprovalLinkSecret = "quote.approval.linkSecret";
    }
}
