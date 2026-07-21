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

        public async Task DispatchAsync(NotificationType type, string subject, string body, EmailAttachment? attachment = null)
        {
            try
            {
                // Query active recipients
                var recipients = await _context.NotificationRecipients
                    .Where(r => r.IsActive)
                    .Include(r => r.Preferences)
                    .ToListAsync();

                var emailAttempted = 0;
                var smsAttempted = 0;

                foreach (var recipient in recipients)
                {
                    // Get preference for this type; default to Email=true, SMS=false if missing
                    var pref = recipient.Preferences.FirstOrDefault(p => p.Type == type);
                    var emailEnabled = pref?.EmailEnabled ?? true;
                    var smsEnabled = pref?.SmsEnabled ?? false;

                    // Send email if enabled and recipient has email
                    if (emailEnabled && !string.IsNullOrWhiteSpace(recipient.Email))
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

                    // Send SMS if enabled and recipient has phone
                    if (smsEnabled && !string.IsNullOrWhiteSpace(recipient.Phone))
                    {
                        try
                        {
                            await _smsSender.SendAsync(recipient.Phone, body);
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
