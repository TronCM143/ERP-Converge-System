using System;
using System.Collections.Generic;
using System.Linq;
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

        /* Accepts what people actually type and produces what M360 wants:
           "+63 917 123 4567", "0917 123 4567" and "639171234567" all become
           639171234567. A number stored in one format and required in another
           is otherwise a silent non-delivery. */
        private static string NormalisePhone(string phone)
        {
            var digits = new string((phone ?? string.Empty).Where(char.IsDigit).ToArray());

            // Local 0-prefixed form: 09171234567 -> 639171234567.
            if (digits.StartsWith("0") && digits.Length == 11)
            {
                return "63" + digits[1..];
            }

            // Bare subscriber number: 9171234567 -> 639171234567.
            if (digits.Length == 10 && digits.StartsWith("9"))
            {
                return "63" + digits;
            }

            return digits;
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
                /* Contract confirmed against the live API rather than guessed.
                   POSTing an empty body to /v3/api/broadcast returns a 400 that
                   names every required field:

                     app_key, app_secret (or a longlive token, or username and
                     password), msisdn, content, shortcode_mask

                   The previous code posted to /SendSMS - a path that does not
                   exist on that host (404, text/html) - with apikey/to/text/
                   sendername, and never sent the secret at all. Nothing arrived
                   and the failure looked like a delivery problem rather than a
                   wrong URL. */
                var apiKey = _configuration["Sms:M360:ApiKey"];
                var secretKey = _configuration["Sms:M360:SecretKey"];
                var senderId = _configuration["Sms:M360:SenderId"];

                if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(secretKey))
                {
                    _logger.LogWarning("M360 SMS needs both Sms:M360:ApiKey and Sms:M360:SecretKey — skipping SMS to {Phone}", toPhone);
                    return;
                }

                var payload = new Dictionary<string, string>
                {
                    ["app_key"] = apiKey,
                    ["app_secret"] = secretKey,
                    // MSISDN: country code and number, no plus sign — e.g. 639171234567.
                    ["msisdn"] = NormalisePhone(toPhone),
                    ["content"] = message,
                    ["shortcode_mask"] = senderId ?? string.Empty
                };

                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                // Absolute URL rather than setting BaseAddress per call: an
                // HttpClient throws once a request has been sent on it, and this
                // one is reused for the life of the process.
                var endpoint = new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), "v3/api/broadcast");
                var response = await _httpClient.PostAsync(endpoint, content);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("SMS sent to {Phone}", toPhone);
                }
                else
                {
                    // The body is where M360 explains itself; without it a
                    // failure is just a status code and another guessing game.
                    _logger.LogError("M360 SMS failed for {Phone}: {StatusCode} {Body}", toPhone, response.StatusCode, responseBody);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send SMS to {Phone}", toPhone);
            }
        }
    }
}
