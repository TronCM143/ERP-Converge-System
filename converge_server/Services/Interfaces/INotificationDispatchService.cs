using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface INotificationDispatchService
    {
        Task DispatchAsync(NotificationType type, string subject, string body);

        // Sends to an explicit, caller-supplied email list instead of looking
        // up NotificationRecipients — used when a user picks recipients ad hoc
        // in a confirmation dialog rather than relying on the admin-configured list.
        Task DispatchToExplicitRecipientsAsync(NotificationType type, string subject, string body, List<string> emails);
    }
}
