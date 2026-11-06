'use strict';

const readline = require('node:readline/promises');
const { CliError } = require('./cli');

/**
 * Hỏi đáp trên terminal. Khi stdin là terminal, mật khẩu không hiện khi gõ.
 * Khi stdin được pipe (script, test), đọc lần lượt từng dòng.
 */
function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  let pipedLines;

  async function nextPipedLine(question) {
    if (!pipedLines) {
      let raw = '';
      input.setEncoding('utf8');
      for await (const chunk of input) {
        raw += chunk;
      }
      pipedLines = raw.split(/\r?\n/);
    }
    output.write(question);
    if (pipedLines.length === 0 || (pipedLines.length === 1 && pipedLines[0] === '')) {
      throw new CliError('\nThiếu dữ liệu nhập.');
    }
    output.write('\n');
    return pipedLines.shift();
  }

  async function ask(question) {
    if (!input.isTTY) {
      return nextPipedLine(question);
    }
    const rl = readline.createInterface({ input, output });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  }

  function askHidden(question) {
    if (!input.isTTY) {
      return nextPipedLine(question);
    }
    return new Promise((resolve, reject) => {
      let value = '';
      output.write(question);
      input.setRawMode(true);
      input.setEncoding('utf8');
      input.resume();

      function finish(error) {
        input.off('data', onData);
        input.setRawMode(false);
        input.pause();
        output.write('\n');
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      }

      function onData(chunk) {
        for (const char of chunk) {
          if (char === '\r' || char === '\n') {
            finish();
            return;
          }
          if (char === '\u0003') {
            finish(new CliError('Đã hủy.'));
            return;
          }
          if (char === '\u007f' || char === '\b') {
            value = Array.from(value).slice(0, -1).join('');
          } else if (char >= ' ') {
            value += char;
          }
        }
      }

      input.on('data', onData);
    });
  }

  return { ask, askHidden };
}

module.exports = { createPrompter };
