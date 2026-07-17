using System;
using System.Threading.Tasks;
using converge_server.Services.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace converge_server.Services.Notifications
{
    public class SmtpEmailSender : IEmailSender
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<SmtpEmailSender> _logger;

        public SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string body, EmailAttachment? attachment = null)
        {
            var host = _configuration["Smtp:Host"];
            if (string.IsNullOrWhiteSpace(host))
            {
                _logger.LogWarning("SMTP not configured — skipping email send to {Email}", toEmail);
                return;
            }

            try
            {
                var port = int.Parse(_configuration["Smtp:Port"] ?? "587");
                var username = _configuration["Smtp:Username"];
                var password = _configuration["Smtp:Password"];
                var fromAddress = _configuration["Smtp:FromAddress"];
                var fromName = _configuration["Smtp:FromName"] ?? "Converge";
                var useStartTls = bool.Parse(_configuration["Smtp:UseStartTls"] ?? "true");

                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(fromName, fromAddress ?? "noreply@converge.local"));
                message.To.Add(MailboxAddress.Parse(toEmail));
                message.Subject = subject;

                var bodyBuilder = new BodyBuilder { HtmlBody = body };
                if (attachment != null)
                {
                    bodyBuilder.Attachments.Add(attachment.FileName, attachment.Content, ContentType.Parse(attachment.ContentType));
                }
                message.Body = bodyBuilder.ToMessageBody();

                using (var client = new SmtpClient())
                {
                    var options = useStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
                    await client.ConnectAsync(host, port, options);

                    if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
                    {
                        await client.AuthenticateAsync(username, password);
                    }

                    await client.SendAsync(message);
                    await client.DisconnectAsync(true);
                }

                _logger.LogInformation("Email sent to {Email}", toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {Email}", toEmail);
            }
        }
    }
}
