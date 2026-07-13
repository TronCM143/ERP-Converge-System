using System.Net.Http.Headers;
using System.Text;
using converge_server.Data;
using converge_server.Hubs;
using converge_server.Middleware;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// Controllers
builder.Services.AddControllers();

// SignalR (real-time notifications, e.g. new PR popup on the Purchasing side)
builder.Services.AddSignalR();

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"]!;
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

builder.Services.AddAuthentication(options =>
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

builder.Services.AddAuthorization();

// Application services
builder.Services.AddScoped<converge_server.Services.Interfaces.IPurchaseRequestService, converge_server.Services.PurchaseRequestService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IBillOfMaterialService, converge_server.Services.BillOfMaterial.BillOfMaterialService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IPurchaseOrderService, converge_server.Services.PurchaseOrders.PurchaseOrderService>();
builder.Services.AddScoped<IAuthService, converge_server.Services.Auth.AuthService>();
builder.Services.AddScoped<IQuotationService, converge_server.Services.Quotations.QuotationService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IQuotationGenerationService, converge_server.Services.Ai.GroqQuotationGenerationService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IClientService, converge_server.Services.Clients.ClientService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IAuditService, converge_server.Services.Audit.AuditService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.INotificationRecipientService, converge_server.Services.Notifications.NotificationRecipientService>();
builder.Services.AddScoped<converge_server.Services.Interfaces.IEmailSender, converge_server.Services.Notifications.SmtpEmailSender>();
builder.Services.AddScoped<converge_server.Services.Interfaces.ISmsSender, converge_server.Services.Notifications.M360SmsSender>();
builder.Services.AddScoped<converge_server.Services.Interfaces.INotificationDispatchService, converge_server.Services.Notifications.NotificationDispatchService>();

// Groq (AI quotation generation from a natural-language prompt)
builder.Services.AddHttpClient("Groq", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Groq:BaseUrl"]!);
    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", builder.Configuration["Groq:ApiKey"]);
});

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

app.UseAuthentication();
app.UseMiddleware<SessionValidationMiddleware>();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();
