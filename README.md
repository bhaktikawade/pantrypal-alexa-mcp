# PantryPal for Alexa+

PantryPal is a self-hosted MCP integration for a conversational kitchen assistant. A customer can ask Alexa+ what is in the pantry, request meal ideas that use ingredients on hand, and add missing groceries to a shopping list. The server supplies structured household data and actions to the assistant; it does not contain its own language model.

## Hackathon track

- **Primary track:** Alexa+
- **Implementation:** Self-hosted MCP server over Streamable HTTP
- **MCP SDK:** Official TypeScript SDK v1 (`@modelcontextprotocol/sdk`), which implements the MCP 2025-11-25 specification.
- **Demo scenario:** “What can I make tonight with chickpeas and spinach? Keep it vegetarian and under 30 minutes. Add lemons to my list.”

The bundled household and recipes are demo fixtures held in process memory. This makes the experience easy to run and review; it is not a production pantry database or a live grocery integration.

## Tools exposed

| Tool | What it does |
| --- | --- |
| `get_pantry` | Lists pantry contents and items nearing their use-by date. |
| `find_meals` | Filters sample recipes by dietary preferences and time, then ranks them by pantry match. |
| `add_to_shopping_list` | Adds a grocery item or increases its quantity. It never places an order. |
| `get_shopping_list` | Reads the current list. |

The server also publishes the `pantry://household/current` resource. Tool input schemas constrain quantities, strings, and prep time. An explicit confirmation and a real merchant integration would be needed before any purchase action is added.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

The MCP endpoint is `http://localhost:3000/mcp`; the health check is `http://localhost:3000/health`. Use an MCP inspector/client configured for Streamable HTTP to connect and invoke the tools. The server negotiates the protocol version during MCP initialization; its SDK supports the required `2025-11-25` revision.

For a remote deployment, terminate TLS at a trusted reverse proxy, restrict network access, and set a strong `MCP_BEARER_TOKEN` for a private demo. A shared bearer token is only a demo gate: a real Alexa+ integration should use the platform’s approved OAuth authorization flow, per-user identity, and access controls. Set `HOST` to the interface your hosting platform requires (typically `0.0.0.0` in a container).

## Data and extension points

- Replace the in-memory pantry and list arrays in `src/server.ts` with per-household storage.
- Associate each request with a verified customer identity before reading or changing household data.
- Connect recipes to a licensed catalog and make allergens, substitutions, and nutrition data explicit.
- Connect a retailer only after the customer reviews the list and confirms the exact cart and price.
- Add persistence, tenancy isolation, rate limits, audit events, OAuth, and deployment monitoring before handling real customer data.

## Product feedback for the hackathon

The MCP boundary is a useful fit for brand experiences: the model can choose a small, described set of actions while the brand keeps its data and business rules behind its own server. The main integration questions to validate with Alexa+ Preview are the supported OAuth onboarding flow, how the service receives stable user/household identity, which tool annotations or confirmation semantics Alexa+ honors for shopping actions, and how structured results are rendered in voice and screen experiences. The local demo does not claim Alexa+ Preview access or a live Alexa+ connection.

## License

MIT; see [LICENSE](LICENSE).
