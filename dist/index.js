#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const API_BASE = "https://api-service-wine.vercel.app";
const FREE_LIMIT = 10;
const USAGE_DIR = path.join(os.homedir(), ".structureai");
const USAGE_FILE = path.join(USAGE_DIR, "usage.json");
const SCHEMAS = ["receipt", "invoice", "email", "resume", "contact", "custom"];
function loadUsage() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
        }
    }
    catch {
        // Corrupt file, reset
    }
    return { count: 0 };
}
function saveUsage(usage) {
    if (!fs.existsSync(USAGE_DIR)) {
        fs.mkdirSync(USAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}
function getApiKey(options) {
    return options.apiKey || process.env.STRUCTUREAI_API_KEY;
}
function printUpsell() {
    console.log(chalk_1.default.cyan("\n\u{1F4A1} Get unlimited access: https://api-service-wine.vercel.app ($2 for 100 requests)\n"));
}
async function extract(textInput, options) {
    const apiKey = getApiKey(options);
    // Resolve text: argument, stdin, or file
    let text;
    if (textInput) {
        // Check if it's a file path
        if (fs.existsSync(textInput)) {
            text = fs.readFileSync(textInput, "utf-8");
        }
        else {
            text = textInput;
        }
    }
    else if (!process.stdin.isTTY) {
        // Read from stdin (piped input)
        text = await new Promise((resolve) => {
            let data = "";
            process.stdin.setEncoding("utf-8");
            process.stdin.on("data", (chunk) => (data += chunk));
            process.stdin.on("end", () => resolve(data));
        });
    }
    else {
        console.error(chalk_1.default.red("Error: No text provided. Pass text as an argument, pipe it, or provide a file path."));
        process.exit(1);
    }
    if (!text.trim()) {
        console.error(chalk_1.default.red("Error: Empty text input."));
        process.exit(1);
    }
    // Validate schema
    const schema = options.schema;
    if (!SCHEMAS.includes(schema)) {
        console.error(chalk_1.default.red(`Error: Invalid schema "${schema}". Must be one of: ${SCHEMAS.join(", ")}`));
        process.exit(1);
    }
    // Check free tier
    if (!apiKey) {
        const usage = loadUsage();
        if (usage.count >= FREE_LIMIT) {
            console.error(chalk_1.default.red(`Free tier exhausted (${FREE_LIMIT} uses).`) +
                chalk_1.default.yellow(` Get an API key: https://api-service-wine.vercel.app`));
            process.exit(1);
        }
        usage.count++;
        saveUsage(usage);
        console.log(chalk_1.default.dim(`Free usage: ${usage.count}/${FREE_LIMIT}`));
    }
    // Build request
    const headers = {
        "Content-Type": "application/json",
        "x-source": "cli",
    };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }
    const body = { text, schema };
    if (schema === "custom" && options.customFields) {
        body.custom_fields = options.customFields.split(",").map((f) => f.trim());
    }
    try {
        console.log(chalk_1.default.dim("Extracting..."));
        const response = await fetch(`${API_BASE}/api/extract`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) {
            console.error(chalk_1.default.red(`Error: ${result.error || "Extraction failed"}`));
            process.exit(1);
        }
        console.log(chalk_1.default.green("\nExtracted data:"));
        console.log(JSON.stringify(result.data, null, 2));
        if (result.confidence) {
            console.log(chalk_1.default.dim(`\nConfidence: ${result.confidence}`));
        }
    }
    catch (error) {
        console.error(chalk_1.default.red("Failed to connect to StructureAI API. Check your connection and try again."));
        process.exit(1);
    }
    printUpsell();
}
const program = new commander_1.Command();
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
