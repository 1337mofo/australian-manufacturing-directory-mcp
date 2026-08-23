# Australian Manufacturing Directory MCP

    Connect AI agents to Australia's national manufacturing supplier directory using the Model Context Protocol (MCP).

    - **Transport:** Streamable HTTP
    - **Endpoint:** https://ausmanufacturingdirectory.com/mcp
    - **Directory:** 118,000+ Australian manufacturers
    - **Developer guide:** https://ausmanufacturingdirectory.com/developers#mcp

    ## Tools

    | Tool | Access | Purpose |
    | --- | --- | --- |
    | search_manufacturers | Public | Search by exact ANZSIC manufacturing category and optional state |
    | get_manufacturer_profile | Public | Retrieve a non-contact supplier profile by ABN |
    | list_categories | Public | List manufacturing categories and supplier counts |
    | get_contact_details | Business | Retrieve phone, email, and street address with an active Business API key |

    Public tools never return phone numbers, email addresses, or street addresses.

    ## Client configuration

    ~~~json
    {
      "mcpServers": {
        "australian-manufacturers": {
          "url": "https://ausmanufacturingdirectory.com/mcp"
        }
      }
    }
    ~~~

    ## Export readiness

    The search tool accepts export_ready for forward compatibility but does not currently use it as a filter. The directory does not yet contain a verified export-readiness field, so the server does not infer or guess this status.

    ## Official MCP Registry

    Registry name: io.github.1337mofo/australian-manufacturing-directory
    