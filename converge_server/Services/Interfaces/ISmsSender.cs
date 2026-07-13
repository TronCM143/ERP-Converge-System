using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public interface ISmsSender
    {
        Task SendAsync(string toPhone, string message);
    }
}
