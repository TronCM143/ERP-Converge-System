using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace converge_server.Services.Notifications
{
    public class NotificationDispatchService : INotificationDispatchService
    {
        private readonly AppDbContext _context;
        private readonly IEmailSender _emailSender;
        private readonly ISmsSender _smsSender;
        private readonly IAuditService _auditService;
        private readonly ILogger<NotificationDispatchService> _logger;

        public NotificationDispatchService(
            AppDbContext context,
            IEmailSender emailSender,
            ISmsSender smsSender,
            IAuditService auditService,
            ILogger<NotificationDispatchService> logger)
        {
            _context = context;
            _emailSender = emailSender;
            _smsSender = smsSender;
            _auditService = auditService;
            _logger = logger;
        }

        /* Who hears about what.

           Notifications are addressed to ROLES, and the accounts holding those
           roles are the recipients - see User.Email/Phone. One list of people,
           the same list that logs in, so there is no way for a notification
           address to exist for someone who is not a user (or to be missed
           because nobody copied them into a second table).

           Admin is on everything deliberately: it is the oversight role, and an
           unattended notification is worse than a duplicate one. */
        private static readonly Dictionary<NotificationType, string[]> RolesFor = new()
        {
            [NotificationType.StageChanged] = new[] { "admin" },
            [NotificationType.WonApproval] = new[] { "admin", "quotation" },
            [NotificationType.PurchaseRequestCompleted] = new[] { "admin", "purchasing" },
            [NotificationType.QuotationApproval] = new[] { "engineer", "admin" }
        };

        public async Task DispatchAsync(NotificationType type, string subject, string body, EmailAttachment? attachment = null)
        {
            try
            {
                var roles = RolesFor.TryGetValue(type, out var mapped) ? mapped : new[] { "admin" };

                var recipients = await _context.Users
                    .AsNoTracking()
                    .Where(u => roles.Contains(u.Role))
                    .Select(u => new { u.Username, u.Role, u.Email, u.Phone })
                    .ToListAsync();

                var emailAttempted = 0;
                var smsAttempted = 0;

                foreach (var recipient in recipients)
                {
                    /* Having the address IS the opt-in. The per-type email/SMS
                       toggles that lived on NotificationRecipient are gone with
                       it: they were a second thing to keep in step with the
                       account, and "fill in a phone number to get texts" is a
                       rule anyone can hold in their head. */
                    if (!string.IsNullOrWhiteSpace(recipient.Email))
                    {
                        try
                        {
                            await _emailSender.SendAsync(recipient.Email, subject, body, attachment);
                            emailAttempted++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to send email to {Email}", recipient.Email);
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(recipient.Phone))
                    {
                        try
                        {
                            // SMS carries the subject line, not the HTML body -
                            // a text message cannot render markup and gets
                            // truncated long before the body would fit.
                            await _smsSender.SendAsync(recipient.Phone, subject);
                            smsAttempted++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to send SMS to {Phone}", recipient.Phone);
                        }
                    }
                }

                // Log the dispatch event
                await _auditService.LogAsync(
                    "Notification",
                    type.ToString(),
                    "NotificationSent",
                    "system",
                    null,
                    $"Emails: {emailAttempted}, SMS: {smsAttempted}",
                    $"Dispatched {type} notification to {emailAttempted} email(s) and {smsAttempted} SMS(s)"
                );

                _logger.LogInformation("Dispatched {Type} notification: {EmailCount} emails, {SmsCount} SMS", type, emailAttempted, smsAttempted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to dispatch {Type} notification", type);
            }
        }

        public async Task DispatchToUsersAsync(NotificationType type, string subject, string body, List<int> userIds)
        {
            if (userIds == null || userIds.Count == 0)
            {
                _logger.LogInformation("No recipients selected for {Type}; nothing sent.", type);
                return;
            }

            var recipients = await _context.Users
                .AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.Username, u.Email, u.Phone })
                .ToListAsync();

            var emails = 0;
            var texts = 0;

            foreach (var r in recipients)
            {
                if (!string.IsNullOrWhiteSpace(r.Email))
                {
                    try
                    {
                        await _emailSender.SendAsync(r.Email, subject, body);
                        emails++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to email {User}", r.Username);
                    }
                }

                if (!string.IsNullOrWhiteSpace(r.Phone))
                {
                    try
                    {
                        // Subject, not body: an SMS cannot render the HTML body.
                        await _smsSender.SendAsync(r.Phone, subject);
                        texts++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to text {User}", r.Username);
                    }
                }
            }

            await _auditService.LogAsync("Notification", type.ToString(), "NotificationSent", "system",
                null, null, $"Dispatched {type} to {emails} email(s) and {texts} SMS(s) — chosen recipients");
        }

        public async Task DispatchToExplicitRecipientsAsync(NotificationType type, string subject, string body, List<string> emails, EmailAttachment? attachment = null)
        {
            try
            {
                var emailAttempted = 0;

                foreach (var email in emails.Where(e => !string.IsNullOrWhiteSpace(e)).Distinct())
                {
                    try
                    {
                        await _emailSender.SendAsync(email, subject, body, attachment);
                        emailAttempted++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send email to {Email}", email);
                    }
                }

                await _auditService.LogAsync(
                    "Notification",
                    type.ToString(),
                    "NotificationSent",
                    "system",
                    null,
                    $"Emails: {emailAttempted}",
                    $"Dispatched {type} notification to {emailAttempted} explicitly chosen email(s)"
                );

                _logger.LogInformation("Dispatched {Type} notification to explicit recipients: {EmailCount} emails", type, emailAttempted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to dispatch {Type} notification to explicit recipients", type);
            }
        }
    }
}
