# Google Business Profile Auto-Poster

Automated posting to Google Business Profile using Playwright browser automation and node-cron scheduling.

## Features

- 🤖 **Automated Posting**: Schedules and publishes posts to your Google Business Profile
- ⏰ **Flexible Scheduling**: Configurable cron expressions for any posting frequency
- 🔄 **Retry Logic**: Automatic retries with exponential backoff on failures
- 📝 **Content Rotation**: Support for rotating through multiple post templates
- 📸 **Image Support**: Optional image uploads with posts
- 🔗 **Call-to-Action Buttons**: Add clickable buttons to your posts
- 📊 **Comprehensive Logging**: Winston-based logging with file and console output
- 🔒 **Secure Credentials**: Environment variable-based configuration

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- A Google account with access to Google Business Profile
- Chromium browser (installed automatically by Playwright)

## Quick Start

### 1. Install Dependencies

```bash
cd gbp-auto-poster
npm install
npm run install:browsers
```

### 2. Configure Credentials

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-password
BUSINESS_NAME=Your Business Name
SCHEDULE_CRON=0 9 * * *
TIMEZONE=America/New_York
```

### 3. Run the Scheduler

```bash
# Build and run
npm run build
npm start

# Or run in development mode
npm run dev
```

### 4. Test with a Single Post

```bash
npm run post:once -- --text "Hello from automated posting!"
```

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_EMAIL` | Your Google account email |
| `GOOGLE_PASSWORD` | Your Google password or App Password |
| `BUSINESS_NAME` | Your business name as shown in Google |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULE_CRON` | `0 9 * * *` | Cron expression for scheduling |
| `TIMEZONE` | `America/New_York` | Timezone for scheduler |
| `HEADLESS` | `true` | Run browser in headless mode |
| `SLOW_MO` | `0` | Slow down browser actions (ms) |
| `TIMEOUT` | `30000` | Operation timeout (ms) |
| `MAX_RETRIES` | `3` | Max retry attempts |
| `RETRY_DELAY` | `5000` | Initial retry delay (ms) |
| `LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |
| `LOG_FILE` | `logs/gbp-poster.log` | Log file path |

### Cron Expression Examples

| Expression | Schedule |
|------------|----------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9,18 * * *` | Every day at 9:00 AM and 6:00 PM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 12 * * 1` | Every Monday at noon |
| `*/5 * * * *` | Every 5 minutes (testing) |

## Post Content

### Option 1: Environment Variables

Set default content in `.env`:

```env
DEFAULT_POST_TEXT=Check out our latest updates!
DEFAULT_BUTTON_URL=https://your-website.com
DEFAULT_BUTTON_TEXT=Learn More
```

### Option 2: JSON File (Rotation)

Create `posts.json` to rotate through multiple posts:

```json
[
  {
    "text": "Happy Monday! Visit us today!",
    "buttonUrl": "https://your-website.com",
    "buttonText": "Learn More"
  },
  {
    "text": "Check out our weekend specials!",
    "buttonUrl": "https://your-website.com/deals",
    "buttonText": "View Deals"
  }
]
```

The system will automatically rotate through posts based on the day of the year.

### Option 3: Custom Content Provider

Modify `src/index.ts` to fetch content from your API or database.

## Authentication & 2-Step Verification

### If You Have 2FA Enabled (Recommended)

Google accounts with 2-Step Verification require an **App Password**:

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" and "Windows Computer" (or any option)
3. Click "Generate"
4. Use the 16-character password in your `.env` file

```env
GOOGLE_PASSWORD=xxxx xxxx xxxx xxxx
```

### Manual 2FA Completion (Alternative)

If you can't use App Passwords:

1. Set `HEADLESS=false` in `.env`
2. Run the scheduler
3. Complete 2FA manually in the browser window
4. The session will be saved for future runs

### Without 2FA

Simply use your regular Google password (not recommended for security).

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run install:browsers` | Install Playwright browsers |
| `npm run build` | Compile TypeScript |
| `npm start` | Run the scheduler (production) |
| `npm run dev` | Run in development mode |
| `npm run post:once` | Run a single post immediately |

### Single Post Options

```bash
npm run post:once -- --text "Custom post text"
npm run post:once -- --text "Visit us!" --url "https://example.com"
npm run post:once -- --text "New photo!" --image "./photo.jpg"
npm run post:once -- --help
```

## Deployment

### Running as a Service (systemd)

Create `/etc/systemd/system/gbp-poster.service`:

```ini
[Unit]
Description=Google Business Profile Auto-Poster
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/gbp-auto-poster
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable gbp-poster
sudo systemctl start gbp-poster
sudo systemctl status gbp-poster
```

### Running with PM2

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name gbp-poster
pm2 save
pm2 startup
```

### Docker (Optional)

Create a `Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.1-focal
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

## Logging

Logs are written to:
- `logs/gbp-poster.log` - All logs
- `logs/error.log` - Errors only
- Console output

Screenshots are saved to `logs/screenshots/` for debugging.

## Troubleshooting

### "Could not find Create post button"

Google frequently updates their UI. The selectors may need updating. Run with `HEADLESS=false` to see the actual page and check for UI changes.

### "2-Step Verification required"

Use an App Password. See the Authentication section above.

### Login Fails

1. Check credentials in `.env`
2. Try with `HEADLESS=false` to see what's happening
3. Check for CAPTCHA or unusual activity warnings
4. Verify your Google account isn't locked

### Browser Doesn't Launch

```bash
npm run install:browsers
```

### Permission Denied

Ensure the working directory is writable for logs and screenshots.

## Limitations

1. **2-Step Verification**: Cannot be fully automated. Use App Passwords.
2. **CAPTCHA**: Cannot be bypassed. Manual intervention may be needed.
3. **Google UI Changes**: Selectors may break when Google updates their interface.
4. **Rate Limiting**: Google may temporarily block excessive posting.
5. **Account Security**: Unusual login locations may trigger security prompts.

## Project Structure

```
gbp-auto-poster/
├── src/
│   ├── index.ts        # Main entry point with scheduler
│   ├── poster.ts       # Core posting automation
│   ├── scheduler.ts    # Cron scheduling logic
│   ├── config.ts       # Configuration management
│   ├── logger.ts       # Winston logging setup
│   └── run-once.ts     # Single post testing script
├── logs/               # Log files (gitignored)
├── .env.example        # Example configuration
├── .env                # Your configuration (gitignored)
├── posts.json          # Optional post rotation file
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript configuration
```

## License

MIT
