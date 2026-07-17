using converge_server.Services.Interfaces;
using Resend;

namespace converge_server.Services.Notifications
{
    /// <summary>
    /// Sends email through the Resend API. The API key comes from .env
    /// (RESEND_APIKEY). Note: with the default onboarding@resend.dev sender,
    /// Resend only delivers to the account owner's own email address —
    /// verify a domain at resend.com/domains to email anyone else.
    /// </summary>
    public class ResendEmailSender : IEmailSender
    {
        private readonly IResend _resend;
        private readonly string _fromAddress;
        private readonly ILogger<ResendEmailSender> _logger;

        public ResendEmailSender(IResend resend, IConfiguration configuration, ILogger<ResendEmailSender> logger)
        {
            _resend = resend;
            var configuredFromAddress = configuration["Resend:FromAddress"];
            // "??" alone doesn't catch this: an explicitly-blank env var (e.g.
            // "Resend__FromAddress=" with nothing after it) resolves to "", not
            // null, so it silently skipped the fallback and sent with an empty
            // From address — which Resend rejects as "The domain is invalid".
            _fromAddress = string.IsNullOrWhiteSpace(configuredFromAddress) ? "onboarding@resend.dev" : configuredFromAddress;
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string body, Interfaces.EmailAttachment? attachment = null)
        {
            var message = new EmailMessage
            {
                From = _fromAddress,
                Subject = subject,
                HtmlBody = body
            };
            message.To.Add(toEmail);

            if (attachment != null)
            {
                message.Attachments = new List<Resend.EmailAttachment>
                {
                    new()
                    {
                        Filename = attachment.FileName,
                        Content = attachment.Content,
                        ContentType = attachment.ContentType
                    }
                };
            }

            var response = await _resend.EmailSendAsync(message);
            _logger.LogInformation("Resend email to {To} ({Subject}): id {Id}", toEmail, subject, response.Content);
        }
    }
}
