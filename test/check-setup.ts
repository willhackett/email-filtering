#!/usr/bin/env node
/**
 * Quick setup verification script
 */

import { Ollama } from 'ollama';
import { promises as fs } from 'fs';

const TEST_EMAIL_DIR = '__test_emails__';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

async function checkSetup() {
	console.log('Email Filtering Test Suite - Setup Check');
	console.log('=========================================\n');

	let allGood = true;

	// Check 1: Test email directory
	console.log('1. Checking test email directory...');
	try {
		const stats = await fs.stat(TEST_EMAIL_DIR);
		if (!stats.isDirectory()) {
			console.log(`   ✗ ${TEST_EMAIL_DIR} exists but is not a directory`);
			allGood = false;
		} else {
			const files = await fs.readdir(TEST_EMAIL_DIR);
			const emlFiles = files.filter(f => f.toLowerCase().endsWith('.eml'));
			if (emlFiles.length === 0) {
				console.log(`   ⚠ ${TEST_EMAIL_DIR} exists but contains no .eml files`);
				console.log(`   → Add .eml files to this directory before running tests`);
			} else {
				console.log(`   ✓ Found ${emlFiles.length} .eml files`);
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log(`   ✗ ${TEST_EMAIL_DIR} directory not found`);
			console.log(`   → Run: mkdir ${TEST_EMAIL_DIR}`);
			allGood = false;
		} else {
			throw error;
		}
	}

	// Check 2: Ollama connection
	console.log('\n2. Checking Ollama connection...');
	const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });
	try {
		await ollama.list();
		console.log('   ✓ Connected to Ollama');
	} catch (error) {
		console.log('   ✗ Cannot connect to Ollama');
		console.log('   → Make sure Ollama is running: ollama serve');
		allGood = false;
	}

	// Check 3: Model availability
	console.log(`\n3. Checking for ${OLLAMA_MODEL} model...`);
	try {
		const models = await ollama.list();
		const hasModel = models.models.some(m => m.name === OLLAMA_MODEL);
		if (hasModel) {
			console.log(`   ✓ Model ${OLLAMA_MODEL} is available`);
		} else {
			console.log(`   ✗ Model ${OLLAMA_MODEL} not found`);
			console.log(`   → Run: ollama pull ${OLLAMA_MODEL}`);
			console.log('\n   Available models:');
			models.models.forEach(m => console.log(`     - ${m.name}`));
			allGood = false;
		}
	} catch (error) {
		console.log('   ✗ Could not check models (Ollama may not be running)');
		allGood = false;
	}

	// Check 4: Ground truth file
	console.log('\n4. Checking ground truth file...');
	try {
		await fs.stat('test/ground-truth.json');
		console.log('   ✓ Ground truth file exists');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('   ℹ No ground truth file (optional)');
			console.log('   → Run: npm run test:label to create one');
		}
	}

	// Summary
	console.log('\n=========================================');
	if (allGood) {
		console.log('✓ Setup looks good! Ready to run tests.');
		console.log('\nNext steps:');
		console.log('  npm run test        - Analyze all emails');
		console.log('  npm run test:label  - Label emails for accuracy testing');
	} else {
		console.log('✗ Setup incomplete. Please address the issues above.');
	}
	console.log('=========================================\n');
}

checkSetup().catch(console.error);
