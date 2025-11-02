# Email Filtering Test Suite

Local testing framework for the email filtering worker using Ollama and .eml files.

## Overview

This test suite allows you to:
1. Analyze real .eml files using the same logic as the production worker
2. Run analysis locally using Ollama (no API costs)
3. Create ground truth labels for accuracy measurement
4. Generate detailed statistics and reports
5. Calculate false positive/negative rates

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. Install and Setup Ollama

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama server
ollama serve

# Pull LLaMA 3.1 8B model (same as Workers AI)
ollama pull llama3.1:8b
```

For other operating systems, see: https://ollama.ai/download

### 3. Prepare Test Emails

Create a directory for your test emails:

```bash
mkdir __test_emails__
```

Add your .eml files to this directory. You can:
- Export emails from your email client as .eml files
- Use Thunderbird, Apple Mail, Outlook, etc.
- Download from webmail (most support "Download as .eml")

**Important for Fastmail users:**
To get emails that already have Fastmail's spam scores:
1. Log into Fastmail webmail
2. Open an email
3. Click the three dots (⋯) menu
4. Select "Show Raw Message" or "Download"
5. Save as .eml file

These .eml files will include the `X-Spam-Score` header that Fastmail adds, allowing you to compare your AI's scores with Fastmail's.

## Usage

### Step 1: Label Emails (Optional but Recommended)

To measure accuracy, you need to create ground truth category labels:

```bash
npm run test:label
```

This interactive tool will:
1. Show each email one by one
2. Ask you to categorize it (1-10)
3. Optionally add notes
4. Save your labels to `test/ground-truth.json`
5. Auto-save every 10 emails

**Note:** You only label the **category**, not the spam score. The spam score comparison uses Fastmail's `X-Spam-Score` header from your .eml files automatically.

**Tips:**
- Press `s` to skip an email
- Press `q` to quit and save
- Ctrl+C will save progress
- You can resume later - already labeled emails are skipped

**Categories:**
1. personal
2. transactional
3. newsletter
4. marketing
5. social
6. automated
7. phishing
8. scam
9. spam
10. suspicious

### Step 2: Run Analysis

Analyze all emails with Ollama:

```bash
npm run test
```

This will:
1. Connect to Ollama
2. Load all .eml files from `__test_emails__/`
3. Parse each email (sender, subject, body)
4. Send to LLaMA model for analysis (in parallel batches)
5. **Show live statistics as it processes**
6. Export final results to JSON and CSV

**Live Progress Reporting:**

As the analysis runs, you'll see:
1. **Progress updates** after each batch:
   ```
   Progress: 150/2800 (5.4%) | Batch: 8.2s | Avg: 0.8s/email | ETA: 42.3min
   ```

2. **Live statistics tables** every 5 batches (default) and at milestones (100, 500, 1000 emails):
   ```
   ================================================================================
   LIVE RESULTS (150/2800 emails analyzed - 5.4%)
   ================================================================================
   Category        Count   Avg Score   FM Score    Diff
   ---------------------------------------------------------
   newsletter      68      3.21        1.82        +1.39
   marketing       42      4.53        3.18        +1.35
   transactional   25      1.04        0.11        +0.93
   spam            12      8.67        7.15        +1.52
   personal        3       0.67        0.00        +0.67
   ================================================================================
   ```

This lets you monitor results as they come in and spot trends early!

**Performance:**
- Default: Processes 10 emails in parallel (~1-2s per email)
- With `BATCH_SIZE=30`: ~0.7-1s per email
- For 2800 emails: expect 30-60 minutes with batch processing

### Step 3: Review Results

The test suite generates three files:

1. **Console Output** - Summary table with statistics
2. **`test-results-[timestamp].json`** - Full results with all details
3. **`test-results-[timestamp].csv`** - Spreadsheet-friendly format

## Output Format

### Console Table (Basic)

```
Category        Count   Avg Score
-----------------------------------
newsletter      45      3.20
marketing       23      4.50
transactional   12      1.00
spam            8       8.75
personal        2       0.50
```

### Console Table (With Fastmail Scores)

If your .eml files contain the `X-Spam-Score` header from Fastmail:

```
Category        Count   Avg Score   FM Score    Diff
---------------------------------------------------------
newsletter      45      3.20        1.80        +1.40
marketing       23      4.50        3.20        +1.30
transactional   12      1.00        0.10        +0.90
spam            8       8.75        7.20        +1.55
personal        2       0.50        0.00        +0.50
```

### Console Table (With Fastmail + Ground Truth)

```
Category        Count   Avg Score   FM Score    Diff      False Pos   False Neg
---------------------------------------------------------------------------------
newsletter      45      3.20        1.80        +1.40     2           1
marketing       23      4.50        3.20        +1.30     0           3
transactional   12      1.00        0.10        +0.90     0           0
spam            8       8.75        7.20        +1.55     1           2
personal        2       0.50        0.00        +0.50     0           0

Total False Positives: 3
Total False Negatives: 6
Accuracy: 92.31%
```

### Definitions

- **Count**: Number of emails classified in this category
- **Avg Score**: Average spam score assigned by our AI
- **FM Score**: Average X-Spam-Score from Fastmail (if available)
- **Diff**: Difference between our score and Fastmail's (positive = we're more aggressive)
- **False Positives**: Legitimate emails incorrectly marked as spam/phishing/scam/suspicious
- **False Negatives**: Spam/phishing/scam emails incorrectly marked as legitimate

### Fastmail Score Comparison

**Why this matters:**
- Fastmail already scores emails with `X-Spam-Score`
- Comparing helps calibrate our AI to be similar
- Positive diff means we're more aggressive than Fastmail
- Negative diff means we're more lenient than Fastmail

**Ideal results:**
- Diff should be close to 0 for most categories
- Slight positive diff (0.5-2.0) is acceptable - better safe than sorry
- Large positive diff (>3.0) means we might be too aggressive
- Negative diff on spam/phishing means we're missing threats

## Configuration

### Environment Variables

```bash
# Use a different Ollama host
export OLLAMA_HOST=http://192.168.1.100:11434

# Use a different model
export OLLAMA_MODEL=llama3.1:70b

# Adjust parallel batch size (default: 10)
export BATCH_SIZE=20

# Control live report frequency (default: show stats every 5 batches)
export LIVE_REPORT_FREQUENCY=3  # Show more often
# or
export LIVE_REPORT_FREQUENCY=10 # Show less often

npm run test
```

### Performance Tuning

**Speed up analysis with parallel processing:**

The test suite processes emails in parallel batches. Adjust batch size based on your hardware:

```bash
# Default: 10 emails in parallel (good for most machines)
npm run test

# Faster: 20 emails in parallel (if you have good CPU/GPU)
BATCH_SIZE=20 npm run test

# Even faster: 30 emails in parallel (powerful machines)
BATCH_SIZE=30 npm run test

# Slower but safer: 5 emails in parallel (limited RAM)
BATCH_SIZE=5 npm run test
```

**Expected performance:**
- **Sequential (old)**: ~10s per email = 50min for 300 emails
- **Batch of 10**: ~1-2s per email = 5-10min for 300 emails (10x faster!)
- **Batch of 20**: ~0.8-1.5s per email = 4-8min for 300 emails
- **Batch of 30**: ~0.7-1.2s per email = 3.5-6min for 300 emails

**Hardware considerations:**
- **CPU**: More cores = higher batch size
- **RAM**: ~500MB per concurrent request, watch memory usage
- **GPU**: If Ollama uses GPU, parallelization is very effective
- **Model size**: Smaller models (7b) = more parallelization possible

### Available Models

```bash
# Faster, less accurate
ollama pull llama3.1:7b

# Balanced (default)
ollama pull llama3.1:8b

# Slower, more accurate
ollama pull llama3.1:70b

# Very fast, good for testing
ollama pull llama3.2:3b
```

## Files Generated

```
__test_emails__/           # Your .eml files (git-ignored)
  ├── email1.eml
  ├── email2.eml
  └── ...

test/
  ├── ground-truth.json    # Your manual labels (git-ignored)
  └── README.md

test-results-[time].json   # Detailed results (git-ignored)
test-results-[time].csv    # CSV export (git-ignored)
```

## Example Workflow

### Analyzing 90 Days of Email

```bash
# 1. Export emails from your client
#    - Select all emails from last 90 days
#    - Export as .eml files
#    - Save to __test_emails__/

# 2. Label a representative sample (optional)
npm run test:label
# Label 20-30 emails across different categories

# 3. Run full analysis
npm run test

# 4. Review results
# Check console output for overview
# Open test-results-*.csv in Excel/Numbers/Google Sheets
# Review test-results-*.json for detailed analysis
```

## Tips for Better Results

### Labeling Strategy

1. **Label diverse examples**: Include emails from each category
2. **Focus on edge cases**: Ambiguous emails are most valuable
3. **Be consistent**: Use the same criteria each time
4. **Take breaks**: Labeling fatigue leads to inconsistency

### Spam Score Guidelines

- **0-2**: Definitely legitimate (personal email, expected receipts)
- **3-4**: Commercial but legitimate (newsletters you signed up for)
- **5-6**: Borderline (unsolicited but not malicious)
- **7-8**: Likely malicious (phishing attempts, obvious scams)
- **9-10**: Definitely malicious (credential harvesting, impersonation)

### Improving Accuracy

If you see high false positive/negative rates:

1. **Review misclassified emails** in the CSV export
2. **Check the reasoning** field to understand why
3. **Adjust the prompt** in `src/index.ts` if needed
4. **Try a larger model** (llama3.1:70b) for better accuracy
5. **Add more training examples** to the prompt

## Troubleshooting

### "Failed to connect to Ollama"

```bash
# Make sure Ollama is running
ollama serve

# In another terminal, verify it works
ollama list
```

### "No emails found in __test_emails__"

```bash
# Create the directory
mkdir __test_emails__

# Add .eml files, then run again
```

### Slow Analysis Speed

- Use a smaller model: `OLLAMA_MODEL=llama3.1:7b npm run test`
- Upgrade hardware (Ollama uses GPU if available)
- Reduce test email count for initial testing

### "Failed to parse [file].eml"

- Some .eml files may be corrupted or use non-standard formats
- The script will skip these and continue
- Check the console for specific error messages

## Comparing with Production

To compare local Ollama results with production Workers AI:

1. Run test suite locally
2. Deploy worker and send same emails through it
3. Compare the headers added by the worker
4. Note: Some variation is normal due to model differences

## Data Privacy

**Important**: The test suite processes emails locally using Ollama. No data is sent to external APIs. However:

- Test emails contain sensitive personal data
- All test files are git-ignored by default
- Never commit `__test_emails__/` or ground truth files
- Consider using anonymized test data for sharing

## Performance Benchmarks

Typical performance on M1 MacBook Pro:

| Model | Time per Email | Memory Usage |
|-------|----------------|--------------|
| llama3.1:7b | ~1-2s | ~4GB |
| llama3.1:8b | ~2-5s | ~6GB |
| llama3.1:70b | ~15-30s | ~40GB |

For 90 emails with llama3.1:8b:
- **Total time**: 3-8 minutes
- **Peak memory**: ~6GB RAM
- **CPU/GPU**: Varies by hardware

## Advanced Usage

### Custom Analysis

You can modify `test/analyzer.ts` to:
- Test different prompts
- Try different models
- Add custom scoring logic
- Compare multiple approaches

### Batch Testing

```bash
# Test with different models
for model in llama3.1:7b llama3.1:8b llama3.1:70b; do
  echo "Testing with $model"
  OLLAMA_MODEL=$model npm run test
done
```

### Integration Testing

Use the CSV export to:
- Create test cases for CI/CD
- Track accuracy over time
- Compare prompt improvements
- A/B test different approaches

## Contributing

If you improve the test suite:
1. Test with at least 50 emails
2. Document any new features in this README
3. Share accuracy improvements!
