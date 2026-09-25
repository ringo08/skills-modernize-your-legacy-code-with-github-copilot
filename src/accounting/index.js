'use strict';

const readline = require('node:readline');

const INITIAL_BALANCE_CENTS = 100000;
const MAX_BALANCE_CENTS = 99999999;

class InputReader {
  constructor(input, output) {
    this.output = output;
    this.lines = [];
    this.waiters = [];
    this.closed = false;
    this.reader = readline.createInterface({ input, crlfDelay: Infinity });
    this.reader.on('line', (line) => {
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(line);
      } else {
        this.lines.push(line);
      }
    });
    this.reader.on('close', () => {
      this.closed = true;
      while (this.waiters.length > 0) {
        this.waiters.shift()(null);
      }
    });
  }

  question(message) {
    this.output.write(message);
    if (this.lines.length > 0) {
      return Promise.resolve(this.lines.shift());
    }
    if (this.closed) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close() {
    this.reader.close();
  }
}

function formatBalance(balanceCents) {
  const wholePart = Math.floor(balanceCents / 100).toString().padStart(6, '0');
  const fractionalPart = (balanceCents % 100).toString().padStart(2, '0');
  return `${wholePart}.${fractionalPart}`;
}

function parseAmount(value) {
  const match = value.trim().match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) {
    return null;
  }

  const wholePart = Number(match[1]);
  const fractionalPart = Number((match[2] || '').padEnd(2, '0'));
  const amountCents = wholePart * 100 + fractionalPart;
  return amountCents <= MAX_BALANCE_CENTS ? amountCents : null;
}

class AccountData {
  constructor(initialBalanceCents = INITIAL_BALANCE_CENTS) {
    this.storageBalanceCents = initialBalanceCents;
  }

  read() {
    return this.storageBalanceCents;
  }

  write(balanceCents) {
    if (!Number.isInteger(balanceCents) || balanceCents < 0 || balanceCents > MAX_BALANCE_CENTS) {
      throw new RangeError('Balance must be between 0.00 and 999999.99.');
    }
    this.storageBalanceCents = balanceCents;
  }
}

class Operations {
  constructor(data, input, output) {
    this.data = data;
    this.input = input;
    this.output = output;
  }

  async execute(operation) {
    switch (operation.trim()) {
      case 'TOTAL':
        this.output.write(`Current balance: ${formatBalance(this.data.read())}\n`);
        break;
      case 'CREDIT':
        await this.credit();
        break;
      case 'DEBIT':
        await this.debit();
        break;
      default:
        break;
    }
  }

  async requestAmount() {
    const value = await this.input.question('Enter amount: ');
    if (value === null) {
      return null;
    }
    const amountCents = parseAmount(value);
    if (amountCents === null) {
      this.output.write('Invalid amount, please enter a value from 0.00 to 999999.99.\n');
    }
    return amountCents;
  }

  async credit() {
    const amountCents = await this.requestAmount();
    if (amountCents === null) {
      return;
    }

    const updatedBalanceCents = this.data.read() + amountCents;
    if (updatedBalanceCents > MAX_BALANCE_CENTS) {
      this.output.write('Invalid amount, the balance limit would be exceeded.\n');
      return;
    }

    this.data.write(updatedBalanceCents);
    this.output.write(`Amount credited. New balance: ${formatBalance(updatedBalanceCents)}\n`);
  }

  async debit() {
    const amountCents = await this.requestAmount();
    if (amountCents === null) {
      return;
    }

    const currentBalanceCents = this.data.read();
    if (currentBalanceCents < amountCents) {
      this.output.write('Insufficient funds for this debit.\n');
      return;
    }

    const updatedBalanceCents = currentBalanceCents - amountCents;
    this.data.write(updatedBalanceCents);
    this.output.write(`Amount debited. New balance: ${formatBalance(updatedBalanceCents)}\n`);
  }
}

function displayMenu(output) {
  output.write('--------------------------------\n');
  output.write('Account Management System\n');
  output.write('1. View Balance\n');
  output.write('2. Credit Account\n');
  output.write('3. Debit Account\n');
  output.write('4. Exit\n');
  output.write('--------------------------------\n');
}

async function run(input = process.stdin, output = process.stdout) {
  const prompt = new InputReader(input, output);
  const data = new AccountData();
  const operations = new Operations(data, prompt, output);
  let continueRunning = true;

  try {
    while (continueRunning) {
      displayMenu(output);
      const choice = await prompt.question('Enter your choice (1-4): ');

      if (choice === null) {
        continueRunning = false;
        break;
      }

      switch (choice.trim()) {
        case '1':
          await operations.execute('TOTAL');
          break;
        case '2':
          await operations.execute('CREDIT');
          break;
        case '3':
          await operations.execute('DEBIT');
          break;
        case '4':
          continueRunning = false;
          break;
        default:
          output.write('Invalid choice, please select 1-4.\n');
          break;
      }
    }
    output.write('Exiting the program. Goodbye!\n');
  } finally {
    prompt.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  AccountData,
  Operations,
  formatBalance,
  parseAmount,
  run,
};