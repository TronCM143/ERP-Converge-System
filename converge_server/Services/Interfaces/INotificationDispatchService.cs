using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface INotificationDispatchService
    {
        Task DispatchAsync(NotificationType type, string subject, string body, EmailAttachment? attachment = null);

        // Sends to an explicit, caller-supplied email list instead of looking
        // up NotificationRecipients — used when a user picks recipients ad hoc
        // in a confirmation dialog rather than relying on the admin-configured list.
        Task DispatchToExplicitRecipientsAsync(NotificationType type, string subject, string body, List<string> emails, EmailAttachment? attachment = null);

        /// <summary>
        /// Sends to exactly these user accounts - email where they have one, SMS
        /// where they have a number. Used when the SENDER picks the recipients
        /// (the approval dialog), rather than the notification type implying a
        /// role. An empty list sends nothing, which is a valid choice.
        /// </summary>
        Task DispatchToUsersAsync(NotificationType type, string subject, string body, List<int> userIds);
    }
}
