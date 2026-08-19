using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using converge_server.Data;
using converge_server.Hubs;
using converge_server.Middleware;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// Load .env into process environment variables BEFORE the configuration is
// built, so keys like Groq__ApiKey resolve as Groq:ApiKey. Secrets live in
// .env (gitignored), not in appsettings.json.
DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// Caching: Redis when ConnectionStrings:Redis is set (e.g. "localhost:6379"),
// otherwise an in-process memory cache so dev works without a Redis instance.
var redisConnection = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redisConnection))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnection;
        options.InstanceName = "converge:";
    });
    Console.WriteLine("Cache: using Redis at " + redisConnection);
}
else
{
    builder.Services.AddDistributedMemoryCache();
    Console.WriteLine("Cache: Redis not configured, using in-memory cache.");
}
builder.Services.AddScoped<converge_server.Services.Interfaces.ICacheService, converge_server.Services.Caching.CacheService>();

// Controllers
builder.Services.AddControllers();

// SignalR (real-time notifications, e.g. new PR popup on the Purchasing side)
builder.Services.AddSignalR();

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"]!;
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

var authBuilder = builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromMinutes(1)
    };

    // SignalR sends the access token via query string (browsers can't set
    // ws headers), so pull it from there for requests targeting our hub.
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

// Google OAuth (Gmail send) — the app's normal auth stays JWT (DefaultAuthenticateScheme
// above is untouched); this is a second, separate scheme only ever reached via an
// explicit Challenge(..., GoogleDefaults.AuthenticationScheme) from GoogleOAuthController.
// A temporary cookie carries the handshake state; OnTicketReceived persists the
// resulting refresh token to GoogleOAuthCredentials and signs the cookie back out
// immediately — there is no lasting Google-backed login session.
var googleClientId = builder.Configuration["GoogleOAuth:ClientId"];
var googleClientSecret = builder.Configuration["GoogleOAuth:ClientSecret"];
if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authBuilder
        .AddCookie("GoogleOAuthCookie", options =>
        {
            options.Cookie.Name = "ConvergeGoogleOAuth";
        })
        .AddGoogle(options =>
        {
            options.ClientId = googleClientId;
            options.ClientSecret = googleClientSecret;
            options.SignInScheme = "GoogleOAuthCookie";
            options.CallbackPath = "/signin-google";
            options.AccessType = "offline";
            options.SaveTokens = true;
            options.Scope.Add("https://www.googleapis.com/auth/gmail.send");

            // Forces Google to reissue a refresh_token even if this account
            // already granted consent before — otherwise a reconnect after
            // disconnecting silently comes back with no refresh_token.
            options.Events.OnRedirectToAuthorizationEndpoint = context =>
            {
                context.Response.Redirect(context.RedirectUri + "&prompt=consent");
                return Task.CompletedTask;
            };

            options.Events.OnTicketReceived = async context =>
            {
                var props = context.Properties!;
                var accessToken = props.GetTokenValue("access_token");
                var refreshToken = props.GetTokenValue("refresh_token");
                var email = context.Principal?.FindFirstValue(ClaimTypes.Email);

                var connected = !string.IsNullOrEmpty(refreshToken) && !string.IsNullOrEmpty(email);
                if (connected)
                {
                    var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                    var existing = await db.GoogleOAuthCredentials.FirstOrDefaultAsync();
                    if (existing == null)
                    {
                        existing = new GoogleOAuthCredential();
                        db.GoogleOAuthCredentials.Add(existing);
                    }
                    existing.Email = email!;
                    existing.RefreshToken = refreshToken!;
                    existing.AccessToken = accessToken;
                    existing.ConnectedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync();
                }

                props.RedirectUri = $"{props.RedirectUri}?connected={(connected ? "1" : "0")}";
            };
        });

    Console.WriteLine("Google OAuth: configured (Gmail sending available once connected in Settings).");
}
else
{
    Console.WriteLine("Google OAuth: not configured (set GoogleOAuth:ClientId/ClientSecret) — Connect Google button will fail until it is.");
}

builder.Services.AddAuthorization();

// Application services
builder.Services.AddScoped<converge_server.Services.Interfaces.IPurchaseRequestService, converge_server.Services.PurchaseRequestService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IBillOfMaterialService, converge_server.Services.BillOfMaterial.BillOfMaterialService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IPurchaseOrderService, converge_server.Services.PurchaseOrders.PurchaseOrderService>();
builder.Services.AddSingleton<converge_server.Services.Interfaces.IPurchaseRequestPdfService, converge_server.Services.PurchaseRequests.PurchaseRequestPdfService>();
builder.Services.AddScoped<IAuthService, converge_server.Services.Auth.AuthService>();
builder.Services.AddScoped<IQuotationService, converge_server.Services.Quotations.QuotationService>();
builder.Services.AddSingleton<converge_server.Services.Interfaces.IQuotationPdfService, converge_server.Services.Quotations.QuotationPdfService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IQuotationGenerationService, converge_server.Services.Ai.GroqQuotationGenerationService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IQuoteApprovalService, converge_server.Services.Quotations.QuoteApprovalService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IClientService, converge_server.Services.Clients.ClientService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IAuditService, converge_server.Services.Audit.AuditService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.INotificationRecipientService, converge_server.Services.Notifications.NotificationRecipientService>();
// Email: Gmail (via the OAuth connection above) when explicitly selected,
// else Resend when RESEND_APIKEY is set, else the SMTP sender (which itself
// no-ops without SMTP config).
var emailProvider = builder.Configuration["Email:Provider"];
var resendApiKey = builder.Configuration["Resend:ApiKey"] ?? builder.Configuration["RESEND_APIKEY"];
if (string.Equals(emailProvider, "Gmail", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<converge_server.Services.Interfaces.IEmailSender, converge_server.Services.Notifications.GmailEmailSender>();
    Console.WriteLine("Email: using Gmail (requires a connected Google account in Settings).");
}
else if (!string.IsNullOrWhiteSpace(resendApiKey))
{
    builder.Services.AddOptions();
    builder.Services.AddHttpClient<Resend.ResendClient>();
    builder.Services.Configure<Resend.ResendClientOptions>(o => o.ApiToken = resendApiKey);
    builder.Services.AddTransient<Resend.IResend, Resend.ResendClient>();
    builder.Services.AddScoped<converge_server.Services.Interfaces.IEmailSender, converge_server.Services.Notifications.ResendEmailSender>();
    Console.WriteLine("Email: using Resend.");
}
else
{
    builder.Services.AddScoped<converge_server.Services.Interfaces.IEmailSender, converge_server.Services.Notifications.SmtpEmailSender>();
    Console.WriteLine("Email: Resend not configured (set RESEND_APIKEY in .env), falling back to SMTP sender.");
}
builder.Services.AddScoped<converge_server.Services.Interfaces.ISmsSender, converge_server.Services.Notifications.M360SmsSender>();
builder.Services.AddScoped<converge_server.Services.Interfaces.INotificationDispatchService, converge_server.Services.Notifications.NotificationDispatchService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IUserNotificationService, converge_server.Services.Notifications.UserNotificationService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IWonDealSheetService, converge_server.Services.Notifications.GoogleWonDealSheetService>();

// Products: image search (Google Custom Search, no-ops until configured) +
// the product service itself (also needs its own HttpClient to download the
// image bytes once a source URL is found).
builder.Services.AddHttpClient<converge_server.Services.Interfaces.IProductImageSearchService, converge_server.Services.Products.GoogleProductImageSearchService>();
builder.Services.AddHttpClient<converge_server.Services.Interfaces.IProductSuggestionSearchService, converge_server.Services.Products.GoogleProductSuggestionSearchService>();
builder.Services.AddHttpClient<converge_server.Services.Products.ProductService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IProductService, converge_server.Services.Products.ProductService>();

// Groq (AI quotation generation from a natural-language prompt).
// The API key comes from .env (Groq__ApiKey); never hardcode it here or in appsettings.json.
Console.WriteLine($"Groq API key: {(string.IsNullOrWhiteSpace(builder.Configuration["Groq:ApiKey"]) ? "NOT configured — set Groq__ApiKey in converge_server/.env" : "configured")}");
builder.Services.AddHttpClient("Groq", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Groq:BaseUrl"]!);
    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", builder.Configuration["Groq:ApiKey"]);
});

// Odoo (read-only sale-order archive behind the "Matching past work" panel).
// Credentials come from .env (Odoo__Username, Odoo__ApiKey — the API key is
// generated in Odoo under Settings → My Profile → Account Security). Without
// them the service reports IsConfigured=false and every call returns empty, so
// the panel simply shows local quotations only.
// Both spellings are accepted — see OdooService.Setting() for why the flat
// ODOO_* form does not resolve as Odoo:* on its own.
string? OdooSetting(string dotted, string flat) =>
    !string.IsNullOrWhiteSpace(builder.Configuration[dotted])
        ? builder.Configuration[dotted]
        : builder.Configuration[flat];

var odooConfigured = !string.IsNullOrWhiteSpace(OdooSetting("Odoo:Username", "ODOO_USERNAME"))
                     && !string.IsNullOrWhiteSpace(OdooSetting("Odoo:ApiKey", "ODOO_API_KEY"));
Console.WriteLine($"Odoo: {(odooConfigured ? "configured" : "NOT configured — set Odoo__Username and Odoo__ApiKey in converge_server/.env")}");
builder.Services.AddHttpClient("Odoo", client =>
{
    var baseUrl = OdooSetting("Odoo:BaseUrl", "ODOO_URL");
    if (!string.IsNullOrWhiteSpace(baseUrl))
    {
        // Trailing slash matters: the relative "jsonrpc" below resolves against
        // it, and without one the last path segment would be replaced.
        client.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
    }
    // Odoo can be slow on a large archive, but this sits behind a debounced
    // keystroke — a long hang would queue requests up behind the user.
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<converge_server.Services.Interfaces.IOdooService, converge_server.Services.Odoo.OdooService>();

// M360 SMS sender (typed HttpClient)
builder.Services.AddHttpClient<converge_server.Services.Notifications.M360SmsSender>();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure database migration and seed data
using (var scope = app.Services.CreateScope())
{
    try
    {
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        context.Database.Migrate();

        if (!context.Products.Any())
        {
            context.Products.AddRange(
                new Product { Category = "CCTV", Subcategory = "Camera", Brand = "Dahua", Model = "DH-HAC", ProductName = "CCTV Camera 2MP", Specs = "1080p, Outdoor, Bullet", Price = 1500, IsActive = true, CreatedAt = DateTime.UtcNow },
                new Product { Category = "CCTV", Subcategory = "NVR", Brand = "Dahua", Model = "NVR4104", ProductName = "4-Channel NVR", Specs = "4K, 1 SATA, H.265+", Price = 4500, IsActive = true, CreatedAt = DateTime.UtcNow },
                new Product { Category = "Cabling", Subcategory = "UTP", Brand = "Belden", Model = "CAT6-UTP", ProductName = "CAT6 Cable 305m", Specs = "Pure Copper, Blue", Price = 6000, IsActive = true, CreatedAt = DateTime.UtcNow },
                new Product { Category = "Networking", Subcategory = "Rack", Brand = "Generic", Model = "9U-600", ProductName = "9U Network Rack", Specs = "Wallmount, Glass door", Price = 3500, IsActive = true, CreatedAt = DateTime.UtcNow },
                new Product { Category = "Networking", Subcategory = "Switch", Brand = "Cisco", Model = "CBS250", ProductName = "24-Port Gigabit Switch", Specs = "Managed, L2, Fanless", Price = 8000, IsActive = true, CreatedAt = DateTime.UtcNow }
            );
            context.SaveChanges();
        }

        // Seed users with per-username idempotency (not blanket if (!Any()) which would skip once any user exists)
        if (!context.Users.Any(u => u.Username == "salesteam"))
        {
            var salesPassword = builder.Configuration["SeedUsers:SalesTeamPassword"]!;
            context.Users.Add(new User
            {
                Username = "salesteam",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(salesPassword),
                Role = "quotation",
                CreatedAt = DateTime.UtcNow
            });
            context.SaveChanges();
        }

        if (!context.Users.Any(u => u.Username == "purchasing"))
        {
            var purchasingPassword = builder.Configuration["SeedUsers:PurchasingPassword"]!;
            context.Users.Add(new User
            {
                Username = "purchasing",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(purchasingPassword),
                Role = "purchasing",
                CreatedAt = DateTime.UtcNow
            });
            context.SaveChanges();
        }

        // The approver. A role of its own rather than a second admin: approval
        // authority is not the same as system administration, and the approval
        // notifications target this role by name.
        if (!context.Users.Any(u => u.Username == "admin02"))
        {
            var engineerPassword = builder.Configuration["SeedUsers:EngineerPassword"]!;
            context.Users.Add(new User
            {
                Username = "admin02",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(engineerPassword),
                Role = "engineer",
                CreatedAt = DateTime.UtcNow
            });
            context.SaveChanges();
        }

        if (!context.Users.Any(u => u.Username == "admin"))
        {
            var adminPassword = builder.Configuration["SeedUsers:AdminPassword"]!;
            context.Users.Add(new User
            {
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
                Role = "admin",
                CreatedAt = DateTime.UtcNow
            });
            context.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"An error occurred migrating/seeding the database: {ex.Message}");
    }
}

// Configure middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseAuthentication();
app.UseMiddleware<SessionValidationMiddleware>();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();
