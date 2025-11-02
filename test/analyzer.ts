/**
 * Email analysis using Ollama (same logic as the worker)
 */

import { Ollama } from 'ollama';
import { EmailAnalysis, EmailCategory } from './types.js';

/**
 * Build the analysis prompt (same as worker)
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
function validateCategory(category: any): EmailCategory {
	const validCategories: EmailCategory[] = [
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

	if (typeof category === 'string' && validCategories.includes(category.toLowerCase() as EmailCategory)) {
		return category.toLowerCase() as EmailCategory;
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

/**
 * Analyze email with Ollama using LLaMA model
 */
export async function analyzeEmail(
	ollama: Ollama,
	from: string,
	subject: string,
	body: string,
	model: string = 'llama3.1:8b'
): Promise<EmailAnalysis> {
	const prompt = buildAnalysisPrompt(from, subject, body);

	try {
		const response = await ollama.chat({
			model,
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
			options: {
				temperature: 0.3,
				num_predict: 500,
			},
			format: 'json',
		});

		// Parse JSON response
		const content = response.message.content;
		const analysis = JSON.parse(content);

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
