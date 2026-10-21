import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

type PantryItem = { name: string; quantity: number; unit: string; expiresInDays?: number };
type ShoppingItem = { id: string; name: string; quantity: number; unit: string; checked: boolean };

// Demo household data. Replace this in production with an authenticated household store.
const pantry: PantryItem[] = [
  { name: 'chickpeas', quantity: 2, unit: 'cans' },
  { name: 'spinach', quantity: 1, unit: 'bag', expiresInDays: 2 },
  { name: 'coconut milk', quantity: 1, unit: 'can' },
  { name: 'basmati rice', quantity: 2, unit: 'cups' },
  { name: 'tomatoes', quantity: 3, unit: 'whole', expiresInDays: 3 },
  { name: 'eggs', quantity: 6, unit: 'whole' },
];

const recipes = [
  { name: 'Coconut chickpea curry', minutes: 25, tags: ['vegetarian', 'dairy-free'], ingredients: ['chickpeas', 'coconut milk', 'tomatoes', 'spinach', 'basmati rice'], steps: ['Simmer tomatoes with curry spices for 5 minutes.', 'Stir in chickpeas and coconut milk; simmer for 12 minutes.', 'Fold in spinach until wilted and serve over rice.'] },
  { name: 'Tomato and spinach egg rice', minutes: 18, tags: ['vegetarian', 'quick'], ingredients: ['eggs', 'spinach', 'tomatoes', 'basmati rice'], steps: ['Warm cooked rice in a pan.', 'Add chopped tomatoes and spinach until softened.', 'Top with a fried egg and season to taste.'] },
  { name: 'Chickpea tomato bowls', minutes: 20, tags: ['vegan', 'dairy-free'], ingredients: ['chickpeas', 'tomatoes', 'spinach', 'basmati rice'], steps: ['Roast or pan-sear chickpeas with spices.', 'Cook tomatoes until jammy, then wilt in spinach.', 'Serve everything over rice.'] },
];

const shoppingList: ShoppingItem[] = [
  { id: randomUUID(), name: 'lemons', quantity: 2, unit: 'whole', checked: false },
  { id: randomUUID(), name: 'plain yogurt', quantity: 1, unit: 'tub', checked: false },
];

function createServer() {
  const server = new McpServer({ name: 'pantry-pal', version: '1.0.0' });

  server.registerResource(
    'pantry',
    'pantry://household/current',
    { title: 'Current pantry', description: 'Ingredients currently available in the demo household pantry.', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ items: pantry }) }] }),
  );

  server.registerTool(
    'get_pantry',
    { title: 'Check pantry', description: 'See available ingredients and which items should be used soon.', inputSchema: {} },
    async () => ({
      content: [{ type: 'text', text: `You have ${pantry.map((item) => `${item.quantity} ${item.unit} ${item.name}${item.expiresInDays !== undefined ? ` (use within ${item.expiresInDays} days)` : ''}`).join(', ')}.` }],
      structuredContent: { items: pantry },
    }),
  );

  server.registerTool(
    'find_meals',
    {
      title: 'Find meals',
      description: 'Find practical recipes that use pantry ingredients. Honors dietary preferences and a time limit.',
      inputSchema: {
        dietaryPreferences: z.array(z.string()).default([]).describe('Optional constraints such as vegan, vegetarian, or dairy-free.'),
        maxMinutes: z.number().int().min(5).max(180).default(45).describe('Maximum active preparation time in minutes.'),
      },
    },
    async ({ dietaryPreferences, maxMinutes }) => {
      const available = new Set(pantry.map((item) => item.name));
      const matches = recipes
        .filter((recipe) => recipe.minutes <= maxMinutes && dietaryPreferences.every((tag) => recipe.tags.includes(tag.toLowerCase())))
        .map((recipe) => ({ ...recipe, uses: recipe.ingredients.filter((name) => available.has(name)), missing: recipe.ingredients.filter((name) => !available.has(name)) }))
        .sort((a, b) => b.uses.length - a.uses.length);
      return {
        content: [{ type: 'text', text: matches.length ? `I found ${matches.length} meal ideas. The best pantry match is ${matches[0].name}, using ${matches[0].uses.length} ingredients you already have${matches[0].missing.length ? `; you would need ${matches[0].missing.join(', ')}` : ''}.` : 'No meals matched those preferences and time limit. Try relaxing one constraint.' }],
        structuredContent: { meals: matches },
      };
    },
  );

  server.registerTool(
    'add_to_shopping_list',
    {
      title: 'Add groceries',
      description: 'Add a grocery item to the household shopping list. Ask for confirmation before placing any order.',
      inputSchema: {
        name: z.string().trim().min(1).max(80).describe('Grocery item name.'),
        quantity: z.number().positive().max(100).default(1),
        unit: z.string().trim().min(1).max(24).default('item'),
      },
    },
    async ({ name, quantity, unit }) => {
      const normalized = name.toLowerCase();
      const existing = shoppingList.find((item) => item.name.toLowerCase() === normalized && item.unit === unit && !item.checked);
      const item = existing
        ? Object.assign(existing, { quantity: existing.quantity + quantity })
        : { id: randomUUID(), name, quantity, unit, checked: false };
      if (!existing) shoppingList.push(item);
      return {
        content: [{ type: 'text', text: `Added ${item.quantity} ${item.unit} ${item.name} to your shopping list. No order was placed.` }],
        structuredContent: { item, shoppingList },
      };
    },
  );

  server.registerTool(
    'get_shopping_list',
    { title: 'Read shopping list', description: 'Read the current household shopping list.', inputSchema: {} },
    async () => ({ content: [{ type: 'text', text: shoppingList.length ? shoppingList.filter((item) => !item.checked).map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(', ') : 'Your shopping list is empty.' }], structuredContent: { items: shoppingList } }),
  );

  return server;
}

const bindHost = process.env.HOST ?? '0.0.0.0';
const app = createMcpExpressApp({ host: bindHost });
const transports = new Map<string, StreamableHTTPServerTransport>();

// Optional shared bearer token for a private demo endpoint. Use OAuth for a real Alexa+ integration.
app.use('/mcp', (req, res, next) => {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return next();
  const supplied = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    res.set('WWW-Authenticate', 'Bearer').status(401).send('Unauthorized');
    return;
  }
  next();
});

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport | undefined;

  if (sessionId) {
    transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown MCP session.' }, id: null });
      return;
    }
  } else if (isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) transports.delete(transport.sessionId);
    };
    const server = createServer();
    await server.connect(transport);
  } else {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'A new MCP session must start with initialize.' }, id: null });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST, DELETE').send('MCP Streamable HTTP endpoint.'));
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown MCP session.' }, id: null });
    return;
  }
  await transport.handleRequest(req, res);
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'pantry-pal', transport: 'MCP Streamable HTTP' }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, bindHost, () => console.log(`PantryPal MCP server listening at http://${bindHost}:${port}/mcp`));
