const fs = require('fs');
const path = require('path');

function parseBook() {
  const rawPath = path.join(__dirname, 'data', 'raw_book.txt');
  if (!fs.existsSync(rawPath)) {
    console.error("raw_book.txt not found!");
    process.exit(1);
  }

  const rawText = fs.readFileSync(rawPath, 'utf8');
  const lines = rawText.split(/\r?\n/).map(l => l.trim());
  
  const qNumRegex = /^(\d+)-(\d+)$/;
  const chunks = [];
  let currentChunk = [];
  
  for (const line of lines) {
    if (qNumRegex.test(line)) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const bookName = "Wisdom Untethered";
  const finalData = { [bookName]: {} };
  
  // chunks[0] contains the first chapter title and intro
  // Find the first non-empty line as the chapter title
  let firstTitle = "Chapter 1";
  for (const line of chunks[0]) {
    if (line) {
      firstTitle = line;
      break;
    }
  }
  
  let currentChapName = firstTitle;
  finalData[bookName][currentChapName] = { name: currentChapName, questions: {} };

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const qNum = chunk[0]; // e.g. "1-1"
    
    // Find the next non-empty line as the question text
    let qText = "";
    let aStartIdx = 1;
    for (let j = 1; j < chunk.length; j++) {
      if (chunk[j]) {
        qText = chunk[j];
        aStartIdx = j + 1;
        break;
      }
    }
    
    let aLines = chunk.slice(aStartIdx);
    
    // Check if THIS chunk contains the NEXT chapter's title and intro at the end.
    // This happens if the NEXT chunk exists and its question number ends with "-1" (e.g. "2-1")
    if (i + 1 < chunks.length && chunks[i+1][0].endsWith('-1')) {
      // Find the chapter title by searching backwards for a short line without ending punctuation
      let titleIdx = -1;
      let nextTitle = `Chapter`;
      for (let k = aLines.length - 1; k >= 0; k--) {
        const line = aLines[k];
        if (!line) continue;
        if (line.length < 100 && !/[.?!:"]$/.test(line)) {
          titleIdx = k;
          nextTitle = line;
          break;
        }
      }
      
      if (titleIdx !== -1) {
        // Trim the answer lines
        const actualAnswer = aLines.slice(0, titleIdx);
        aLines = actualAnswer;
        
        finalData[bookName][nextTitle] = { name: nextTitle, questions: {} };
        currentChapName = nextTitle;
      }
    }
    
    // Save the Q&A to the current chapter BEFORE currentChapName was updated for the next iteration!
    // Wait, if currentChapName is updated at the END of chunk i, then chunk i belongs to the OLD chapter.
    // So we need to use the old chapter name!
    // Let's store the current chapter name before updating it.
    const chapToSaveTo = (i + 1 < chunks.length && chunks[i+1][0].endsWith('-1')) 
      ? Object.keys(finalData[bookName])[Object.keys(finalData[bookName]).length - 2] || currentChapName 
      : currentChapName;
      
    // Actually, a simpler way:
    // The question "1-x" belongs to the chapter we are CURRENTLY in.
    // So we save it to currentChapName.
    // THEN we update currentChapName for the NEXT chunk.
    finalData[bookName][currentChapName].questions[qNum] = {
      q: qText,
      a: aLines.filter(l => l !== '').join('\n\n')
    };

    // Wait, if I updated currentChapName ABOVE, then I'm saving it to the NEW chapter!
    // Let's fix the logic:
    // 1. Save to currentChapName.
    // 2. If next chunk is X-1, extract next title from end of aLines and set currentChapName = nextTitle.
    // Let's rewrite the inner loop properly.
  }

  // Rewrite inner loop for correctness
  finalData[bookName] = {};
  currentChapName = firstTitle;
  finalData[bookName][currentChapName] = { name: currentChapName, questions: {} };

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const qNum = chunk[0];
    let qText = "";
    let aStartIdx = 1;
    for (let j = 1; j < chunk.length; j++) {
      if (chunk[j]) {
        qText = chunk[j];
        aStartIdx = j + 1;
        break;
      }
    }
    let aLines = chunk.slice(aStartIdx);
    
    let nextTitle = null;
    if (i + 1 < chunks.length && chunks[i+1][0].endsWith('-1')) {
      for (let k = aLines.length - 1; k >= 0; k--) {
        const line = aLines[k];
        if (!line) continue;
        if (line.length < 100 && !/[.?!:"]$/.test(line)) {
          nextTitle = line;
          aLines = aLines.slice(0, k);
          break;
        }
      }
    }
    
    finalData[bookName][currentChapName].questions[qNum] = {
      q: qText,
      a: aLines.join('\n\n').trim()
    };
    
    if (nextTitle) {
      currentChapName = nextTitle;
      finalData[bookName][currentChapName] = { name: currentChapName, questions: {} };
    }
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'books.json'), JSON.stringify(finalData, null, 2));
  console.log("Successfully parsed raw_book.txt into books.json!");
}

parseBook();
