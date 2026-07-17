using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public record EmailAttachment(string FileName, byte[] Content, string ContentType);

    public interface IEmailSender
    {
        Task SendAsync(string toEmail, string subject, string body, EmailAttachment? attachment = null);
    }
}
