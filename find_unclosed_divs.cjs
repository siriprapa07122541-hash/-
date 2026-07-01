const fs = require('fs');
const content = fs.readFileSync('./src/App.tsx', 'utf8');
const lines = content.split('\n');

const stack = [];
const selfClosingTags = ['img', 'input', 'br', 'hr', 'link', 'meta'];

function parseLine(line, lineNum) {
  // Simple regex to find HTML tags on this line
  const tagRegex = /<\/?[a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+(?:="[^"]*"|='[^']*'|=\{[^\}]*\}|[^\s>]*))*\s*\/?>/g;
  let match;
  while ((match = tagRegex.exec(line)) !== null) {
    const fullTag = match[0];
    if (fullTag.startsWith('<!--') || fullTag.startsWith('{/*')) continue;
    
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>') || selfClosingTags.some(t => fullTag.toLowerCase().startsWith('<' + t));
    
    const tagNameMatch = fullTag.match(/<\/?([a-zA-Z0-9_\-]+)/);
    if (!tagNameMatch) continue;
    const tagName = tagNameMatch[1];
    
    if (tagName === 'div') {
      if (isClosing) {
        if (stack.length > 0) {
          stack.pop();
        } else {
          console.log(`Unmatched closing </div> at line ${lineNum}: ${line.trim()}`);
        }
      } else if (!isSelfClosing) {
        stack.push({ lineNum, line: line.trim() });
      }
    }
  }
}

// Trace from line 1878 to 2816
for (let i = 1877; i < 2816; i++) {
  parseLine(lines[i], i + 1);
}

console.log('--- Unclosed divs at end of Requisition Tab (line 2816) ---');
stack.forEach(item => {
  console.log(`Line ${item.lineNum}: ${item.line}`);
});
