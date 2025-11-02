# Using AI for email filtering

This project uses Ollama's local LLMs to analyse and categorise emails for Fastmail. In production you can use Cloudflare Email Routing with Workers AI to add custom headers to incoming emails based on their content. In Fastmail, you can then create rules to automatically organize, flag, or delete emails based on these headers.

Get up and running in 5 minutes.

## Testing Locally (Recommended First Step)

```bash
# 1. Install Ollama
brew install ollama

# 2. Start Ollama (in a separate terminal, keep it running)
ollama serve

# 3. Download the model (one-time, ~4.7GB)
ollama pull llama3.1:8b

# 4. Test with example emails (provided)
npm run test
```

**Expected output:**

```
Category        Count   Avg Score
-----------------------------------
newsletter      1       3.2
phishing        1       9.5
transactional   1       1.0
```

**Note:** If your .eml files include Fastmail's `X-Spam-Score` header, you'll also see FM Score and Diff columns for comparison!

**If it works**: Continue to step 5
**If it doesn't work**: Run `npm run test:check` to diagnose

```bash
# 5. Add your own .eml files
# Export emails from your email client to __test_emails__/

# 6. Run analysis on your emails
npm run test

# 7. Review the results in the console and CSV file
```

## Deploying to Production

```bash
# 1. Update your Fastmail email address
# Edit wrangler.jsonc line 29:
"FASTMAIL_EMAIL": "your-email@fastmail.com"

# 2. Deploy to Cloudflare
npm run deploy

# 3. Configure Cloudflare Email Routing
# Go to: Cloudflare Dashboard → Your Domain → Email → Email Routing
# - Enable Email Routing
# - Add destination address (your Fastmail)
# - Create catch-all rule: Send to Worker → email-filtering

# 4. Test by sending an email to your domain
# It should appear in your Fastmail inbox with X-Wh-* headers

# 5. Create Fastmail filters based on headers
# Settings → Rules → Create rules using X-Wh-Category and X-Wh-Spamscore
```

## Common Commands

```bash
npm run test              # Analyze emails with Ollama
npm run test:label        # Label emails for accuracy testing
npm run test:check        # Verify setup is correct
npm run deploy            # Deploy to Cloudflare
npm run dev               # Run worker locally (limited)
```

**Speed up testing (for large email sets):**

```bash
BATCH_SIZE=20 npm run test     # Process 20 emails in parallel (2x faster)
BATCH_SIZE=30 npm run test     # Process 30 emails in parallel (3x faster)
```

## What You Get

**Three headers added to every email:**

- `X-Wh-Spamscore`: 0-10 (spam likelihood)
- `X-Wh-Category`: personal, newsletter, marketing, spam, phishing, etc.
- `X-Wh-Reasoning`: Why it was categorized this way

**Use these headers in Fastmail to:**

- Auto-file newsletters
- Flag suspicious emails
- Delete obvious spam
- Organize by category

## Example Fastmail Rules

```
Rule 1: File Newsletters
If X-Wh-Category is "newsletter"
→ Move to "Newsletters" folder

Rule 2: Flag Spam
If X-Wh-Spamscore is greater than 6
→ Move to "Spam" folder
→ Mark as read

Rule 3: Quarantine Phishing
If X-Wh-Category is "phishing"
→ Move to "Quarantine" folder
→ Mark as read
→ Apply label "Danger"
```

## Next Steps

1. **Read TESTING_GUIDE.md** for comprehensive testing instructions
2. **Read README.md** for full production documentation
3. **Read test/README.md** for test suite details

## Troubleshooting

### "Cannot connect to Ollama"

```bash
# Make sure Ollama is running in another terminal
ollama serve
```

### "Model not found"

```bash
# Pull the model
ollama pull llama3.1:8b

# Verify it's installed
ollama list
```

### "No emails found"

```bash
# Make sure directory exists and has .eml files
ls -la __test_emails__/

# Should see at least the 3 example files
```

### "Command not found: npm"

```bash
# Install Node.js first
brew install node

# Then install dependencies
npm install
```

## Support

- **Setup issues**: Run `npm run test:check`
- **Testing questions**: See TESTING_GUIDE.md
- **Production questions**: See README.md
- **Test suite questions**: See test/README.md

## Success!

If you see analysis results, you're all set! The worker uses the exact same logic, so results will be very similar in production.

**Accuracy targets before deploying:**

- ✓ > 85% overall accuracy
- ✓ < 5% false positives
- ✓ Test with 50+ real emails
