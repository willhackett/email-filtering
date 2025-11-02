#!/usr/bin/env node
/**
 * Main test runner - analyzes all .eml files and generates statistics
 */

import { Ollama } from 'ollama';
import { loadEmlFiles } from './email-parser.js';
import { analyzeEmail } from './analyzer.js';
import { calculateStatistics, printStatistics, printLiveStatistics, exportResults, exportToCsv, loadGroundTruth } from './statistics.js';
import { AnalysisResult } from './types.js';

const TEST_EMAIL_DIR = '__test_emails__';
const GROUND_TRUTH_FILE = 'test/ground-truth.json';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10'); // Process 10 emails in parallel
const LIVE_REPORT_FREQUENCY = parseInt(process.env.LIVE_REPORT_FREQUENCY || '5'); // Show stats every N batches

async function main() {
	console.log('Email Filtering Test Suite');
	console.log('==========================\n');

	if (BATCH_SIZE !== 10) {
		console.log(`Using batch size: ${BATCH_SIZE} (parallel processing)`);
	} else {
		console.log(`Using batch size: ${BATCH_SIZE} (default)`);
		console.log(`💡 Tip: Speed up with BATCH_SIZE=20 or BATCH_SIZE=30\n`);
	}

	// Check Ollama connection
	console.log(`Connecting to Ollama (model: ${OLLAMA_MODEL})...`);
	const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });

	try {
		// Test connection
		await ollama.list();
		console.log('✓ Connected to Ollama\n');
	} catch (error) {
		console.error('✗ Failed to connect to Ollama');
		console.error('Make sure Ollama is running: ollama serve');
		console.error(`Make sure you have the model: ollama pull ${OLLAMA_MODEL}`);
		process.exit(1);
	}

	// Load emails
	console.log(`Loading emails from ${TEST_EMAIL_DIR}...`);
	const emails = await loadEmlFiles(TEST_EMAIL_DIR);

	if (emails.length === 0) {
		console.error(`No emails found in ${TEST_EMAIL_DIR}`);
		console.log('\nTo get started:');
		console.log(`1. Create the ${TEST_EMAIL_DIR} directory`);
		console.log('2. Add .eml files to analyze');
		console.log('3. Run this script again');
		process.exit(1);
	}

	console.log(`✓ Loaded ${emails.length} emails\n`);

	// Load ground truth if available
	let groundTruth;
	try {
		groundTruth = await loadGroundTruth(GROUND_TRUTH_FILE);
		console.log('');
	} catch (error) {
		console.log('No ground truth available (run npm run test:label to create)\n');
	}

	// Analyze emails in parallel batches
	console.log(`Analyzing emails in batches of ${BATCH_SIZE}...\n`);
	const results: AnalysisResult[] = [];
	const startTime = Date.now();
	let processed = 0;

	// Process in batches
	for (let i = 0; i < emails.length; i += BATCH_SIZE) {
		const batch = emails.slice(i, i + BATCH_SIZE);
		const batchStartTime = Date.now();

		// Process batch in parallel
		const batchPromises = batch.map(async (email) => {
			try {
				const analysis = await analyzeEmail(ollama, email.from, email.subject, email.body, OLLAMA_MODEL);
				return {
					...email,
					analysis,
				} as AnalysisResult;
			} catch (error) {
				console.error(`Failed to analyze ${email.filename}:`, error);
				return null;
			}
		});

		const batchResults = await Promise.all(batchPromises);
		const validResults = batchResults.filter((r): r is AnalysisResult => r !== null);
		results.push(...validResults);

		processed += batch.length;
		const batchDuration = Date.now() - batchStartTime;
		const avgTimePerEmail = batchDuration / batch.length;
		const remainingEmails = emails.length - processed;
		const estimatedTimeRemaining = (remainingEmails / BATCH_SIZE) * batchDuration;

		// Print progress
		console.log(
			`Progress: ${processed}/${emails.length} (${((processed / emails.length) * 100).toFixed(1)}%) | ` +
			`Batch: ${(batchDuration / 1000).toFixed(1)}s | ` +
			`Avg: ${(avgTimePerEmail / 1000).toFixed(1)}s/email | ` +
			`ETA: ${(estimatedTimeRemaining / 60000).toFixed(1)}min`
		);

		// Print live statistics at configured frequency or milestones
		const batchNumber = Math.floor(processed / BATCH_SIZE);
		const shouldPrintStats =
			batchNumber % LIVE_REPORT_FREQUENCY === 0 || // Every N batches
			processed >= 100 && processed < 100 + BATCH_SIZE || // After first 100
			processed >= 500 && processed < 500 + BATCH_SIZE || // After 500
			processed >= 1000 && processed < 1000 + BATCH_SIZE || // After 1000
			processed >= emails.length; // At the end

		if (shouldPrintStats && results.length > 0) {
			const liveStats = calculateStatistics(results, groundTruth);
			console.log('\n' + '='.repeat(80));
			console.log(`LIVE RESULTS (${processed}/${emails.length} emails analyzed - ${((processed/emails.length)*100).toFixed(1)}%)`);
			console.log('='.repeat(80));
			printLiveStatistics(liveStats, groundTruth);
			console.log('='.repeat(80) + '\n');
		}
	}

	const endTime = Date.now();
	const duration = endTime - startTime;

	console.log(`✓ Completed ${processed}/${emails.length} emails in ${(duration / 60000).toFixed(1)} minutes\n`);

	// Calculate statistics
	const testResults = calculateStatistics(results, groundTruth);
	testResults.endTime = new Date(endTime);
	testResults.duration = duration;

	// Print results
	printStatistics(testResults, groundTruth);

	// Export results
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
	await exportResults(testResults, `test-results-${timestamp}.json`);
	await exportToCsv(testResults, `test-results-${timestamp}.csv`);

	console.log('\nDone!');
}

main().catch(console.error);
