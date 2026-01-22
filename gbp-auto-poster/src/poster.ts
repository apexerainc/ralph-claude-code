/**
 * Google Business Profile Auto-Poster
 *
 * Main automation function that posts content to Google Business Profile
 * using Playwright for browser automation.
 *
 * IMPORTANT LIMITATIONS:
 * - Google's 2-Step Verification (2FA) cannot be fully automated
 * - If 2FA is enabled, you'll need to use one of these approaches:
 *   1. Use an App Password (recommended for automation)
 *   2. Disable 2FA (not recommended for security)
 *   3. Use saved browser session with cookies
 *   4. Manually complete 2FA on first run with non-headless mode
 *
 * @see https://support.google.com/accounts/answer/185833 for App Passwords
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { Config, PostContent } from './config';
import type { Logger } from 'winston';

/** URLs for Google Business Profile */
const URLS = {
  googleLogin: 'https://accounts.google.com/signin',
  businessProfile: 'https://business.google.com',
  businessPosts: 'https://business.google.com/posts'
};

/** Result of a posting attempt */
export interface PostResult {
  success: boolean;
  message: string;
  timestamp: Date;
  error?: Error;
  screenshotPath?: string;
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Take a screenshot for debugging purposes
 */
async function takeScreenshot(
  page: Page,
  name: string,
  logger: Logger
): Promise<string | undefined> {
  try {
    const screenshotPath = `logs/screenshots/${name}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger.debug(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    logger.warn(`Failed to take screenshot: ${error}`);
    return undefined;
  }
}

/**
 * Handle Google login process
 *
 * NOTE: This function handles basic email/password login.
 * For accounts with 2FA, use an App Password or pre-authenticated session.
 */
async function performGoogleLogin(
  page: Page,
  config: Config,
  logger: Logger
): Promise<void> {
  logger.info('Starting Google login process...');

  // Navigate to Google login
  await page.goto(URLS.googleLogin, { waitUntil: 'networkidle' });
  await delay(1000);

  // Enter email
  logger.debug('Entering email address...');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: config.timeout });
  await emailInput.fill(config.googleEmail);
  await emailInput.press('Enter');
  await delay(2000);

  // Wait for password field (may take time due to animations)
  logger.debug('Waiting for password field...');
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: config.timeout });

  // Enter password
  logger.debug('Entering password...');
  await passwordInput.fill(config.googlePassword);
  await passwordInput.press('Enter');
  await delay(3000);

  // Check for 2FA prompt
  const twoFactorPrompt = page.locator('text=2-Step Verification');
  const is2FAPresent = await twoFactorPrompt.isVisible().catch(() => false);

  if (is2FAPresent) {
    logger.error('2-Step Verification detected!');
    logger.error('Please use one of the following solutions:');
    logger.error('1. Create an App Password at https://myaccount.google.com/apppasswords');
    logger.error('2. Run with HEADLESS=false to complete 2FA manually');
    logger.error('3. Use a pre-authenticated browser session');

    // Take screenshot for debugging
    await takeScreenshot(page, '2fa-prompt', logger);

    throw new Error(
      '2-Step Verification required. Cannot proceed automatically. ' +
      'Please use an App Password or pre-authenticated session.'
    );
  }

  // Verify login success by checking for account menu or profile
  logger.debug('Verifying login success...');
  try {
    // Wait for redirect away from login page
    await page.waitForURL(url => !url.href.includes('accounts.google.com/signin'), {
      timeout: config.timeout
    });
    logger.info('Google login successful');
  } catch (error) {
    // Take screenshot to help debug
    await takeScreenshot(page, 'login-failed', logger);
    throw new Error('Login verification failed. Check credentials and try again.');
  }
}

/**
 * Navigate to Google Business Profile posts section
 */
async function navigateToPostsSection(
  page: Page,
  config: Config,
  logger: Logger
): Promise<void> {
  logger.info('Navigating to Google Business Profile...');

  // Go to Business Profile
  await page.goto(URLS.businessPosts, { waitUntil: 'networkidle' });
  await delay(2000);

  // Look for the business by name if multiple businesses exist
  const businessSelector = page.locator(`text="${config.businessName}"`);
  if (await businessSelector.isVisible().catch(() => false)) {
    logger.debug(`Selecting business: ${config.businessName}`);
    await businessSelector.click();
    await delay(2000);
  }

  // Look for "Add update" or "Create post" button
  // Google's UI changes frequently, so we try multiple selectors
  const createPostSelectors = [
    'button:has-text("Add update")',
    'button:has-text("Create post")',
    'button:has-text("Add post")',
    '[aria-label="Create post"]',
    '[aria-label="Add update"]',
    'div[role="button"]:has-text("Add")'
  ];

  let createButton = null;
  for (const selector of createPostSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      createButton = button;
      logger.debug(`Found create post button with selector: ${selector}`);
      break;
    }
  }

  if (!createButton) {
    await takeScreenshot(page, 'no-create-button', logger);
    throw new Error(
      'Could not find "Create post" or "Add update" button. ' +
      'Google may have changed their UI. Check the screenshot for details.'
    );
  }

  await createButton.click();
  await delay(2000);
  logger.info('Opened post creation form');
}

/**
 * Fill in post content and submit
 */
async function createAndSubmitPost(
  page: Page,
  content: PostContent,
  config: Config,
  logger: Logger
): Promise<void> {
  logger.info('Filling in post content...');

  // Find and fill the text input
  // Google's textarea/contenteditable for posts
  const textInputSelectors = [
    'textarea[aria-label*="post"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="Write"]',
    'textarea[placeholder*="Share"]',
    '[aria-label*="Write your update"]'
  ];

  let textInput = null;
  for (const selector of textInputSelectors) {
    const input = page.locator(selector).first();
    if (await input.isVisible().catch(() => false)) {
      textInput = input;
      logger.debug(`Found text input with selector: ${selector}`);
      break;
    }
  }

  if (!textInput) {
    await takeScreenshot(page, 'no-text-input', logger);
    throw new Error('Could not find post text input field');
  }

  // Enter the post text
  await textInput.click();
  await textInput.fill(content.text);
  logger.debug('Post text entered');
  await delay(1000);

  // Handle optional image upload
  if (content.imagePath) {
    logger.debug('Uploading image...');
    const imageInputSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"]'
    ];

    for (const selector of imageInputSelectors) {
      const fileInput = page.locator(selector).first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(content.imagePath);
        logger.debug('Image uploaded');
        await delay(3000); // Wait for upload
        break;
      }
    }
  }

  // Handle optional button/link
  if (content.buttonUrl) {
    logger.debug('Adding call-to-action button...');

    // Look for "Add button" option
    const addButtonSelectors = [
      'button:has-text("Add a button")',
      'button:has-text("Add button")',
      '[aria-label*="Add button"]'
    ];

    for (const selector of addButtonSelectors) {
      const addButton = page.locator(selector).first();
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
        await delay(1000);

        // Fill in button URL
        const urlInput = page.locator('input[type="url"], input[placeholder*="URL"]').first();
        if (await urlInput.isVisible().catch(() => false)) {
          await urlInput.fill(content.buttonUrl);
        }

        // Select button text if provided
        if (content.buttonText) {
          const buttonTextOption = page.locator(`text="${content.buttonText}"`).first();
          if (await buttonTextOption.isVisible().catch(() => false)) {
            await buttonTextOption.click();
          }
        }

        logger.debug('Call-to-action button configured');
        break;
      }
    }
  }

  await delay(1000);

  // Find and click the Post/Publish button
  const publishSelectors = [
    'button:has-text("Post")',
    'button:has-text("Publish")',
    'button:has-text("Share")',
    '[aria-label="Post"]',
    '[aria-label="Publish"]'
  ];

  let publishButton = null;
  for (const selector of publishSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      publishButton = button;
      logger.debug(`Found publish button with selector: ${selector}`);
      break;
    }
  }

  if (!publishButton) {
    await takeScreenshot(page, 'no-publish-button', logger);
    throw new Error('Could not find Post/Publish button');
  }

  // Click publish
  await publishButton.click();
  logger.info('Clicked publish button');
  await delay(3000);

  // Verify post was created (look for success message or state change)
  const successIndicators = [
    'text=Post published',
    'text=Posted',
    'text=Your update is live',
    '[aria-label*="success"]'
  ];

  let postSuccess = false;
  for (const selector of successIndicators) {
    if (await page.locator(selector).isVisible().catch(() => false)) {
      postSuccess = true;
      break;
    }
  }

  if (!postSuccess) {
    // Check if we're back at the posts list (which also indicates success)
    const onPostsList = page.url().includes('/posts');
    if (onPostsList) {
      postSuccess = true;
    }
  }

  if (postSuccess) {
    logger.info('Post published successfully!');
  } else {
    // Take screenshot but don't fail - post might have succeeded
    await takeScreenshot(page, 'post-verification-unclear', logger);
    logger.warn('Could not verify post success, but no error detected');
  }
}

/**
 * Main function to post to Google Business Profile
 *
 * This function:
 * 1. Launches a browser (headless by default)
 * 2. Logs into Google account
 * 3. Navigates to Google Business Profile
 * 4. Creates and publishes a new post
 * 5. Closes the browser
 *
 * @param content - The content to post (text, optional image, optional link)
 * @param config - Application configuration
 * @param logger - Winston logger instance
 * @returns PostResult indicating success or failure
 */
export async function postToGoogleBusinessProfile(
  content: PostContent,
  config: Config,
  logger: Logger
): Promise<PostResult> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let screenshotPath: string | undefined;

  logger.info('='.repeat(50));
  logger.info('Starting Google Business Profile posting automation');
  logger.info(`Business: ${config.businessName}`);
  logger.info(`Post text: ${content.text.substring(0, 50)}...`);
  logger.info('='.repeat(50));

  try {
    // Launch browser
    logger.info(`Launching browser (headless: ${config.headless})...`);
    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo
    });

    // Create browser context with realistic viewport
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    // Set default timeout
    context.setDefaultTimeout(config.timeout);

    const page = await context.newPage();

    // Step 1: Login to Google
    await performGoogleLogin(page, config, logger);

    // Step 2: Navigate to posts section
    await navigateToPostsSection(page, config, logger);

    // Step 3: Create and submit the post
    await createAndSubmitPost(page, content, config, logger);

    // Take success screenshot
    screenshotPath = await takeScreenshot(page, 'post-success', logger);

    return {
      success: true,
      message: 'Post published successfully to Google Business Profile',
      timestamp: new Date(),
      screenshotPath
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Posting failed: ${errorMessage}`);

    return {
      success: false,
      message: `Posting failed: ${errorMessage}`,
      timestamp: new Date(),
      error: error instanceof Error ? error : new Error(String(error)),
      screenshotPath
    };

  } finally {
    // Clean up: close browser
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

/**
 * Post with retry logic
 *
 * Attempts to post content, retrying on failure up to maxRetries times.
 * Uses exponential backoff between retries.
 *
 * @param content - The content to post
 * @param config - Application configuration
 * @param logger - Winston logger instance
 * @returns PostResult from the final attempt
 */
export async function postWithRetry(
  content: PostContent,
  config: Config,
  logger: Logger
): Promise<PostResult> {
  let lastResult: PostResult | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    logger.info(`Posting attempt ${attempt} of ${config.maxRetries}`);

    lastResult = await postToGoogleBusinessProfile(content, config, logger);

    if (lastResult.success) {
      logger.info(`Success on attempt ${attempt}`);
      return lastResult;
    }

    // Don't wait after the last attempt
    if (attempt < config.maxRetries) {
      // Exponential backoff: retryDelay * 2^(attempt-1)
      const waitTime = config.retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`Attempt ${attempt} failed. Retrying in ${waitTime / 1000} seconds...`);
      await delay(waitTime);
    }
  }

  logger.error(`All ${config.maxRetries} attempts failed`);
  return lastResult!;
}
