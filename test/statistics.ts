/**
 * Statistics calculation and reporting
 */

import { AnalysisResult, CategoryStats, EmailCategory, TestResults, GroundTruth } from './types.js';
import { promises as fs } from 'fs';

const ALL_CATEGORIES: EmailCategory[] = [
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

/**
 * Calculate statistics from analysis results
 */
export function calculateStatistics(results: AnalysisResult[], groundTruth?: Map<string, GroundTruth>): TestResults {
	const categoryStats = new Map<EmailCategory, CategoryStats>();

	// Initialize all categories
	for (const category of ALL_CATEGORIES) {
		categoryStats.set(category, {
			category,
			count: 0,
			avgScore: 0,
			totalScore: 0,
			avgFastmailScore: 0,
			totalFastmailScore: 0,
			scoreDifference: 0,
			falsePositives: 0,
			falseNegatives: 0,
			emails: [],
		});
	}

	// Also initialize 'unknown' category
	categoryStats.set('unknown', {
		category: 'unknown',
		count: 0,
		avgScore: 0,
		totalScore: 0,
		avgFastmailScore: 0,
		totalFastmailScore: 0,
		scoreDifference: 0,
		falsePositives: 0,
		falseNegatives: 0,
		emails: [],
	});

	let analyzed = 0;
	let failed = 0;

	// Process each result
	for (const result of results) {
		const category = result.analysis.category;
		const stats = categoryStats.get(category)!;

		if (category === 'unknown' && result.analysis.reasoning.includes('failed')) {
			failed++;
		} else {
			analyzed++;
		}

		stats.count++;
		stats.totalScore += result.analysis.spamscore;
		stats.emails.push(result);

		// Track Fastmail spam scores if available
		if (result.fastmailSpamScore !== undefined) {
			stats.totalFastmailScore += result.fastmailSpamScore;
		}

		// Calculate false positives/negatives if we have ground truth
		if (groundTruth && groundTruth.has(result.filename)) {
			const truth = groundTruth.get(result.filename)!;
			result.actualCategory = truth.category;

			// False positive: Predicted as spam/phishing/scam but actually legitimate
			const predictedBad = ['phishing', 'scam', 'spam', 'suspicious'].includes(category);
			const actuallyGood = !['phishing', 'scam', 'spam', 'suspicious'].includes(truth.category);

			if (predictedBad && actuallyGood) {
				stats.falsePositives++;
			}

			// False negative: Predicted as legitimate but actually spam/phishing/scam
			const predictedGood = !predictedBad;
			const actuallyBad = ['phishing', 'scam', 'spam', 'suspicious'].includes(truth.category);

			if (predictedGood && actuallyBad) {
				stats.falseNegatives++;
			}
		}
	}

	// Calculate averages and score differences
	for (const stats of categoryStats.values()) {
		if (stats.count > 0) {
			stats.avgScore = parseFloat((stats.totalScore / stats.count).toFixed(2));

			// Calculate average Fastmail score
			const emailsWithFastmailScore = stats.emails.filter(e => e.fastmailSpamScore !== undefined);
			if (emailsWithFastmailScore.length > 0) {
				stats.avgFastmailScore = parseFloat((stats.totalFastmailScore / emailsWithFastmailScore.length).toFixed(2));
				// Calculate average difference (our score - Fastmail score)
				const differences = emailsWithFastmailScore.map(e =>
					e.analysis.spamscore - (e.fastmailSpamScore || 0)
				);
				stats.scoreDifference = parseFloat(
					(differences.reduce((sum, d) => sum + d, 0) / differences.length).toFixed(2)
				);
			}
		}
	}

	return {
		totalEmails: results.length,
		analyzed,
		failed,
		categoryStats,
		startTime: new Date(),
	};
}

/**
 * Print live statistics (compact version for progress updates)
 */
export function printLiveStatistics(testResults: TestResults, groundTruth?: Map<string, GroundTruth>): void {
	// Check if we have any Fastmail scores
	const hasFastmailScores = Array.from(testResults.categoryStats.values()).some(
		stats => stats.emails.some(e => e.fastmailSpamScore !== undefined)
	);

	// Table header
	if (hasFastmailScores) {
		console.log(
			'Category'.padEnd(15) +
				'Count'.padEnd(8) +
				'Avg Score'.padEnd(12) +
				'FM Score'.padEnd(12) +
				'Diff'.padEnd(10)
		);
		console.log('-'.repeat(57));
	} else {
		console.log('Category'.padEnd(15) + 'Count'.padEnd(8) + 'Avg Score'.padEnd(12));
		console.log('-'.repeat(35));
	}

	// Sort by count descending
	const sortedStats = Array.from(testResults.categoryStats.entries())
		.filter(([_, stats]) => stats.count > 0)
		.sort((a, b) => b[1].count - a[1].count);

	for (const [category, stats] of sortedStats) {
		const categoryStr = category.padEnd(15);
		const countStr = stats.count.toString().padEnd(8);
		const avgScoreStr = stats.avgScore.toFixed(2).padEnd(12);

		if (hasFastmailScores) {
			const fmScoreStr = stats.avgFastmailScore.toFixed(2).padEnd(12);
			const diffStr = (stats.scoreDifference >= 0 ? '+' : '') + stats.scoreDifference.toFixed(2);
			const diffPadded = diffStr.padEnd(10);
			console.log(categoryStr + countStr + avgScoreStr + fmScoreStr + diffPadded);
		} else {
			console.log(categoryStr + countStr + avgScoreStr);
		}
	}
}

/**
 * Print statistics table to console
 */
export function printStatistics(testResults: TestResults, groundTruth?: Map<string, GroundTruth>): void {
	console.log('\n' + '='.repeat(80));
	console.log('EMAIL ANALYSIS RESULTS');
	console.log('='.repeat(80));
	console.log(`Total Emails: ${testResults.totalEmails}`);
	console.log(`Successfully Analyzed: ${testResults.analyzed}`);
	console.log(`Failed: ${testResults.failed}`);
	if (testResults.duration) {
		console.log(`Duration: ${(testResults.duration / 1000).toFixed(2)}s`);
		console.log(`Average: ${(testResults.duration / testResults.totalEmails).toFixed(0)}ms per email`);
	}
	console.log('='.repeat(80));

	// Table header
	console.log('\n');
	const hasGroundTruth = groundTruth && groundTruth.size > 0;

	// Check if we have any Fastmail scores
	const hasFastmailScores = Array.from(testResults.categoryStats.values()).some(
		stats => stats.emails.some(e => e.fastmailSpamScore !== undefined)
	);

	if (hasFastmailScores && hasGroundTruth) {
		console.log(
			'Category'.padEnd(15) +
				'Count'.padEnd(8) +
				'Avg Score'.padEnd(12) +
				'FM Score'.padEnd(12) +
				'Diff'.padEnd(10) +
				'False Pos'.padEnd(12) +
				'False Neg'.padEnd(12)
		);
		console.log('-'.repeat(81));
	} else if (hasFastmailScores) {
		console.log(
			'Category'.padEnd(15) +
				'Count'.padEnd(8) +
				'Avg Score'.padEnd(12) +
				'FM Score'.padEnd(12) +
				'Diff'.padEnd(10)
		);
		console.log('-'.repeat(57));
	} else if (hasGroundTruth) {
		console.log(
			'Category'.padEnd(15) +
				'Count'.padEnd(8) +
				'Avg Score'.padEnd(12) +
				'False Pos'.padEnd(12) +
				'False Neg'.padEnd(12)
		);
		console.log('-'.repeat(59));
	} else {
		console.log('Category'.padEnd(15) + 'Count'.padEnd(8) + 'Avg Score'.padEnd(12));
		console.log('-'.repeat(35));
	}

	// Sort by count descending
	const sortedStats = Array.from(testResults.categoryStats.entries()).sort((a, b) => b[1].count - a[1].count);

	for (const [category, stats] of sortedStats) {
		if (stats.count === 0) continue;

		const categoryStr = category.padEnd(15);
		const countStr = stats.count.toString().padEnd(8);
		const avgScoreStr = stats.avgScore.toFixed(2).padEnd(12);

		if (hasFastmailScores && hasGroundTruth) {
			const fmScoreStr = stats.avgFastmailScore.toFixed(2).padEnd(12);
			const diffStr = (stats.scoreDifference >= 0 ? '+' : '') + stats.scoreDifference.toFixed(2);
			const diffPadded = diffStr.padEnd(10);
			const fpStr = stats.falsePositives.toString().padEnd(12);
			const fnStr = stats.falseNegatives.toString().padEnd(12);
			console.log(categoryStr + countStr + avgScoreStr + fmScoreStr + diffPadded + fpStr + fnStr);
		} else if (hasFastmailScores) {
			const fmScoreStr = stats.avgFastmailScore.toFixed(2).padEnd(12);
			const diffStr = (stats.scoreDifference >= 0 ? '+' : '') + stats.scoreDifference.toFixed(2);
			const diffPadded = diffStr.padEnd(10);
			console.log(categoryStr + countStr + avgScoreStr + fmScoreStr + diffPadded);
		} else if (hasGroundTruth) {
			const fpStr = stats.falsePositives.toString().padEnd(12);
			const fnStr = stats.falseNegatives.toString().padEnd(12);
			console.log(categoryStr + countStr + avgScoreStr + fpStr + fnStr);
		} else {
			console.log(categoryStr + countStr + avgScoreStr);
		}
	}

	console.log('\n');

	// Show accuracy if we have ground truth
	if (hasGroundTruth) {
		const totalFP = Array.from(testResults.categoryStats.values()).reduce(
			(sum, s) => sum + s.falsePositives,
			0
		);
		const totalFN = Array.from(testResults.categoryStats.values()).reduce(
			(sum, s) => sum + s.falseNegatives,
			0
		);
		const accuracy = ((testResults.analyzed - totalFP - totalFN) / testResults.analyzed) * 100;

		console.log(`Total False Positives: ${totalFP}`);
		console.log(`Total False Negatives: ${totalFN}`);
		console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
		console.log('\n');
	}
}

/**
 * Export results to JSON file
 */
export async function exportResults(
	testResults: TestResults,
	outputPath: string = 'test-results.json'
): Promise<void> {
	// Convert Map to object for JSON serialization
	const categoryStatsObj: any = {};
	for (const [category, stats] of testResults.categoryStats.entries()) {
		categoryStatsObj[category] = {
			...stats,
			emails: stats.emails.map(e => ({
				filename: e.filename,
				from: e.from,
				subject: e.subject,
				category: e.analysis.category,
				spamscore: e.analysis.spamscore,
				reasoning: e.analysis.reasoning,
				actualCategory: e.actualCategory,
				actualScore: e.actualScore,
			})),
		};
	}

	const exportData = {
		...testResults,
		categoryStats: categoryStatsObj,
	};

	await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
	console.log(`Results exported to ${outputPath}`);
}

/**
 * Export results to CSV file
 */
export async function exportToCsv(testResults: TestResults, outputPath: string = 'test-results.csv'): Promise<void> {
	const rows: string[] = [
		'Filename,From,Subject,Predicted Category,Our Score,Fastmail Score,Score Diff,Actual Category,Reasoning',
	];

	for (const stats of testResults.categoryStats.values()) {
		for (const email of stats.emails) {
			const scoreDiff = email.fastmailSpamScore !== undefined
				? (email.analysis.spamscore - email.fastmailSpamScore).toFixed(2)
				: '';

			const fields = [
				email.filename,
				email.from,
				email.subject,
				email.analysis.category,
				email.analysis.spamscore.toString(),
				email.fastmailSpamScore?.toString() || '',
				scoreDiff,
				email.actualCategory || '',
				email.analysis.reasoning,
			];

			// Escape and quote fields
			const escapedFields = fields.map(f => `"${f.replace(/"/g, '""')}"`);
			rows.push(escapedFields.join(','));
		}
	}

	await fs.writeFile(outputPath, rows.join('\n'));
	console.log(`Results exported to ${outputPath}`);
}

/**
 * Load ground truth from JSON file
 */
export async function loadGroundTruth(filepath: string): Promise<Map<string, GroundTruth>> {
	try {
		const content = await fs.readFile(filepath, 'utf-8');
		const data: GroundTruth[] = JSON.parse(content);
		const map = new Map<string, GroundTruth>();

		for (const item of data) {
			map.set(item.filename, item);
		}

		console.log(`Loaded ground truth for ${map.size} emails`);
		return map;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('No ground truth file found. Run "npm run test:label" to create one.');
			return new Map();
		}
		throw error;
	}
}

/**
 * Save ground truth to JSON file
 */
export async function saveGroundTruth(
	groundTruth: Map<string, GroundTruth>,
	filepath: string = 'test/ground-truth.json'
): Promise<void> {
	const data = Array.from(groundTruth.values());
	await fs.writeFile(filepath, JSON.stringify(data, null, 2));
	console.log(`Saved ground truth for ${data.length} emails to ${filepath}`);
}
