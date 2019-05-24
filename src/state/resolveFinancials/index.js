import * as d3 from 'd3';
import Big from 'big.js';
import eachDayOfInterval from 'date-fns/fp/eachDayOfInterval';
import closestIndexTo from 'date-fns/closestIndexTo';
import addDays from 'date-fns/fp/addDays';
import startOfDay from 'date-fns/fp/startOfDay';

import computeTransactionModifications from './resolveTransactions';

const sortTransactionOrder = (a, b) => {
  const typeA = a.type.toUpperCase();
  const typeB = b.type.toUpperCase();

  let comparison = 0;
  if (typeA === typeB) {
    if (Math.abs(a.value) > Math.abs(b.value)) {
      comparison = 1;
    } else {
      comparison = -1;
    }
  } else if (typeA > typeB) {
    comparison = 1;
  } else if (typeA < typeB) {
    comparison = -1;
  }
  return comparison;
};

const coercePaybacks = ({ accounts }) => {
  let transactions = [];
  if (accounts) {
    accounts.forEach(account => {
      if (account.vehicle === 'debt' && account.payback) {
        account.payback.transactions.forEach((accountTransaction, index) => {
          // this one is for the expense on the account
          // being paid down, expenses are entered as positive
          // but mathed as negative so it will reduce the
          // balance of a debt (which is entered as a positive number)
          let amount =
            typeof accountTransaction.value === 'string'
              ? account.payback[accountTransaction.value]
              : accountTransaction.value;
          transactions.push({
            ...accountTransaction,
            id: `${accountTransaction.id}-${index}EXP`,
            raccount: account.name,
            description: account.payback.description,
            type: 'expense',
            category: account.payback.category,
            value: amount,
            fromAccount: true
          });
          // this one is for the account making the payment
          // (raccount is defined on accountTransaction)
          // negative transfer don't show up on the bar chart
          // but they should affect the math of, say, the line chart
          // we can use this to avoid visual duplication of two
          // transactions for the same amount reducing the balance
          // on two different accounts
          transactions.push({
            ...accountTransaction,
            id: `${accountTransaction.id}-${index}TRSF`,
            description: account.payback.description,
            type: 'transfer',
            category: account.payback.category,
            value: -amount,
            fromAccount: true
          });
        });
      }
    });
  }
  return transactions;
};

const transactionSplitter = ({ transactions, accounts }) => {
  let splitTransactions = {
    income: [],
    expense: []
  };

  if (transactions) {
    transactions.forEach(d => {
      switch (d.type) {
        case 'income':
          splitTransactions.income.push(d);
          break;
        case 'expense':
          splitTransactions.expense.push(d);
          break;
        case 'transfer':
          if (d.value <= 0) {
            splitTransactions.expense.push(d);
          } else {
            splitTransactions.income.push(d);
          }
          break;
        default:
          break;
      }
    });
  }

  return splitTransactions;
};

const replaceWithModified = (oldValue, modification) => {
  let newValue = oldValue;
  newValue.y = oldValue.y.add(modification.y.abs());
  return newValue;
};

const applyModifications = allDates => (structure, modification) => {
  let modIndex = closestIndexTo(modification.date, allDates);
  let updatedStructure = structure;
  updatedStructure[modIndex][modification.mutateKey] = replaceWithModified(
    updatedStructure[modIndex][modification.mutateKey],
    modification
  );
  return updatedStructure;
};

const buildStack = (data, graphRange) => {
  const allDates = eachDayOfInterval(graphRange);

  const stackStructure = allDates.map(day => {
    let obj = { date: day };
    data.forEach(datum => {
      obj[datum.id] = { ...datum };
      obj[datum.id].y = Big(0);
      // obj[datum.id].dailyRate = Big(0);
    });
    return obj;
  });

  const computedTMods = computeTransactionModifications(data, graphRange);

  // return array of modifications to be applied to stackStructure
  return computedTMods.reduce(applyModifications(allDates), stackStructure);
};

const resolveBarChart = (dataRaw, { graphRange }) => {
  // return early with an empty array
  // for empty data
  if (!dataRaw || dataRaw.length === 0) return [];

  let keys = [];

  dataRaw.forEach((d, i) => {
    let key = { value: d.id, index: i };
    keys.push(key);
  });

  // we coerce into Big here temporarily
  // eventually we need to except it to already be Big
  const data = keys.map(key => {
    let dataAccess = dataRaw[key.index];
    let newDatum = { ...dataAccess };
    if (newDatum.value) {
      newDatum.value = Big(dataAccess.value);
    }
    if (newDatum.cycle) {
      newDatum.cycle = Big(dataAccess.cycle);
    }
    if (newDatum.occurrences) {
      newDatum.occurrences = Big(dataAccess.occurrences);
    }

    newDatum.dailyRate = Big(dataAccess.dailyRate || 0);

    return newDatum;
  });

  const stackComputed = buildStack(data, graphRange);

  const stack = d3
    .stack()
    .value((d, key) => d[key.value].y)
    .keys(keys);

  const stacked = stack(stackComputed);

  const maxHeight = d3.max(stacked.reduce((a, b) => a.concat(b)), d => d[1]);

  return keys.map((key, index) => ({
    ...data[index],
    stack: stacked[index],
    maxHeight: Big(maxHeight)
  }));
};

// zipTogethor takes a specific account
// and then loops through each transaction
// and takes the value of each that applies
// and reduces it down into one value
const zipTogethor = account => arr =>
  arr.reduce((accumlator, d) => {
    if (d.raccount === account.name) {
      let flatten = d.stack.map(e => e[1] - e[0]);
      return accumlator.length === 0
        ? flatten
        : accumlator.map((d, i, thisArray) => d + flatten[i]);
    } else {
      return accumlator;
    }
  }, []);

const twoSteppedBalance = (starting, accountStack, barChartStack, slope) => {
  // we use this function as the iterator can hit
  // undefined values if income or expense array is empty
  const extractValue = value => {
    if (value === undefined) {
      return 0;
    } else {
      return Math.abs(value);
    }
  };

  let arrayLength = Math.max(
    accountStack.income.length,
    accountStack.expense.length
  );

  let values = [];
  let prevVal = extractValue(starting);
  for (let iterator = 0; iterator < arrayLength; iterator++) {
    let firstStep =
      prevVal +
      (slope === 'pos' ? 1 : -1) * extractValue(accountStack.expense[iterator]);
    let secondStep = firstStep + extractValue(accountStack.income[iterator]);

    values.push({
      date: barChartStack[iterator].data.date,
      value: firstStep
    });

    values.push({
      date: barChartStack[iterator].data.date,
      value: secondStep
    });
    prevVal = secondStep;
  }

  return values;
};

const resolveAccountChart = ({ accounts, income, expense }) => {
  return !accounts
    ? []
    : accounts.reduce((graphAccounts, account) => {
        let accountStack = {};

        let accountZipper = zipTogethor(account);
        accountStack.income = accountZipper(income);
        accountStack.expense = accountZipper(expense);
        if (account.name === 'cc') console.log(account);
        let barChartStack = [].concat(income, expense)[0].stack;
        let finalZippedLine = {
          account: account,
          values: twoSteppedBalance(
            account.starting,
            accountStack,
            barChartStack,
            account.vehicle === `debt` ? 'pos' : 'neg'
          ),
          interest: account.interest,
          vehicle: account.vehicle
        };

        return finalZippedLine.values.length === 0
          ? graphAccounts
          : graphAccounts.concat([finalZippedLine]);
      }, []);
};

export {
  sortTransactionOrder,
  coercePaybacks,
  transactionSplitter,
  applyModifications,
  buildStack,
  resolveBarChart,
  resolveAccountChart
};

const future = daysinfuture => {
  return addDays(daysinfuture)(startOfDay(new Date()));
};

const past = () => {
  return addDays(1)(startOfDay(new Date()));
};

export { past, future };
