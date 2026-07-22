using converge_server.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }
        public DbSet<Product> Products { get; set; }
        public DbSet<PurchaseRequest> PurchaseRequests { get; set; }
        public DbSet<PurchaseRequestItem> PurchaseRequestItems { get; set; }
        public DbSet<BillOfMaterial> BillOfMaterials { get; set; }
        public DbSet<BillOfMaterialItem> BillOfMaterialItems { get; set; }
        public DbSet<PurchaseOrder> PurchaseOrders { get; set; }
        public DbSet<PurchaseOrderItem> PurchaseOrderItems { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Client> Clients { get; set; }
        public DbSet<Quotation> Quotations { get; set; }
        public DbSet<QuotationMaterialItem> QuotationMaterialItems { get; set; }
        public DbSet<QuotationLaborItem> QuotationLaborItems { get; set; }
        public DbSet<AuditLog> AuditLogs { get; set; }
        public DbSet<NotificationRecipient> NotificationRecipients { get; set; }
        public DbSet<NotificationPreference> NotificationPreferences { get; set; }
        public DbSet<DepartmentEmail> DepartmentEmails { get; set; }
        public DbSet<UserNotification> UserNotifications { get; set; }
        public DbSet<GoogleOAuthCredential> GoogleOAuthCredentials { get; set; }
        public DbSet<InventoryTransaction> InventoryTransactions { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username)
                .IsUnique();

            modelBuilder.Entity<AuditLog>()
                .HasIndex(a => new { a.EntityType, a.EntityId });

            modelBuilder.Entity<DepartmentEmail>()
                .HasIndex(d => d.Department)
                .IsUnique();

            modelBuilder.Entity<UserNotification>()
                .HasIndex(n => new { n.TargetRole, n.IsRead });

            modelBuilder.Entity<InventoryTransaction>()
                .HasIndex(t => new { t.ProductId, t.OccurredAt });
        }
    }
}

