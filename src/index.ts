#!/opt/homebrew/bin/node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const websites = 'https://raw.githubusercontent.com/thedaviddias/llms-txt-hub/main/data/websites.json'

/**
 * Type for a website with llms.txt information
 */
interface Website {
  name: string;
  domain: string;
  description: string;
  llmsTxtUrl?: string;
  llmsFullTxtUrl?: string;
  category?: string;
  favicon?: string;
}

/**
 * Type for a linked content from llms.txt
 */
interface LinkedContent {
  url: string;
  content?: string;
  error?: string;
}

/**
 * Type for the check website result
 */
interface WebsiteCheckResult {
  hasLlmsTxt: boolean;
  hasLlmsFullTxt: boolean;
  llmsTxtUrl?: string;
  llmsFullTxtUrl?: string;
  llmsTxtContent?: string;
  llmsFullTxtContent?: string;
  linkedContents?: LinkedContent[];
  error?: string;
}

/**
 * Known websites with llms.txt files
 * Initial data from llms-txt-hub
 */
let knownWebsites: Website[] = [];

/**
 * Cache for website check results
 */
const websiteCheckCache: { [domain: string]: WebsiteCheckResult } = {};

/**
 * Create an MCP server for exploring llms.txt files
 */
const server = new Server(
  {
    name: "LLMS.txt Explorer",
    version,
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * Validate website data
 */
function isValidWebsite(website: unknown): website is Website {
  if (!website || typeof website !== 'object') return false;
  const w = website as Record<string, unknown>;
  return (
    typeof w.name === 'string' &&
    typeof w.domain === 'string' &&
    typeof w.description === 'string' &&
    (w.llmsTxtUrl === undefined || typeof w.llmsTxtUrl === 'string') &&
    (w.llmsFullTxtUrl === undefined || typeof w.llmsFullTxtUrl === 'string') &&
    (w.category === undefined || typeof w.category === 'string') &&
    (w.favicon === undefined || typeof w.favicon === 'string')
  );
}

/**
 * Fetch websites list from GitHub
 */
async function fetchWebsitesList() {
  try {
    console.error('Fetching websites list from GitHub...');
    const response = await fetch(websites);

    if (!response.ok) {
      throw new Error(`Failed to fetch websites list: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid data format: expected an array');
    }

    const validWebsites = data.filter(isValidWebsite);
    console.error(`Fetched ${validWebsites.length} valid websites`);
    knownWebsites = validWebsites;
  } catch (error) {
    console.error('Error fetching websites list:', error);
    // Fallback to default website if fetch fails
    knownWebsites = [{
      name: "Supabase",
      domain: "https://supabase.com",
      description: "Build production-grade applications with Postgres",
      llmsTxtUrl: "https://supabase.com/llms.txt",
      category: "developer-tools"
    }];
  }
}

/**
 * Extract linked URLs from llms.txt content
 */
function extractLinkedUrls(content: string): string[] {
  const urls: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('@')) {
      const url = trimmedLine.slice(1).trim();
      if (url) {
        urls.push(url);
      }
    }
  }

  return urls;
}

/**
 * Check if a website has llms.txt files
 */
async function checkWebsite(domain: string): Promise<WebsiteCheckResult> {
  console.error('Starting website check for:', domain);

  // Return cached result if available
  if (websiteCheckCache[domain]) {
    console.error('Returning cached result for:', domain);
    return websiteCheckCache[domain];
  }

  const result: WebsiteCheckResult = {
    hasLlmsTxt: false,
    hasLlmsFullTxt: false
  };

  // Create an overall timeout for the entire operation
  const globalTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Global timeout exceeded'));
    }, 15000); // 15 second global timeout
  });

  try {
    // Normalize domain and add protocol if missing
    let normalizedDomain = domain;
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      normalizedDomain = `https://${domain}`;
    }
    console.error('Normalized domain:', normalizedDomain);

    // Validate URL format
    let url: URL;
    try {
      url = new URL(normalizedDomain);
    } catch (e) {
      console.error('Invalid URL:', domain);
      throw new Error(`Invalid URL format: ${domain}`);
    }

    // Use the normalized URL
    const baseUrl = url.origin;
    console.error('Base URL:', baseUrl);

    // Helper function to fetch with timeout
    async function fetchWithTimeout(url: string, timeout = 5000) { // Reduced to 5 seconds
      console.error(`Fetching ${url} with ${timeout}ms timeout`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error(`Timeout after ${timeout}ms for ${url}`);
      }, timeout);

      try {
        const startTime = Date.now();
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'llms-txt-explorer/0.1.0'
          }
        });
        const endTime = Date.now();
        console.error(`Fetch completed in ${endTime - startTime}ms for ${url}`);
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Fetch error for ${url}:`, error);
        throw error;
      }
    }

    const checkPromise = (async () => {
      // Check for llms.txt
      try {
        const llmsTxtUrl = `${baseUrl}/llms.txt`;
        console.error('Fetching llms.txt from:', llmsTxtUrl);
        const llmsTxtRes = await fetchWithTimeout(llmsTxtUrl);
        console.error('llms.txt response status:', llmsTxtRes.status);

        if (llmsTxtRes.ok) {
          result.hasLlmsTxt = true;
          result.llmsTxtUrl = llmsTxtUrl;
          const content = await llmsTxtRes.text();
          console.error(`llms.txt content length: ${content.length} bytes`);
          result.llmsTxtContent = content;
          console.error('Successfully fetched llms.txt');

          // Extract and fetch linked contents in parallel with timeout
          const linkedUrls = extractLinkedUrls(content).slice(0, 3); // Reduced to 3 linked contents
          if (linkedUrls.length > 0) {
            console.error(`Found ${linkedUrls.length} linked URLs in llms.txt (limited to 3)`);
            result.linkedContents = [];

            const fetchPromises = linkedUrls.map(async (url) => {
              console.error(`Fetching linked content from: ${url}`);
              try {
                const linkedRes = await fetchWithTimeout(url);
                if (!linkedRes.ok) {
                  throw new Error(`Failed to fetch content: ${linkedRes.status}`);
                }
                const linkedContent = await linkedRes.text();
                console.error(`Linked content length: ${linkedContent.length} bytes`);
                return {
                  url,
                  content: linkedContent
                };
              } catch (error) {
                console.error(`Error fetching linked content from ${url}:`, error);
                return {
                  url,
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            });

            // Wait for all fetches to complete with a 10 second timeout
            const linkedContentTimeout = new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error('Linked content fetch timeout'));
              }, 10000);
            });

            try {
              result.linkedContents = await Promise.race([
                Promise.all(fetchPromises),
                linkedContentTimeout
              ]);
            } catch (error) {
              console.error('Error fetching linked contents:', error);
              result.linkedContents = linkedUrls.map(url => ({
                url,
                error: 'Timeout fetching linked contents'
              }));
            }
          }
        }
      } catch (error: unknown) {
        console.error('Error in main llms.txt fetch:', error);
        if (error instanceof Error) {
          result.error = error.message;
        } else {
          result.error = 'Unknown error fetching llms.txt';
        }
      }

      // Only check llms-full.txt if llms.txt was successful
      if (result.hasLlmsTxt && !result.error) {
        try {
          const llmsFullTxtUrl = `${baseUrl}/llms-full.txt`;
          console.error('Fetching llms-full.txt from:', llmsFullTxtUrl);
          const llmsFullTxtRes = await fetchWithTimeout(llmsFullTxtUrl);
          console.error('llms-full.txt response status:', llmsFullTxtRes.status);

          if (llmsFullTxtRes.ok) {
            result.hasLlmsFullTxt = true;
            result.llmsFullTxtUrl = llmsFullTxtUrl;
            const content = await llmsFullTxtRes.text();
            console.error(`llms-full.txt content length: ${content.length} bytes`);
            result.llmsFullTxtContent = content;
            console.error('Successfully fetched llms-full.txt');
          }
        } catch (error) {
          console.error('Error fetching llms-full.txt:', error);
          // Don't fail the whole operation for llms-full.txt errors
        }
      }

      return result;
    })();

    // Race between the check operation and the global timeout
    const finalResult = await Promise.race([checkPromise, globalTimeout]);

    // Cache successful results only
    if (!finalResult.error) {
      websiteCheckCache[domain] = finalResult;
    }

    console.error('Final result:', JSON.stringify(finalResult, null, 2));
    return finalResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking website:', errorMessage);
    return {
      hasLlmsTxt: false,
      hasLlmsFullTxt: false,
      error: errorMessage
    };
  }
}

/**
 * Handler for listing available websites as resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: knownWebsites.map(site => ({
      uri: `website://${site.domain}`,
      mimeType: "application/json",
      name: site.name,
      description: site.description
    }))
  };
});

/**
 * Handler for reading website information
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const domain = url.hostname;

  const website = knownWebsites.find(site => new URL(site.domain).hostname === domain);
  if (!website) {
    throw new Error(`Website ${domain} not found in known websites`);
  }

  const checkResult = await checkWebsite(website.domain);

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify({ ...website, ...checkResult }, null, 2)
    }]
  };
});

/**
 * Handler that lists available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "check_website",
        description: "Check if a website has llms.txt files",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL of the website to check"
            }
          },
          required: ["url"]
        }
      },
      {
        name: "list_websites",
        description: "List known websites with llms.txt files",
        inputSchema: {
          type: "object",
          properties: {
            filter_llms_txt: {
              type: "boolean",
              description: "Only show websites with llms.txt"
            },
            filter_llms_full_txt: {
              type: "boolean",
              description: "Only show websites with llms-full.txt"
            }
          }
        }
      }
    ]
  };
});

/**
 * Handler for tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error('Received tool request:', request.params.name);

  switch (request.params.name) {
    case "check_website": {
      const url = String(request.params.arguments?.url);
      console.error('Checking website:', url);

      if (!url) {
        console.error('URL is required');
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "URL is required" }, null, 2)
          }]
        };
      }

      try {
        const result = await checkWebsite(url);
        console.error('Tool returning result:', JSON.stringify(result, null, 2));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Tool returning error:', errorMessage);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2)
          }]
        };
      }
    }

    case "list_websites": {
      const filterLlmsTxt = Boolean(request.params.arguments?.filter_llms_txt);
      const filterLlmsFullTxt = Boolean(request.params.arguments?.filter_llms_full_txt);

      let websites = knownWebsites;

      if (filterLlmsTxt) {
        websites = websites.filter(site => site.llmsTxtUrl);
      }
      if (filterLlmsFullTxt) {
        websites = websites.filter(site => site.llmsFullTxtUrl);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(websites, null, 2)
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  // Fetch websites list before starting the server
  await fetchWebsitesList();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
