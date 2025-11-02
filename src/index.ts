/**
 * Email Filtering Worker with AI-powered spam detection
 * Intercepts incoming emails, analyzes with Workers AI, and forwards to Fastmail
 */

interface Env {
	AI: Ai;
	FASTMAIL_EMAIL: string;
	FASTMAIL_SMTP_HOST?: string;
	FASTMAIL_SMTP_PORT?: string;
	FASTMAIL_SMTP_USER?: string;
	FASTMAIL_SMTP_PASSWORD?: string;
}

interface EmailAnalysis {
	category: string;
	spamscore: number;
	reasoning: string;
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
		try {
			// Extract email components
			const from = message.from;
			const subject = message.headers.get('subject') || '';
			const to = message.to;

			// Get email body (prioritize plain text, truncate to 2-3k chars)
			let body = '';
			try {
				const rawEmail = await new Response(message.raw).text();
				body = extractBodyFromRaw(rawEmail);
			} catch (e) {
				console.warn('Failed to extract email body:', e);
			}

			// Analyze with Workers AI
			const analysis = await analyzeEmail(env.AI, from, subject, body);

			console.log(`Email analysis: category=${analysis.category}, score=${analysis.spamscore}, from=${from}`);

			// Add custom headers
			const headers = new Headers(message.headers);
			headers.set('X-Wh-Spamscore', analysis.spamscore.toString());
			headers.set('X-Wh-Category', analysis.category);
			headers.set('X-Wh-Reasoning', analysis.reasoning);

			// Forward to Fastmail with modified headers
			await message.setReject(false);
			await message.forward(env.FASTMAIL_EMAIL, headers);
		} catch (error) {
			// Error handling: log error but still forward with safe defaults
			console.error('Error processing email:', error);

			// Forward with default safe values
			const headers = new Headers(message.headers);
			headers.set('X-Wh-Spamscore', '0');
			headers.set('X-Wh-Category', 'unknown');
			headers.set('X-Wh-Error', error instanceof Error ? error.message : 'Unknown error');

			await message.setReject(false);
			await message.forward(env.FASTMAIL_EMAIL, headers);
		}
	},
} satisfies ExportedHandler<Env>;

/**
 * Extract body content from raw email
 * Focuses on first 2-3k characters of plain text content
 */
function extractBodyFromRaw(rawEmail: string): string {
	// Find the body separator (double newline after headers)
	const bodyStartIndex = rawEmail.indexOf('\r\n\r\n');
	if (bodyStartIndex === -1) return '';

	let content = rawEmail.substring(bodyStartIndex + 4);

	// Try to extract plain text part from multipart emails
	const plainTextMatch = content.match(/Content-Type: text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\r?\n--)/i);
	if (plainTextMatch) {
		content = plainTextMatch[1];
	}

	// Remove base64 encoding markers and decode if present
	if (content.includes('Content-Transfer-Encoding: base64')) {
		const base64Match = content.match(/Content-Transfer-Encoding: base64\r?\n\r?\n([\s\S]*?)(?=\r?\n--)/i);
		if (base64Match) {
			try {
				content = atob(base64Match[1].replace(/\s/g, ''));
			} catch (e) {
				// Keep original if decode fails
			}
		}
	}

	// Remove quoted-printable encoding
	content = content.replace(/=\r?\n/g, '');
	content = content.replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

	// Clean up and truncate to 2500 chars
	content = content.trim();
	return content.substring(0, 2500);
}

/**
 * Analyze email with Workers AI using LLaMA model
 */
async function analyzeEmail(ai: Ai, from: string, subject: string, body: string): Promise<EmailAnalysis> {
	const prompt = buildAnalysisPrompt(from, subject, body);

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-awq', {
			messages: [
				{
					role: 'system',
					content: 'You are an email security analyzer. Respond only with valid JSON.',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			temperature: 0.3,
			max_tokens: 500,
		});

		// Extract JSON from response
		const responseText = response.response || JSON.stringify(response);
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);

		if (!jsonMatch) {
			throw new Error('No JSON found in response');
		}

		const analysis = JSON.parse(jsonMatch[0]);

		// Validate and sanitize response
		return {
			category: validateCategory(analysis.category),
			spamscore: validateScore(analysis.spamscore),
			reasoning: String(analysis.reasoning || 'No reasoning provided').substring(0, 500),
		};
	} catch (error) {
		console.error('AI analysis failed:', error);
		// Return safe defaults on error
		return {
			category: 'unknown',
			spamscore: 0,
			reasoning: 'Analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
		};
	}
}

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(from: string, subject: string, body: string): string {
	return `Analyze this email for spam, phishing, and categorization.

EMAIL DETAILS:
From: ${from}
Subject: ${subject}
Body: ${body || '[No body content]'}

CATEGORIES:
- personal: Personal correspondence between individuals
- transactional: Order confirmations, password resets, receipts, account notifications
- newsletter: Legitimate newsletters, company updates, subscriptions
- marketing: Promotional emails, sales pitches, advertisements
- social: Social media notifications, friend requests, comments
- automated: System notifications, monitoring alerts, automated reports
- phishing: Suspected credential harvesting, fake login pages, impersonation
- scam: Get-rich-quick schemes, urgent payment requests, too-good-to-be-true offers
- spam: Generic unwanted bulk email, irrelevant promotions
- suspicious: Unclear intent but potentially malicious characteristics

SPAM SCORE (0-10):
0-2: Clean, legitimate email from known sender or expected source
3-4: Probably legitimate but commercial/promotional in nature
5-6: Suspicious characteristics present (urgency language, unusual requests, mismatched sender)
7-8: Likely phishing/scam (impersonation attempts, credential requests, suspicious links)
9-10: Definite threat (known phishing patterns, malicious intent clear)

RED FLAGS TO CONSIDER:
- Urgency language: "Act now", "Account will be closed", "Verify immediately"
- Mismatched sender: Display name doesn't match email domain
- Suspicious links: Shortened URLs, misspelled domains, IP addresses
- Credential requests: Asking for passwords, SSNs, payment info via email
- Too good to be true: Lottery wins, inheritance, unrealistic offers
- Poor grammar/spelling in otherwise professional context
- Generic greetings: "Dear customer" instead of your name
- Threatening language: Account suspension, legal action, etc.

IMPORTANT GUIDELINES:
- Prioritize LOW FALSE POSITIVES for personal and transactional emails
- Known senders (personal email domains, established companies) should score lower
- Transactional emails from legitimate services should score 0-2 even if automated
- Only mark as phishing/scam/suspicious if clear red flags present
- Marketing emails from legitimate companies should be "marketing" not "spam"

Respond with ONLY a JSON object in this exact format:
{
  "category": "one of the categories above",
  "spamscore": 0-10,
  "reasoning": "brief explanation of your decision (max 200 chars)"
}`;
}

/**
 * Validate category is one of the allowed values
 */
function validateCategory(category: any): string {
	const validCategories = [
		'personal',
		'transactional',
		'newsletter',
		'marketing',
		'social',
		'automated',
		'phishing',
		'scam',
		'spam',
		'suspicious',
		'unknown',
	];

	if (typeof category === 'string' && validCategories.includes(category.toLowerCase())) {
		return category.toLowerCase();
	}

	return 'unknown';
}

/**
 * Validate spam score is between 0-10
 */
function validateScore(score: any): number {
	const numScore = Number(score);
	if (isNaN(numScore)) return 0;
	return Math.max(0, Math.min(10, Math.round(numScore)));
}
