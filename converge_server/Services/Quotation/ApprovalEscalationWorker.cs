using converge_server.Services.Interfaces;

namespace converge_server.Services.Quotations
{
    /* Chases approval requests nobody has decided.

       A background sweep rather than a timer set when each request is submitted:
       a timer dies with the process, and the requests that most need chasing are
       exactly the ones that survived a restart. The sweep reads the state of the
       table, so it is correct however long the server was down.

       Runs hourly because the setting is expressed in hours - checking more
       often could not detect anything sooner, and the sweep does nothing at all
       when the escalation setting is unset, which is the default. */
    public class ApprovalEscalationWorker : BackgroundService
    {
        private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(1);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<ApprovalEscalationWorker> _logger;

        public ApprovalEscalationWorker(IServiceScopeFactory scopeFactory, ILogger<ApprovalEscalationWorker> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // A short delay first so startup is not competing with a database
            // sweep on a cold connection pool.
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var approvals = scope.ServiceProvider.GetRequiredService<IQuoteApprovalService>();
                    await approvals.EscalateStalePendingAsync();
                }
                catch (Exception ex)
                {
                    /* A failed sweep must never take the worker down: the next
                       one an hour later sees the same rows and tries again. */
                    _logger.LogError(ex, "Approval escalation sweep failed");
                }

                try
                {
                    await Task.Delay(SweepInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }
    }
}
