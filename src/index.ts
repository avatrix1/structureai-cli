#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const API_BASE = "https://api-service-wine.vercel.app";
const FREE_LIMIT = 10;
const USAGE_DIR = path.join(os.homedir(), ".structureai");
const USAGE_FILE = path.join(USAGE_DIR, "usage.json");

const SCHEMAS = ["receipt", "invoice", "email", "resume", "contact", "custom"] as const;

interface UsageData {
  count: number;
}

function loadUsage(): UsageData {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    }
  } catch {
    // Corrupt file, reset
  }
  return { count: 0 };
}

function saveUsage(usage: UsageData): void {
  if (!fs.existsSync(USAGE_DIR)) {
    fs.mkdirSync(USAGE_DIR, { recursive: true });
  }
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function getApiKey(options: { apiKey?: string }): string | undefined {
  return options.apiKey || process.env.STRUCTUREAI_API_KEY;
}

function printUpsell(): void {
  console.log(
    chalk.cyan(
      "\n\u{1F4A1} Get unlimited access: https://api-service-wine.vercel.app ($2 for 100 requests)\n"
    )
  );
}

async function extract(
  textInput: string | undefined,
  options: { schema: string; apiKey?: string; customFields?: string }
): Promise<void> {
  const apiKey = getApiKey(options);

  // Resolve text: argument, stdin, or file
  let text: string;
  if (textInput) {
    // Check if it's a file path
    if (fs.existsSync(textInput)) {
      text = fs.readFileSync(textInput, "utf-8");
    } else {
      text = textInput;
    }
  } else if (!process.stdin.isTTY) {
    // Read from stdin (piped input)
    text = await new Promise<string>((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    });
  } else {
    console.error(chalk.red("Error: No text provided. Pass text as an argument, pipe it, or provide a file path."));
    process.exit(1);
  }

  if (!text.trim()) {
    console.error(chalk.red("Error: Empty text input."));
    process.exit(1);
  }

  // Validate schema
  const schema = options.schema;
  if (!SCHEMAS.includes(schema as typeof SCHEMAS[number])) {
    console.error(chalk.red(`Error: Invalid schema "${schema}". Must be one of: ${SCHEMAS.join(", ")}`));
    process.exit(1);
  }

  // Check free tier
  if (!apiKey) {
    const usage = loadUsage();
    if (usage.count >= FREE_LIMIT) {
      console.error(
        chalk.red(`Free tier exhausted (${FREE_LIMIT} uses).`) +
        chalk.yellow(` Get an API key: https://api-service-wine.vercel.app`)
      );
      process.exit(1);
    }
    usage.count++;
    saveUsage(usage);
    console.log(chalk.dim(`Free usage: ${usage.count}/${FREE_LIMIT}`));
  }

  // Build request
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-source": "cli",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const body: Record<string, unknown> = { text, schema };
  if (schema === "custom" && options.customFields) {
    body.custom_fields = options.customFields.split(",").map((f) => f.trim());
  }

  try {
    console.log(chalk.dim("Extracting..."));
    const response = await fetch(`${API_BASE}/api/extract`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(chalk.red(`Error: ${result.error || "Extraction failed"}`));
      process.exit(1);
    }

    console.log(chalk.green("\nExtracted data:"));
    console.log(JSON.stringify(result.data, null, 2));

    if (result.confidence) {
      console.log(chalk.dim(`\nConfidence: ${result.confidence}`));
    }
  } catch (error) {
    console.error(chalk.red("Failed to connect to StructureAI API. Check your connection and try again."));
    process.exit(1);
  }

  printUpsell();
}

const program = new Command();

program
  .name("structureai")
  .description("Extract structured JSON from messy text using AI")
  .version("1.0.0");

program
  .command("extract")
  .description("Extract structured data from text")
  .argument("[text]", "Text to extract from (or pipe via stdin, or pass a file path)")
  .requiredOption("-s, --schema <type>", `Schema type: ${SCHEMAS.join(", ")}`)
  .option("-k, --api-key <key>", "API key (or set STRUCTUREAI_API_KEY env var)")
  .option("-f, --custom-fields <fields>", "Comma-separated field names for custom schema")
  .action(extract);

program.parse();
