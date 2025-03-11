# MCP LLMS.txt Explorer

<a href="https://glama.ai/mcp/servers/lhyj3pva0z">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/lhyj3pva0z/badge" alt="LLMS.txt Explorer MCP server" />
</a>

[![smithery badge](https://smithery.ai/badge/@thedaviddias/mcp-llms-txt-explorer)](https://smithery.ai/server/@thedaviddias/mcp-llms-txt-explorer)

A Model Context Protocol server for exploring websites with llms.txt files. This server helps you discover and analyze websites that implement the llms.txt standard.

## Features

### Resources
- Check websites for llms.txt and llms-full.txt files
- Parse and validate llms.txt file contents
- Access structured data about compliant websites

### Tools
- `check_website` - Check if a website has llms.txt files
  - Takes domain URL as input
  - Returns file locations and validation status
- `list_websites` - List known websites with llms.txt files
  - Returns structured data about compliant websites
  - Supports filtering by file type (llms.txt/llms-full.txt)

## Development

Install dependencies:
```bash
pnpm install
```

Build the server:
```bash
pnpm run build
```

For development with auto-rebuild:
```bash
pnpm run watch
```

## Installation

### Installing via Smithery

To install mcp-llms-txt-explorer for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@thedaviddias/mcp-llms-txt-explorer):

```bash
npx -y @smithery/cli install @thedaviddias/mcp-llms-txt-explorer --client claude
```

### Installing Manually
To use this server:

```bash
# Clone the repository
git clone https://github.com/thedaviddias/mcp-llms-txt-explorer.git
cd mcp-llms-txt-explorer

# Install dependencies
pnpm install

# Build the server
pnpm run build
```

### Configuration with Claude Desktop

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "llms-txt-explorer": {
      "command": "/path/to/llms-txt-explorer/build/index.js"
    }
  }
}
```

For npx usage, you can use:
```json
{
  "mcpServers": {
    "llms-txt-explorer": {
      "command": "npx",
      "args": ["-y", "@thedaviddias/mcp-llms-txt-explorer"]
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
pnpm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

This project is licensed under the MIT License—see the LICENSE file for details.