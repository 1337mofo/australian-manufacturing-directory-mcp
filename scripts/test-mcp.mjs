import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const expectedTools = [
  "search_manufacturers",
  "get_manufacturer_profile",
  "list_categories",
  "get_contact_details",
];
const registryGate = process.argv.includes("--registry-gate");
const configuredUrls = registryGate
  ? process.env.MCP_BASE_URLS
  : process.env.MCP_BASE_URL || "http://127.0.0.1:5000/mcp";

if (!configuredUrls) {
  throw new Error("MCP_BASE_URLS must list the production endpoints for --registry-gate");
}

const baseUrls = [...new Set(
  configuredUrls
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
)];

if (baseUrls.length === 0) {
  throw new Error("No MCP endpoint URLs were provided");
}

function errorDetails(error) {
  const messages = [];
  let current = error;
  while (current) {
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.join(" -> ");
}

async function getDiscoveryDocument(origin, path, expectedContentType) {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith(expectedContentType)) {
    throw new Error(`${path} returned unexpected content type: ${contentType}`);
  }
  return response.json();
}

async function connectAndListTools(baseUrl) {
  let phase = "URL validation";
  let client;

  try {
    const endpoint = new URL(baseUrl);
    phase = "SDK initialization";
    client = new Client(
      { name: "amd-mcp-smoke-test", version: "1.0.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(endpoint);
    await client.connect(transport, { timeout: 30_000 });

    phase = "tool discovery";
    const listed = await client.listTools({}, { timeout: 30_000 });
    const names = listed.tools.map((tool) => tool.name);
    const missing = expectedTools.filter((expected) => !names.includes(expected));
    if (missing.length > 0) {
      throw new Error(`missing required tools: ${missing.join(", ")}`);
    }

    return { client, names };
  } catch (error) {
    if (client) {
      await client.close().catch(() => {});
    }
    throw new Error(
      `${baseUrl} failed during ${phase}: ${errorDetails(error)}`,
      { cause: error },
    );
  }
}

async function runFunctionalSmokeTest(baseUrl, client, names) {
  const origin = new URL(baseUrl).origin;
  const catalog = await getDiscoveryDocument(
    origin,
    "/.well-known/ai-catalog.json",
    "application/ai-catalog+json",
  );
  const catalogEntry = catalog.entries?.find(
    (entry) => entry.type === "application/mcp-server-card+json",
  );
  if (
    catalog.specVersion !== "1.0" ||
    catalogEntry?.url !== "https://mcp.ausmanufacturingdirectory.com/mcp/server-card"
  ) {
    throw new Error("AI Catalog does not advertise the canonical MCP Server Card");
  }

  const serverCard = await getDiscoveryDocument(
    origin,
    "/mcp/server-card",
    "application/mcp-server-card+json",
  );
  if (
    serverCard.name !== "io.github.1337mofo/australian-manufacturing-directory" ||
    !serverCard.remotes?.some(
      (remote) =>
        remote.type === "streamable-http" &&
        remote.url === "https://mcp.ausmanufacturingdirectory.com/mcp",
    )
  ) {
    throw new Error("MCP Server Card does not advertise the canonical endpoint");
  }

  const search = await client.callTool({
    name: "search_manufacturers",
    arguments: { category: "Adhesive Manufacturing", state: "VIC", export_ready: true, limit: 2 },
  });
  if (search.isError) throw new Error("Search tool returned an error");
  const manufacturers = JSON.parse(search.content[0].text);
  if (!Array.isArray(manufacturers) || manufacturers.length === 0) throw new Error("Search returned no manufacturers");
  if ("phone" in manufacturers[0] || "email" in manufacturers[0]) throw new Error("Public search leaked contact details");

  const profile = await client.callTool({
    name: "get_manufacturer_profile",
    arguments: { abn: manufacturers[0].abn },
  });
  if (profile.isError) throw new Error("Profile tool returned an error");
  const profileData = JSON.parse(profile.content[0].text);
  if ("phone" in profileData || "email" in profileData || profileData.locations.some((location) => "address_line_1" in location)) {
    throw new Error("Public profile leaked contact details");
  }

  const categoriesResult = await client.callTool({
    name: "list_categories",
    arguments: {},
  });
  const categories = JSON.parse(categoriesResult.content[0].text);
  if (!Array.isArray(categories) || categories.length === 0 || !("count" in categories[0])) {
    throw new Error("Category tool returned an invalid payload");
  }

  const invalidAbn = await client.callTool({
    name: "get_manufacturer_profile",
    arguments: { abn: "not-an-abn" },
  });
  if (!invalidAbn.isError) throw new Error("Malformed ABN was not rejected");

  const unauthorized = await client.callTool({
    name: "get_contact_details",
    arguments: { abn: manufacturers[0].abn, api_key: "amd_invalid_key" },
  });
  const authError = JSON.parse(unauthorized.content[0].text);
  if (!unauthorized.isError || authError.status !== 401 || !authError.subscribe_url) {
    throw new Error("Paid contact tool did not return its structured 401 response");
  }

  console.log(`MCP smoke test passed: ${names.join(", ")}`);
}

for (const baseUrl of baseUrls) {
  const { client, names } = await connectAndListTools(baseUrl);
  try {
    if (registryGate) {
      console.log(`MCP Registry gate passed for ${baseUrl}: ${names.join(", ")}`);
    } else {
      await runFunctionalSmokeTest(baseUrl, client, names);
    }
  } finally {
    await client.close();
  }
}

if (registryGate) {
  console.log(`Verified ${baseUrls.length} production MCP endpoint(s) with the official SDK`);
}
