using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using converge_server.Data;
using converge_server.Models.DTOs.Notification;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Notifications
{
    public class NotificationRecipientService : INotificationRecipientService
    {
        private readonly AppDbContext _context;

        public NotificationRecipientService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<NotificationRecipientResponseDto>> GetAllAsync()
        {
            return await _context.NotificationRecipients
                .Include(r => r.Preferences)
                .OrderBy(r => r.Name)
                .Select(r => MapToResponse(r))
                .ToListAsync();
        }

        public async Task<NotificationRecipientResponseDto?> GetAsync(int recipientId)
        {
            var recipient = await _context.NotificationRecipients
                .Include(r => r.Preferences)
                .FirstOrDefaultAsync(r => r.Id == recipientId);

            return recipient == null ? null : MapToResponse(recipient);
        }

        public async Task<NotificationRecipientResponseDto> CreateAsync(CreateNotificationRecipientDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                throw new ArgumentException("Name is required.");

            if (string.IsNullOrWhiteSpace(dto.Email) && string.IsNullOrWhiteSpace(dto.Phone))
                throw new ArgumentException("At least one of Email or Phone is required.");

            var recipient = new NotificationRecipient
            {
                Name = dto.Name.Trim(),
                Email = dto.Email?.Trim(),
                Phone = dto.Phone?.Trim(),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            _context.NotificationRecipients.Add(recipient);
            await _context.SaveChangesAsync();

            // Seed one NotificationPreference per enum value
            var preferences = Enum.GetValues(typeof(NotificationType))
                .Cast<NotificationType>()
                .Select(type => new NotificationPreference
                {
                    NotificationRecipientId = recipient.Id,
                    Type = type,
                    EmailEnabled = true,
                    SmsEnabled = false
                })
                .ToList();

            _context.NotificationPreferences.AddRange(preferences);
            await _context.SaveChangesAsync();

            return (await GetAsync(recipient.Id))!;
        }

        public async Task<NotificationRecipientResponseDto?> UpdateAsync(int recipientId, UpdateNotificationRecipientDto dto)
        {
            var recipient = await _context.NotificationRecipients.FindAsync(recipientId);
            if (recipient == null)
                return null;

            if (string.IsNullOrWhiteSpace(dto.Name))
                throw new ArgumentException("Name is required.");

            if (string.IsNullOrWhiteSpace(dto.Email) && string.IsNullOrWhiteSpace(dto.Phone))
                throw new ArgumentException("At least one of Email or Phone is required.");

            recipient.Name = dto.Name.Trim();
            recipient.Email = dto.Email?.Trim();
            recipient.Phone = dto.Phone?.Trim();
            recipient.IsActive = dto.IsActive;

            await _context.SaveChangesAsync();

            return await GetAsync(recipientId);
        }

        public async Task<bool> DeleteAsync(int recipientId)
        {
            var recipient = await _context.NotificationRecipients
                .Include(r => r.Preferences)
                .FirstOrDefaultAsync(r => r.Id == recipientId);

            if (recipient == null)
                return false;

            _context.NotificationRecipients.Remove(recipient);
            await _context.SaveChangesAsync();

            return true;
        }

        public async Task<bool> UpdatePreferencesAsync(int recipientId, List<UpdateNotificationPreferenceDto> preferences)
        {
            var recipient = await _context.NotificationRecipients
                .Include(r => r.Preferences)
                .FirstOrDefaultAsync(r => r.Id == recipientId);

            if (recipient == null)
                return false;

            foreach (var pref in preferences)
            {
                var existing = recipient.Preferences.FirstOrDefault(p => p.Type == pref.Type);
                if (existing != null)
                {
                    existing.EmailEnabled = pref.EmailEnabled;
                    existing.SmsEnabled = pref.SmsEnabled;
                }
            }

            await _context.SaveChangesAsync();

            return true;
        }

        private static NotificationRecipientResponseDto MapToResponse(NotificationRecipient recipient)
        {
            return new NotificationRecipientResponseDto
            {
                Id = recipient.Id,
                Name = recipient.Name,
                Email = recipient.Email,
                Phone = recipient.Phone,
                IsActive = recipient.IsActive,
                CreatedAt = recipient.CreatedAt,
                Preferences = recipient.Preferences
                    .OrderBy(p => (int)p.Type)
                    .Select(p => new NotificationPreferenceDto
                    {
                        Type = p.Type,
                        EmailEnabled = p.EmailEnabled,
                        SmsEnabled = p.SmsEnabled
                    })
                    .ToList()
            };
        }
    }
}
