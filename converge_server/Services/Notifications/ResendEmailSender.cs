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
            _fromAddress = configuration["Resend:FromAddress"] ?? "onboarding@resend.dev";
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string body)
        {
            var message = new EmailMessage
            {
                From = _fromAddress,
                Subject = subject,
                HtmlBody = body
            };
            message.To.Add(toEmail);

            var response = await _resend.EmailSendAsync(message);
            _logger.LogInformation("Resend email to {To} ({Subject}): id {Id}", toEmail, subject, response.Content);
        }
    }
}
