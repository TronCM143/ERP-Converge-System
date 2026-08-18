using converge_server.Models.DTOs.Client;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/clients")]
    [Authorize(Roles = "quotation,admin")]
    public class ClientController : ControllerBase
    {
        private readonly IClientService _clientService;

        public ClientController(IClientService clientService)
        {
            _clientService = clientService;
        }

        [HttpGet]
        public async Task<IActionResult> GetClients()
        {
            return Ok(await _clientService.GetClientsAsync());
        }

        [HttpGet("{clientId:int}")]
        public async Task<IActionResult> GetClient(int clientId)
        {
            var client = await _clientService.GetClientAsync(clientId);
            return client == null ? NotFound() : Ok(client);
        }

        [HttpPost]
        public async Task<IActionResult> CreateClient([FromBody] CreateClientDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var client = await _clientService.CreateClientAsync(dto);
            return CreatedAtAction(nameof(GetClient), new { clientId = client.Id }, client);
        }

        [HttpPut("{clientId:int}")]
        public async Task<IActionResult> UpdateClient(int clientId, [FromBody] CreateClientDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var client = await _clientService.UpdateClientAsync(clientId, dto);
            return client == null ? NotFound() : Ok(client);
        }

        [HttpPut("reorder")]
        public async Task<IActionResult> ReorderClients([FromBody] ReorderClientsDto dto)
        {
            if (!Enum.TryParse<ClientStage>(dto.Stage, ignoreCase: true, out var parsedStage)
                || !Enum.IsDefined(typeof(ClientStage), parsedStage))
            {
                return BadRequest(new { error = $"Unknown stage '{dto.Stage}'." });
            }

            if (dto.OrderedClientIds.Count == 0)
            {
                return BadRequest(new { error = "OrderedClientIds must not be empty." });
            }

            var (success, wonSheetSaved, decidedQuotationNumber, decidedAmount) =
                await _clientService.ReorderClientsAsync(parsedStage, dto.OrderedClientIds, User.Identity?.Name ?? "system", dto.WonNotifyEmails, dto.LossReason);

            // The decided quotation is reported under the name of what actually
            // happened to it, so the board can say what was recorded rather than
            // leaving the user to wonder why the sales figure moved (or didn't).
            // A drag settles at most one quotation, so only one pair is ever set.
            var won = parsedStage == ClientStage.Won;
            var lost = parsedStage == ClientStage.Lost;
            return success
                ? Ok(new
                {
                    wonSheetSaved,
                    approvedQuotationNumber = won ? decidedQuotationNumber : null,
                    approvedAmount = won ? decidedAmount : null,
                    rejectedQuotationNumber = lost ? decidedQuotationNumber : null,
                    rejectedAmount = lost ? decidedAmount : null
                })
                : NotFound();
        }

        // Kanban card colour. Its own endpoint rather than part of the full
        // update: picking a colour on the board shouldn't require sending (and
        // risk overwriting) the client's name, address and notes.
        [HttpPatch("{clientId:int}/accent")]
        public async Task<IActionResult> UpdateAccent(int clientId, [FromBody] UpdateClientAccentDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var client = await _clientService.UpdateClientAccentAsync(clientId, dto.AccentColor);
            return client == null ? NotFound() : Ok(client);
        }

        [HttpPatch("{clientId:int}/stage")]
        public async Task<IActionResult> UpdateStage(int clientId, [FromBody] UpdateClientStageDto dto)
        {
            if (!Enum.TryParse<ClientStage>(dto.Stage, ignoreCase: true, out var parsedStage)
                || !Enum.IsDefined(typeof(ClientStage), parsedStage))
            {
                return BadRequest(new { error = $"Unknown stage '{dto.Stage}'." });
            }

            var (client, wonSheetSaved) = await _clientService.UpdateClientStageAsync(clientId, parsedStage);
            return client == null ? NotFound() : Ok(new { client, wonSheetSaved });
        }
    }
}
