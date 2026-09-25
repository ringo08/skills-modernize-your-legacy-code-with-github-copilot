'use strict';

const { Readable, Writable } = require('node:stream');
const { AccountData, Operations, formatBalance, parseAmount, run } = require('./index');

function createOutput() {
  const output = { text: '' };
  output.stream = new Writable({
    write(chunk, encoding, callback) {
      output.text += chunk.toString();
      callback();
    },
  });
  return output;
}

function createOperationInput(amount) {
  return { question: jest.fn().mockResolvedValue(amount) };
}

async function runMenu(choices) {
  const output = createOutput();
  const input = Readable.from(`${choices.join('\n')}\n`);
  await run(input, output.stream);
  return output.text;
}

describe('student accounting application', () => {
  test('TC-001: starts with an initial balance of 1000.00', () => {
    expect(formatBalance(new AccountData().read())).toBe('001000.00');
  });

  test('TC-002: viewing the balance does not change it', async () => {
    const data = new AccountData();
    const output = createOutput();
    const input = createOperationInput('unused');

    await new Operations(data, input, output.stream).execute('TOTAL');
    await new Operations(data, input, output.stream).execute('TOTAL');

    expect(output.text.match(/Current balance: 001000.00/g)).toHaveLength(2);
    expect(data.read()).toBe(100000);
  });

  test('TC-003: credits a positive integer amount', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('50'), output.stream).execute('CREDIT');

    expect(output.text).toContain('Amount credited. New balance: 001050.00');
    expect(data.read()).toBe(105000);
  });

  test('TC-004: credits an amount with two decimal places', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('12.34'), output.stream).execute('CREDIT');

    expect(output.text).toContain('Amount credited. New balance: 001012.34');
    expect(data.read()).toBe(101234);
  });

  test('TC-005: debits an amount within the current balance', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('25'), output.stream).execute('DEBIT');

    expect(output.text).toContain('Amount debited. New balance: 000975.00');
    expect(data.read()).toBe(97500);
  });

  test('TC-006: allows a debit equal to the current balance', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('1000'), output.stream).execute('DEBIT');

    expect(output.text).toContain('Amount debited. New balance: 000000.00');
    expect(data.read()).toBe(0);
  });

  test('TC-007: rejects a debit greater than the current balance', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('1000.01'), output.stream).execute('DEBIT');

    expect(output.text).toContain('Insufficient funds for this debit.');
    expect(data.read()).toBe(100000);
  });

  test('TC-008: uses the credited balance for a later debit', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('100'), output.stream).execute('CREDIT');
    await new Operations(data, createOperationInput('1100'), output.stream).execute('DEBIT');

    expect(data.read()).toBe(0);
    expect(output.text).toContain('Amount debited. New balance: 000000.00');
  });

  test('TC-009: carries a debited balance into a later inquiry', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('100'), output.stream).execute('DEBIT');
    await new Operations(data, createOperationInput('unused'), output.stream).execute('TOTAL');

    expect(output.text).toContain('Current balance: 000900.00');
  });

  test('TC-010: accepts zero credit and debit amounts without changing balance', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('0'), output.stream).execute('CREDIT');
    await new Operations(data, createOperationInput('0'), output.stream).execute('DEBIT');

    expect(data.read()).toBe(100000);
    expect(output.text).toContain('Amount credited. New balance: 001000.00');
    expect(output.text).toContain('Amount debited. New balance: 001000.00');
  });

  test('TC-011: rejects negative credit and debit amounts', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('-1.00'), output.stream).execute('CREDIT');
    await new Operations(data, createOperationInput('-1.00'), output.stream).execute('DEBIT');

    expect(output.text.match(/Invalid amount/g)).toHaveLength(2);
    expect(data.read()).toBe(100000);
  });

  test('TC-012: supports the PIC 9(6)V99 maximum amount and precision', async () => {
    const data = new AccountData(0);
    const output = createOutput();

    await new Operations(data, createOperationInput('999999.99'), output.stream).execute('CREDIT');

    expect(output.text).toContain('Amount credited. New balance: 999999.99');
    expect(data.read()).toBe(99999999);
    expect(parseAmount('1000000.00')).toBeNull();
  });

  test('TC-013: reports an invalid menu choice and continues', async () => {
    const output = await runMenu(['5', '4']);

    expect(output).toContain('Invalid choice, please select 1-4.');
    expect(output).toContain('Exiting the program. Goodbye!');
    expect((output.match(/Account Management System/g) || []).length).toBe(2);
  });

  test('TC-014: exits when option 4 is selected', async () => {
    const output = await runMenu(['4']);

    expect(output).toContain('Exiting the program. Goodbye!');
    expect((output.match(/Account Management System/g) || []).length).toBe(1);
  });

  test('TC-015: reads the stored balance', () => {
    const data = new AccountData(12345);

    expect(data.read()).toBe(12345);
  });

  test('TC-016: writes and then reads the updated balance', () => {
    const data = new AccountData();

    data.write(12345);

    expect(data.read()).toBe(12345);
  });

  test('TC-017: ignores an unsupported operation without changing balance', async () => {
    const data = new AccountData();
    const output = createOutput();

    await new Operations(data, createOperationInput('unused'), output.stream).execute('UNKNOWN');

    expect(output.text).toBe('');
    expect(data.read()).toBe(100000);
  });
});