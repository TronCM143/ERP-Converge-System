using System.Threading.Tasks;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface INotificationDispatchService
    {
        Task DispatchAsync(NotificationType type, string subject, string body);
    }
}
