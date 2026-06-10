const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

let browserContext = null;
let isRunning = false;
let shouldStop = false;
let manualApprovalPromise = null;
let manualApprovalResolve = null;

// Helper to wait random amount of time (humanized delays)
const delay = (min, max) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1) + min)));

const initBrowser = async () => {
  const userDataDir = path.join(__dirname, 'playwright_data');
  // Use persistent context to keep login session
  browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Must be false for Facebook to reduce bot detection & allow manual review
    viewport: null, // use default
    args: ['--disable-blink-features=AutomationControlled'] // basic stealth
  });
  return browserContext;
};

const stopBot = () => {
  shouldStop = true;
  if (manualApprovalResolve) {
    manualApprovalResolve(false); // Reject manual approval
  }
};

const approvePost = () => {
  if (manualApprovalResolve) {
    manualApprovalResolve(true);
  }
};

const takeScreenshot = async (page, name) => {
  const dir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const filename = `${name}-${Date.now()}.png`;
  const filepath = path.join(dir, filename);
  await page.screenshot({ path: filepath });
  return filename;
};

const startBot = async ({ text, hashtags, groups, imagePath, broadcast }) => {
  isRunning = true;
  shouldStop = false;

  try {
    let page;
    try {
        if (!browserContext) {
            broadcast('log', { message: 'Initializing browser...', type: 'info' });
            await initBrowser();
        }
        page = await browserContext.newPage();
    } catch (err) {
        broadcast('log', { message: 'Browser was closed. Re-initializing...', type: 'info' });
        await initBrowser();
        page = await browserContext.newPage();
    }
    
    // Initial Facebook check
    broadcast('log', { message: 'Navigating to Facebook to check login status...', type: 'info' });
    await page.goto('https://www.facebook.com/');
    
    // Check if logged in (look for composer or user nav)
    const isLoggedIn = await page.locator('[role="navigation"]').count() > 0;
    if (!isLoggedIn) {
      broadcast('log', { message: 'You are not logged in to Facebook. Please log in manually in the opened browser window.', type: 'warning' });
      broadcast('state', 'waiting_login');
      
      // Wait until user logs in manually
      await page.waitForSelector('[role="navigation"]', { timeout: 0 }); // wait forever
      broadcast('log', { message: 'Login detected! Proceeding...', type: 'success' });
      broadcast('state', 'running');
    }

    const fullText = `${text}\n\n${hashtags}`;

    for (let i = 0; i < groups.length; i++) {
      if (shouldStop) break;
      
      const groupUrl = groups[i];
      broadcast('log', { message: `Opening group ${i + 1}/${groups.length}: ${groupUrl}`, type: 'info' });
      
      try {
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
        await delay(3000, 5000); // Wait for page to settle
        
        // Find "Write something..." or "What's on your mind?" box.
        let writeBox = page.locator('div[role="button"]:has-text("Write something")').first();
        if (await writeBox.count() === 0) {
            writeBox = page.locator('div[role="button"]:has-text("What\'s on your mind")').first(); // For personal profiles/pages
        }
        if (await writeBox.count() === 0) {
            writeBox = page.locator('div:text("Create a public post")').first();
        }
        if (await writeBox.count() === 0) {
            writeBox = page.locator('span:text("Create post")').first(); // For Pages
        }
        
        if (await writeBox.count() > 0) {
            await writeBox.click();
        } else {
            broadcast('log', { message: 'Could not find the post input box. Skipping.', type: 'error' });
            continue;
        }

        await delay(2000, 3000);

        // Upload image if provided
        if (imagePath) {
          broadcast('log', { message: 'Uploading image...', type: 'info' });
          try {
              const dialog = page.locator('div[role="dialog"]').first();
              const photoButton = dialog.locator('[aria-label="Photo/video" i]').first();
              
              const [fileChooser] = await Promise.all([
                  page.waitForEvent('filechooser', { timeout: 10000 }),
                  photoButton.click()
              ]);
              await fileChooser.setFiles(imagePath);
              await delay(5000, 7000); // Wait for the image preview to load
          } catch (e) {
              broadcast('log', { message: 'Button click failed. Trying direct input...', type: 'warning' });
              const dialog = page.locator('div[role="dialog"]').first();
              const fileInput = dialog.locator('input[type="file"]').first();
              if (await fileInput.count() > 0) {
                 await fileInput.setInputFiles(imagePath);
                 await delay(5000, 7000);
              } else {
                 broadcast('log', { message: 'Could not find image upload button.', type: 'error' });
              }
          }
        }

        // Type text
        broadcast('log', { message: 'Typing post text...', type: 'info' });
        
        // The active editable div
        const editor = page.locator('div[role="textbox"][contenteditable="true"]').last();
        await editor.click();
        await delay(500, 1000);
        
        // Explicitly hold Shift for every newline to force a soft break (<br>) instead of a paragraph block (<p>)
        for (const char of fullText) {
            if (char === '\n') {
                await page.keyboard.down('Shift');
                await page.keyboard.press('Enter');
                await page.keyboard.up('Shift');
                await delay(50, 100);
            } else {
                await page.keyboard.type(char, { delay: 40 }); // slightly faster human typing
            }
        }
        
        broadcast('log', { message: 'Post prepared. Waiting for manual approval...', type: 'warning' });
        broadcast('state', 'waiting_approval');
        
        // Take screenshot of the prepared post
        const screenshotName = await takeScreenshot(page, 'prepared');
        broadcast('screenshot', screenshotName);

        // Wait for user to click "Approve"
        manualApprovalPromise = new Promise((resolve) => {
          manualApprovalResolve = resolve;
        });
        
        const approved = await manualApprovalPromise;
        manualApprovalPromise = null;
        manualApprovalResolve = null;

        if (!approved || shouldStop) {
           broadcast('log', { message: 'Post skipped or bot stopped.', type: 'info' });
           broadcast('state', 'running');
           continue;
        }

        broadcast('log', { message: 'Post approved! Submitting...', type: 'success' });
        broadcast('state', 'running');

        // Click Post button
        const postButton = page.locator('div[aria-label="Post"][role="button"]').first();
        await postButton.click();

        // Wait for post to finish
        await delay(5000, 8000);
        
        const resultScreenshot = await takeScreenshot(page, 'success');
        broadcast('screenshot', resultScreenshot);
        broadcast('log', { message: `Successfully posted to group ${i + 1}.`, type: 'success' });

        if (i < groups.length - 1) {
           const waitTime = Math.floor(Math.random() * (120 - 60 + 1) + 60); // 60-120 seconds
           broadcast('log', { message: `Waiting ${waitTime} seconds before next group...`, type: 'info' });
           await delay(waitTime * 1000, waitTime * 1000);
        }

      } catch (err) {
        broadcast('log', { message: `Error posting to group ${i+1}: ${err.message}`, type: 'error' });
      }
    }

    await page.close();
    broadcast('log', { message: 'All groups processed.', type: 'success' });

  } catch (err) {
    throw err;
  } finally {
    isRunning = false;
    shouldStop = false;
  }
};

module.exports = { startBot, stopBot, approvePost };
