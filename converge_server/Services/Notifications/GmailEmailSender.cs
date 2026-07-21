using System.Text;
using converge_server.Data;
using converge_server.Services.Interfaces;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Notifications
{
    // Sends mail through the Gmail API using the single account connected via
    // the OAuth flow (GoogleOAuthController). No-ops with a warning if
    // nothing has been connected yet, the same graceful-degrade pattern as
    // the other email senders in this app.
    public class GmailEmailSender : IEmailSender
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<GmailEmailSender> _logger;

        public GmailEmailSender(AppDbContext context, IConfiguration configuration, ILogger<GmailEmailSender> logger)
        {
            _context = context;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task SendAsync(string toEmail, string subject, string body, EmailAttachment? attachment = null)
        {
            var stored = await _context.GoogleOAuthCredentials.AsNoTracking().FirstOrDefaultAsync();
            if (stored == null)
            {
                _logger.LogWarning("Gmail sender selected but no Google account is connected — skipping email to {To}.", toEmail);
                return;
            }

            var clientId = _configuration["GoogleOAuth:ClientId"];
            var clientSecret = _configuration["GoogleOAuth:ClientSecret"];
            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                _logger.LogWarning("GoogleOAuth:ClientId/ClientSecret not configured — skipping email to {To}.", toEmail);
                return;
            }

            var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
            {
                ClientSecrets = new ClientSecrets { ClientId = clientId, ClientSecret = clientSecret },
                Scopes = new[] { GmailService.Scope.GmailSend }
            });

            var token = new TokenResponse { RefreshToken = stored.RefreshToken };
            var userCredential = new UserCredential(flow, "converge-gmail-sender", token);

            // Refreshes internally if the cached access token is missing/expired.
            var accessToken = await userCredential.GetAccessTokenForRequestAsync();

            var gmail = new GmailService(new BaseClientService.Initializer
            {
                HttpClientInitializer = userCredential,
                ApplicationName = "Converge"
            });

            var raw = BuildRawMessage(stored.Email, toEmail, subject, body, attachment);
            var message = new Message { Raw = raw };

            try
            {
                await gmail.Users.Messages.Send(message, "me").ExecuteAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Gmail send failed for {To}", toEmail);
                throw;
            }

            // Best-effort cache refresh; not required for correctness since a
            // fresh UserCredential is built (and re-refreshed) per send.
            try
            {
                var tracked = await _context.GoogleOAuthCredentials.FirstOrDefaultAsync();
                if (tracked != null)
                {
                    tracked.AccessToken = accessToken;
                    tracked.AccessTokenExpiresAt = userCredential.Token.IsStale ? null : DateTime.UtcNow.AddSeconds(userCredential.Token.ExpiresInSeconds ?? 0);
                    await _context.SaveChangesAsync();
                }
            }
            catch
            {
                // Non-critical cache write; never let it fail an already-sent email.
            }
        }

        private static string BuildRawMessage(string from, string to, string subject, string htmlBody, EmailAttachment? attachment)
        {
            var sb = new StringBuilder();
            sb.Append("From: ").Append(from).Append("\r\n");
            sb.Append("To: ").Append(to).Append("\r\n");
            sb.Append("Subject: ").Append(EncodeSubject(subject)).Append("\r\n");
            sb.Append("MIME-Version: 1.0\r\n");

            if (attachment == null)
            {
                sb.Append("Content-Type: text/html; charset=UTF-8\r\n\r\n");
                sb.Append(htmlBody);
            }
            else
            {
                var boundary = "converge_" + Guid.NewGuid().ToString("N");
                sb.Append("Content-Type: multipart/mixed; boundary=\"").Append(boundary).Append("\"\r\n\r\n");

                sb.Append("--").Append(boundary).Append("\r\n");
                sb.Append("Content-Type: text/html; charset=UTF-8\r\n\r\n");
                sb.Append(htmlBody).Append("\r\n\r\n");

                sb.Append("--").Append(boundary).Append("\r\n");
                sb.Append("Content-Type: ").Append(attachment.ContentType).Append("; name=\"").Append(attachment.FileName).Append("\"\r\n");
                sb.Append("Content-Transfer-Encoding: base64\r\n");
                sb.Append("Content-Disposition: attachment; filename=\"").Append(attachment.FileName).Append("\"\r\n\r\n");
                sb.Append(Convert.ToBase64String(attachment.Content)).Append("\r\n\r\n");
                sb.Append("--").Append(boundary).Append("--");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        }

        // RFC 2047 encoded-word so emoji/non-ASCII subjects (e.g. "🎉 Deal Won") survive.
        private static string EncodeSubject(string subject) =>
            $"=?UTF-8?B?{Convert.ToBase64String(Encoding.UTF8.GetBytes(subject))}?=";
    }
}
