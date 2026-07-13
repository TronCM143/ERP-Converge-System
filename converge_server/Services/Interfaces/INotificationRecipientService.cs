using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.DTOs.Notification;

namespace converge_server.Services.Interfaces
{
    public interface INotificationRecipientService
    {
        Task<List<NotificationRecipientResponseDto>> GetAllAsync();
        Task<NotificationRecipientResponseDto?> GetAsync(int recipientId);
        Task<NotificationRecipientResponseDto> CreateAsync(CreateNotificationRecipientDto dto);
        Task<NotificationRecipientResponseDto?> UpdateAsync(int recipientId, UpdateNotificationRecipientDto dto);
        Task<bool> DeleteAsync(int recipientId);
        Task<bool> UpdatePreferencesAsync(int recipientId, List<UpdateNotificationPreferenceDto> preferences);
    }
}
