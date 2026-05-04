#!/usr/bin/env bun
// Bedrock reachability probe. Exits 0 if Bedrock answers with anything,
// non-zero otherwise. Keep the token budget tiny (~10 output tokens) —
// this script runs as the first verification step before any weave run.

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const MODEL_ID = process.env.WEAVE_BEDROCK_SMOKE_MODEL ?? "claude-haiku-4-5";

async function main(): Promise<void> {
	const client = new BedrockRuntimeClient({ region: REGION });
	const body = {
		anthropic_version: "bedrock-2023-05-31",
		max_tokens: 10,
		messages: [{ role: "user", content: "Say OK." }],
	};

	const res = await client.send(
		new InvokeModelCommand({
			modelId: MODEL_ID,
			contentType: "application/json",
			accept: "application/json",
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);

	const parsed = JSON.parse(new TextDecoder().decode(res.body));
	const text = parsed?.content?.[0]?.text ?? "(no text)";
	console.log(`bedrock ok — ${MODEL_ID} replied: ${text.trim()}`);
}

main().catch((err: unknown) => {
	console.error("bedrock check failed:", err);
	process.exit(1);
});
