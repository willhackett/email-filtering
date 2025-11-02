/**
 * Email parser for .eml files
 */

import { simpleParser, ParsedMail } from 'mailparser';
import { promises as fs } from 'fs';
import * as path from 'path';
import { EmailMetadata } from './types.js';

/**
 * Parse a single .eml file
 */
export async function parseEmlFile(filepath: string): Promise<EmailMetadata> {
	const content = await fs.readFile(filepath);
	const parsed: ParsedMail = await simpleParser(content);

	// Extract plain text body, prioritize text over html
	let body = '';
	if (parsed.text) {
		body = parsed.text;
	} else if (parsed.html) {
		// Strip HTML tags for basic text extraction
		body = parsed.html.toString().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
	}

	// Truncate to 2500 chars like the worker does
	body = body.trim().substring(0, 2500);

	// Extract Fastmail spam score from X-Spam-Score header
	let fastmailSpamScore: number | undefined;
	const spamScoreHeader = parsed.headers.get('x-spam-score');
	if (spamScoreHeader) {
		const score = parseFloat(spamScoreHeader.toString());
		if (!isNaN(score)) {
			fastmailSpamScore = score;
		}
	}

	return {
		filename: path.basename(filepath),
		from: parsed.from?.text || parsed.from?.value?.[0]?.address || 'unknown',
		subject: parsed.subject || '',
		body,
		date: parsed.date || undefined,
		fastmailSpamScore,
	};
}

/**
 * Load all .eml files from a directory
 */
export async function loadEmlFiles(directory: string): Promise<EmailMetadata[]> {
	try {
		const files = await fs.readdir(directory);
		const emlFiles = files.filter(f => f.toLowerCase().endsWith('.eml'));

		console.log(`Found ${emlFiles.length} .eml files in ${directory}`);

		const emails: EmailMetadata[] = [];
		for (const file of emlFiles) {
			try {
				const email = await parseEmlFile(path.join(directory, file));
				emails.push(email);
			} catch (error) {
				console.error(`Failed to parse ${file}:`, error);
			}
		}

		return emails;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.error(`Directory not found: ${directory}`);
			console.log('Please create the directory and add .eml files');
			return [];
		}
		throw error;
	}
}
