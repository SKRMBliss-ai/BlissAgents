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

const startBot = async ({ text, title, hashtags, groups, imagePath, broadcast }) => {
  isRunning = true;
  shouldStop = false;

  const successfulGroups = [];
  const failedGroups = [];

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

    const fullText = title ? `${title}\n\n${text}\n\n${hashtags}` : `${text}\n\n${hashtags}`;

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
            await delay(1000, 2000);
            
            // Check if dialog opened, if not, try clicking again with force
            let dialogCount = await page.locator('div[role="dialog"]:visible').count();
            if (dialogCount === 0) {
                await writeBox.click({ force: true });
                await delay(2000, 3000);
            }
        } else {
            broadcast('log', { message: 'Could not find the post input box. Skipping.', type: 'error' });
            continue;
        }

        await delay(2000, 3000);

        // Upload image if provided
        if (imagePath) {
          broadcast('log', { message: 'Uploading image...', type: 'info' });
          let imageUploaded = false;
          let dialog = page.locator('div[role="dialog"]:visible').first();
          try {
              if (await dialog.count() === 0) {
                  throw new Error("Create Post dialog did not open!");
              }

              // Strategy 1: Find the native file input directly inside the dialog
              const fileInput = dialog.locator('input[type="file"]');
              if (await fileInput.count() > 0) {
                  broadcast('log', { message: 'Found hidden file input, injecting media...', type: 'info' });
                  await fileInput.first().setInputFiles(imagePath);
                  await delay(5000, 7000);
                  imageUploaded = true;
              }

              if (!imageUploaded) {
                  // Strategy 2: Click the visible "Photo/video" button inside the dialog
                  const photoButton = dialog.locator('div[aria-label*="Photo" i][role="button"]:visible, div[role="button"]:has-text("Photo"):visible, div[role="button"]:has-text("Video"):visible').first();
                  
                  if (await photoButton.count() > 0) {
                      try {
                          const [fileChooser] = await Promise.all([
                              page.waitForEvent('filechooser', { timeout: 3000 }), // Wait 3s to see if it pops up native file picker
                              photoButton.click()
                          ]);
                          await fileChooser.setFiles(imagePath);
                          await delay(5000, 7000);
                          imageUploaded = true;
                      } catch (e) {
                          // Timed out waiting for file chooser. The button likely just expanded the dropzone.
                          await delay(1000, 2000); 
                      }
                  }
              }

              if (!imageUploaded) {
                  // Strategy 3: The dropzone should now be visible inside the dialog
                  // A very robust selector for the Facebook dropzone box
                  const dropzone = dialog.locator('div[role="button"]:has-text("Add photos"), div[aria-label*="Add photos" i], div[role="button"]:has-text("Add video")').first();
                  
                  if (await dropzone.count() > 0) {
                      const [fileChooser] = await Promise.all([
                          page.waitForEvent('filechooser', { timeout: 8000 }),
                          dropzone.click()
                      ]);
                      await fileChooser.setFiles(imagePath);
                      await delay(5000, 7000);
                      imageUploaded = true;
                  } else {
                      throw new Error("Dropzone element could not be located on the screen");
                  }
              }
          } catch (e) {
              broadcast('log', { message: `Image upload failed entirely: ${e.message}`, type: 'warning' });
          }

          // Strict validation: Do not post without the image
          if (!imageUploaded) {
              throw new Error("FATAL: Failed to upload image. Aborting post for this group to prevent text-only posting.");
          }

          // We removed the 'Edit' button click because Facebook Reels do not have Title/Tag fields in the Edit menu.
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
        
        broadcast('log', { message: `Auto-approving post for Group ${i + 1}...`, type: 'info' });
        await delay(3000, 5000); // Small pause to look human before clicking Post
        if (shouldStop) {
            broadcast('log', { message: 'Bot stopped.', type: 'info' });
            break;
        }

        // Click Post button
        const postButton = page.locator('div[aria-label="Post"][role="button"]').first();
        await postButton.click({ force: true });

        // Wait for post to finish
        await delay(5000, 8000);
        
        const resultScreenshot = await takeScreenshot(page, 'success');
        broadcast('screenshot', resultScreenshot);
        broadcast('log', { message: `Successfully posted to group ${i + 1}.`, type: 'success' });
        successfulGroups.push(groupUrl);

        if (i < groups.length - 1) {
           const waitTime = Math.floor(Math.random() * (300 - 180 + 1) + 180); // 3 to 5 minutes
           broadcast('log', { message: `Waiting ${waitTime} seconds before next group...`, type: 'info' });
           await delay(waitTime * 1000, waitTime * 1000);
        }

      } catch (err) {
        broadcast('log', { message: `Error posting to group ${i+1}: ${err.message}`, type: 'error' });
        broadcast('failed_group', groupUrl);
        failedGroups.push(groupUrl);
      }
    }

    await page.close();
    broadcast('log', { message: 'All groups processed.', type: 'success' });

    // Save to history
    const LOG_FILE = path.join(__dirname, 'post_history.json');
    let history = [];
    if (fs.existsSync(LOG_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        } catch (e) {}
    }
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    history = history.filter(run => new Date(run.timestamp) > fortyEightHoursAgo);
    
    history.unshift({
        timestamp: new Date().toISOString(),
        text: title ? `${title} - ${text.substring(0, 30)}...` : text.substring(0, 50) + '...',
        totalAttempted: groups.length,
        successfulGroups,
        failedGroups
    });
    fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));

  } catch (err) {
    throw err;
  } finally {
    isRunning = false;
    shouldStop = false;
  }
};

module.exports = { startBot, stopBot, approvePost };
