/**
 * Run a single post immediately (for testing)
 *
 * Use this script to test the posting functionality without waiting for the scheduler.
 * Run with: npm run post:once
 */

import { getConfig, getDefaultPostContent, PostContent } from './config';
import { initLogger } from './logger';
import { postWithRetry } from './poster';
import fs from 'fs';

/**
 * Parse command line arguments for custom post content
 */
function parseArgs(): Partial<PostContent> {
  const args = process.argv.slice(2);
  const content: Partial<PostContent> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--text':
      case '-t':
        content.text = args[++i];
        break;
      case '--image':
      case '-i':
        content.imagePath = args[++i];
        break;
      case '--url':
      case '-u':
        content.buttonUrl = args[++i];
        break;
      case '--button':
      case '-b':
        content.buttonText = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Google Business Profile - Single Post

Usage: npm run post:once -- [options]

Options:
  -t, --text <text>     Post text content
  -i, --image <path>    Path to image file
  -u, --url <url>       Call-to-action button URL
  -b, --button <text>   Call-to-action button text
  -h, --help            Show this help message

Examples:
  npm run post:once -- --text "Check out our new products!"
  npm run post:once -- -t "Visit us today" -u "https://example.com"
        `);
        process.exit(0);
    }
  }

  return content;
}

/**
 * Main function to run a single post
 */
async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Google Business Profile - Single Post                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Load configuration
  let config;
  try {
    config = getConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    console.error('');
    console.error('Please ensure you have created a .env file with the required credentials.');
    process.exit(1);
  }

  // Initialize logger
  const logger = initLogger(config.logLevel, config.logFile);

  // Ensure directories exist
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
  if (!fs.existsSync('logs/screenshots')) {
    fs.mkdirSync('logs/screenshots', { recursive: true });
  }

  // Get post content from args or defaults
  const argContent = parseArgs();
  const defaultContent = getDefaultPostContent();

  const content: PostContent = {
    text: argContent.text || defaultContent.text,
    imagePath: argContent.imagePath || defaultContent.imagePath,
    buttonUrl: argContent.buttonUrl || defaultContent.buttonUrl,
    buttonText: argContent.buttonText || defaultContent.buttonText
  };

  console.log('Post configuration:');
  console.log(`  - Business: ${config.businessName}`);
  console.log(`  - Text: ${content.text.substring(0, 50)}${content.text.length > 50 ? '...' : ''}`);
  console.log(`  - Image: ${content.imagePath || '(none)'}`);
  console.log(`  - Button URL: ${content.buttonUrl || '(none)'}`);
  console.log(`  - Headless mode: ${config.headless}`);
  console.log('');

  // Run the post
  console.log('Starting post...');
  const startTime = Date.now();

  const result = await postWithRetry(content, config, logger);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('═'.repeat(60));
  if (result.success) {
    console.log('✅ SUCCESS!');
    console.log(`   ${result.message}`);
  } else {
    console.log('❌ FAILED');
    console.log(`   ${result.message}`);
    if (result.error) {
      console.log(`   Error: ${result.error.message}`);
    }
  }
  console.log(`   Duration: ${duration}s`);
  if (result.screenshotPath) {
    console.log(`   Screenshot: ${result.screenshotPath}`);
  }
  console.log('═'.repeat(60));
  console.log('');

  process.exit(result.success ? 0 : 1);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
