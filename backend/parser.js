const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function processTranscript() {
  const transcriptPath = 'C:\\Users\\shrut\\.gemini\\antigravity\\brain\\717b1a90-b75a-419a-9c01-f1c65ab58d42\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let rawText = '';
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT' && obj.content && obj.content.includes('The most important thing you can do in life is recognize that you are not your mind')) {
        // Find the text block containing the chapters
        const startIdx = obj.content.indexOf('The Mind');
        if (startIdx !== -1) {
          rawText = obj.content.substring(startIdx);
          // remove any trailing tags if they exist
          rawText = rawText.replace(/<\/USER_REQUEST>[\s\S]*/, '');
        }
      }
    } catch (e) {
      // Ignore parse errors on individual lines
    }
  }

  if (!rawText) {
    console.error('Could not find the target text in transcript.jsonl');
    process.exit(1);
  }

  // Parse the rawText
  const lines = rawText.split(/\r?\n/).map(l => l.trim());
  const bookName = "Living Untethered (Q&A)";
  const parsedData = { [bookName]: {} };
  
  let currentChapter = null;
  let currentQNum = null;
  let currentQuestion = null;
  let currentAnswer = [];
  let buffer = []; // Used to collect chapter title and intro before a question hits

  const qNumRegex = /^\d+-\d+$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip empty lines

    if (qNumRegex.test(line)) {
      // It's a question number!
      
      // If we had a previous question, save its answer
      if (currentQNum && currentQuestion) {
        parsedData[bookName][currentChapter].questions[currentQNum] = {
          q: currentQuestion,
          a: currentAnswer.join('\n\n')
        };
      }

      // If this is the FIRST question of a new chapter (e.g. 1-1, 2-1, 3-1),
      // the buffer contains the chapter title (first line) and intro (rest)
      if (line.endsWith('-1')) {
        currentChapter = buffer[0]; // First line of buffer is chapter title
        parsedData[bookName][currentChapter] = {
          name: currentChapter,
          intro: buffer.slice(1).join('\n\n'),
          questions: {}
        };
      }

      currentQNum = line;
      // The next non-empty line is the question text
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      if (j < lines.length) {
        currentQuestion = lines[j];
        i = j; // Skip the question line
      }
      currentAnswer = [];
      buffer = []; // Clear buffer since we are now in Q&A mode
    } else {
      // It's either part of an answer or part of a new chapter intro
      if (currentQNum) {
        // We are collecting an answer
        // BUT wait, what if this is a new chapter title?
        // A new chapter title comes AFTER an answer finishes, before the next X-1.
        // Actually, if it's not a question number, it could be the start of a new chapter.
        // Let's assume if it doesn't match qNumRegex, it's just answer text.
        // We will only know it's a new chapter when we hit the NEXT X-1!
        // To fix this: if we hit a line that is NOT a question number, we add it to the answer.
        // BUT if later we hit an X-1, we realize the last few lines were actually the chapter title/intro!
        
        // Simpler approach: Just collect everything into currentAnswer.
        // When we hit an X-1, we look at the currentAnswer. The last paragraph(s) of currentAnswer 
        // might actually be the Title and Intro of the NEW chapter.
        currentAnswer.push(line);
      } else {
        // We haven't hit the first question yet, so we are in the very first chapter intro
        buffer.push(line);
      }
    }
  }

  // Save the final question
  if (currentQNum && currentQuestion) {
    parsedData[bookName][currentChapter].questions[currentQNum] = {
      q: currentQuestion,
      a: currentAnswer.join('\n\n')
    };
  }

  // Refine: The answers might accidentally contain the NEXT chapter's title and intro at the very end.
  // We need to clean that up.
  // If chapter N+1 starts at question (N+1)-1, then the lines immediately preceding (N+1)-1 
  // belong to chapter N+1's title and intro, NOT the previous question's answer.
  
  const finalData = { [bookName]: {} };
  
  // Let's do a second pass parser that's much safer:
  // Split the whole text by the question numbers.
  const chunks = [];
  let currentChunk = [];
  for (const line of lines) {
    if (qNumRegex.test(line)) {
      chunks.push(currentChunk);
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }
  }
  chunks.push(currentChunk);

  // chunks[0] is the first chapter title + intro
  // chunks[1] is "1-1", "Question...", "Answer..." + maybe next chapter title/intro at the end
  // To detect where an answer ends and a chapter intro begins:
  // A chapter title/intro only appears at the end of the chunk right before an X-1 chunk.
  
  let currentChapName = chunks[0][0];
  finalData[bookName][currentChapName] = { name: currentChapName, questions: {} };

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.length === 0) continue;
    
    const qNum = chunk[0];
    const qText = chunk[1];
    let aLines = chunk.slice(2);
    
    // If there is a NEXT chunk, and its qNum ends with '-1', it means THIS chunk has the next chapter's intro at the end.
    if (i + 1 < chunks.length && chunks[i+1].length > 0 && chunks[i+1][0].endsWith('-1')) {
      // The next chapter title and intro are at the end of aLines.
      // Usually, a chapter title is just 1 short line, followed by a paragraph of intro.
      // Let's assume the last 2 items in aLines are the Title and Intro.
      // Or we can look for the last line that is short and has no punctuation?
      // "Emotions"
      // "Emotions are not your enemy..."
      // Let's just take the last 2 elements of aLines if they exist.
      if (aLines.length >= 2) {
        const nextIntro = aLines.pop();
        const nextTitle = aLines.pop();
        finalData[bookName][nextTitle] = { name: nextTitle, questions: {} };
        currentChapName = nextTitle;
      }
    }
    
    // Whatever is left in aLines is the answer
    finalData[bookName][currentChapName] = finalData[bookName][currentChapName] || { name: currentChapName, questions: {} };
    finalData[bookName][currentChapName].questions[qNum] = {
      q: qText,
      a: aLines.join('\n\n')
    };
  }

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  fs.writeFileSync(path.join(dataDir, 'books.json'), JSON.stringify(finalData, null, 2));
  console.log('Successfully parsed and saved books.json!');
}

processTranscript().catch(console.error);
