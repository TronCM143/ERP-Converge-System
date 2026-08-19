using converge_server.Services.Interfaces;

// Plural, like ClientService beside it: a namespace named exactly "Client"
// shadows the Client entity for every sibling file (CS0118).
namespace converge_server.Services.Clients
{
    /* Thrown when a client card is moved into Proposal while its quotation still
       needs engineer sign-off. Carries the gate so the API can tell the board
       WHICH quotation and why - the board needs that to offer "Send for
       Approval" rather than a bare refusal. */
    public class ApprovalRequiredException : InvalidOperationException
    {
        public ApprovalGate Gate { get; }

        public ApprovalRequiredException(ApprovalGate gate)
            : base(gate.Reason switch
            {
                "awaiting-approval" => "This quotation is awaiting approval and cannot move to Proposal yet.",
                "rejected" => "This quotation was rejected. Revise it and resubmit for approval.",
                _ => "This quotation requires approval before it can be transferred to Proposal."
            })
        {
            Gate = gate;
        }
    }
}
