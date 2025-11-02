/**
 * Shared types for test suite
 */

export type EmailCategory =
	| 'personal'
	| 'transactional'
	| 'newsletter'
	| 'marketing'
	| 'social'
	| 'automated'
	| 'phishing'
	| 'scam'
	| 'spam'
	| 'suspicious'
	| 'unknown';

export interface EmailAnalysis {
	category: EmailCategory;
	spamscore: number;
	reasoning: string;
}

export interface EmailMetadata {
	filename: string;
	from: string;
	subject: string;
	body: string;
	date?: Date;
	fastmailSpamScore?: number; // X-Spam-Score from Fastmail
}

export interface AnalysisResult extends EmailMetadata {
	analysis: EmailAnalysis;
	actualCategory?: EmailCategory;
	actualScore?: number;
}

export interface CategoryStats {
	category: EmailCategory;
	count: number;
	avgScore: number;
	totalScore: number;
	avgFastmailScore: number;
	totalFastmailScore: number;
	scoreDifference: number; // Average difference from Fastmail score
	falsePositives: number;
	falseNegatives: number;
	emails: AnalysisResult[];
}

export interface TestResults {
	totalEmails: number;
	analyzed: number;
	failed: number;
	categoryStats: Map<EmailCategory, CategoryStats>;
	startTime: Date;
	endTime?: Date;
	duration?: number;
}

export interface GroundTruth {
	filename: string;
	category: EmailCategory;
	notes?: string;
}
