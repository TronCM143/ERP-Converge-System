using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using converge_server.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace converge_server.Services.Notifications
{
    public class M360SmsSender : ISmsSender
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<M360SmsSender> _logger;

        public M360SmsSender(HttpClient httpClient, IConfiguration configuration, ILogger<M360SmsSender> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task SendAsync(string toPhone, string message)
        {
            var baseUrl = _configuration["Sms:M360:BaseUrl"];
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                _logger.LogWarning("M360 SMS not configured — skipping SMS send to {Phone}", toPhone);
                return;
            }

            try
            {
                // TODO: confirm against M360 API docs for exact request/response contract
                var apiKey = _configuration["Sms:M360:ApiKey"];
                var senderId = _configuration["Sms:M360:SenderId"];

                var payload = new
                {
                    apikey = apiKey,
                    to = toPhone,
                    text = message,
                    sendername = senderId
                };

                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                _httpClient.BaseAddress = new Uri(baseUrl);
                var response = await _httpClient.PostAsync("/SendSMS", content);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("SMS sent to {Phone}", toPhone);
                }
                else
                {
                    _logger.LogError("M360 SMS failed for {Phone}: {StatusCode}", toPhone, response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send SMS to {Phone}", toPhone);
            }
        }
    }
}
