#!/usr/bin/env node
/**
 * Interactive labeling tool for creating ground truth data
 */

import * as readline from 'readline';
import { loadEmlFiles } from './email-parser.js';
import { saveGroundTruth, loadGroundTruth } from './statistics.js';
import { EmailCategory, GroundTruth } from './types.js';

const TEST_EMAIL_DIR = '__test_emails__';
const GROUND_TRUTH_FILE = 'test/ground-truth.json';

const CATEGORIES: EmailCategory[] = [
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
];

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function question(prompt: string): Promise<string> {
	return new Promise(resolve => {
		rl.question(prompt, resolve);
	});
}

function printEmail(filename: string, from: string, subject: string, body: string) {
	console.log('\n' + '='.repeat(80));
	console.log(`File: ${filename}`);
	console.log('='.repeat(80));
	console.log(`From: ${from}`);
	console.log(`Subject: ${subject}`);
	console.log('-'.repeat(80));
	console.log(body.substring(0, 500) + (body.length > 500 ? '...' : ''));
	console.log('='.repeat(80));
}

function printCategories() {
	console.log('\nCategories:');
	CATEGORIES.forEach((cat, idx) => {
		console.log(`  ${idx + 1}. ${cat}`);
	});
	console.log('  s. Skip this email');
	console.log('  q. Quit and save');
}

async function main() {
	console.log('Email Labeling Tool');
	console.log('===================\n');
	console.log('This tool helps you create ground truth data for testing.\n');

	// Load emails
	const emails = await loadEmlFiles(TEST_EMAIL_DIR);
	if (emails.length === 0) {
		console.error(`No emails found in ${TEST_EMAIL_DIR}`);
		process.exit(1);
	}

	// Load existing ground truth
	let groundTruth = new Map<string, GroundTruth>();
	try {
		groundTruth = await loadGroundTruth(GROUND_TRUTH_FILE);
	} catch {
		console.log('Starting fresh ground truth file\n');
	}

	console.log(`Total emails: ${emails.length}`);
	console.log(`Already labeled: ${groundTruth.size}`);
	console.log(`Remaining: ${emails.length - groundTruth.size}\n`);

	// Filter out already labeled emails
	const unlabeled = emails.filter(e => !groundTruth.has(e.filename));

	if (unlabeled.length === 0) {
		console.log('All emails are already labeled!');
		rl.close();
		return;
	}

	console.log('Starting labeling session...\n');
	console.log('Press Ctrl+C at any time to quit and save progress\n');

	let labeled = 0;

	for (const email of unlabeled) {
		printEmail(email.filename, email.from, email.subject, email.body);
		printCategories();

		let validInput = false;
		let category: EmailCategory | null = null;

		while (!validInput) {
			const answer = await question('\nSelect category (1-10, s, q): ');

			if (answer.toLowerCase() === 'q') {
				console.log('\nSaving and quitting...');
				await saveGroundTruth(groundTruth, GROUND_TRUTH_FILE);
				rl.close();
				return;
			}

			if (answer.toLowerCase() === 's') {
				console.log('Skipped.');
				validInput = true;
				break;
			}

			const num = parseInt(answer);
			if (num >= 1 && num <= CATEGORIES.length) {
				category = CATEGORIES[num - 1];
				validInput = true;
			} else {
				console.log('Invalid input. Please try again.');
			}
		}

		if (!category) continue;

		// Optional notes
		const notes = await question('Notes (optional, press Enter to skip): ');

		// Save to ground truth
		groundTruth.set(email.filename, {
			filename: email.filename,
			category,
			notes: notes.trim() || undefined,
		});

		labeled++;
		console.log(`\n✓ Labeled ${labeled}/${unlabeled.length}`);

		// Auto-save every 10 emails
		if (labeled % 10 === 0) {
			await saveGroundTruth(groundTruth, GROUND_TRUTH_FILE);
			console.log('(Auto-saved)');
		}
	}

	// Final save
	await saveGroundTruth(groundTruth, GROUND_TRUTH_FILE);
	console.log('\n✓ All emails labeled!');
	rl.close();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
	console.log('\n\nInterrupted. Saving progress...');
	try {
		const groundTruth = await loadGroundTruth(GROUND_TRUTH_FILE);
		await saveGroundTruth(groundTruth, GROUND_TRUTH_FILE);
		console.log('Progress saved.');
	} catch {
		console.log('Could not save progress.');
	}
	process.exit(0);
});

main().catch(console.error);
