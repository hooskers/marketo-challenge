const { promisify } = require('util');
const fs = require('fs');

// Make `writeFile` return a promise to make it easier to work
// with in an async manner
const writeFile = promisify(fs.writeFile);

// Get the source file path from the user's command
const sourcePath = process.argv[2];

// If no file path was provided, give the user a message and exit immediately
if (sourcePath === undefined) {
  console.error('\x1b[31m%s\x1b[0m', 'ERROR: No file path provided!');
  console.log(
    'Please provide a single argument that is a path to the data file you want deduplicated.',
  );

  process.exit(1);
}

// If the file path given does not exist, give the user a message and exit immediately
if (!fs.existsSync(sourcePath)) {
  console.error(
    '\x1b[31m%s\x1b[0m',
    `ERROR: Cannot find file: \`${sourcePath}\``,
  );
  console.log(
    'Please proivde a file path to an existing JSON file with your data.',
  );

  process.exit(1);
}

const destinationPath = './deduped.json';
const changelogPath = './deduped.log';

// Load the json file (expecting a property called `leads`)
const leads = require(sourcePath).leads;

console.log('Deduplicating....\n');

// Hold our final records in this array
// Each record is an array with two elements
// First element is the data object in its current iteration
// Second element is an array of objects containing
// the values of properties that were changed in the data
/** @type {Array.<Array.<Object, Array.<Object>>>} */
let records = [];

// Begin deduplicating the data
leads.forEach(lead => {
  // Check if we already have a record with the same id or email
  const existingIndex = records.findIndex(
    ([record]) =>
      lead._id === record._id || lead.email === record.email,
  );

  if (existingIndex > -1) {
    // Get the object we already have stored
    const original = records[existingIndex][0];

    // Get the times from the `entryDate` property from the objects
    const originalDate = new Date(original.entryDate).getTime();
    const incomingDate = new Date(lead.entryDate).getTime();

    // If the entryDate time from our incoming object is greater than or
    // equal to the date in our existing record, then
    // replace the existing data, but keep the `_id` or `email`
    // properties (whichever were duplicated) from the object we have stored
    // Then record the changed properties/values
    if (incomingDate >= originalDate) {
      const dupedId = original._id === lead._id;
      const dupedEmail = original.email === lead.email;

      const newData = {
        ...lead,
        _id: dupedId ? original._id : lead._id,
        email: dupedEmail ? original.email : lead.email,
      };

      // Gathering the properties/values that were changed
      const changed = Object.entries(original).reduce((changed, [key, val]) => {
        // If the value from our new data is different from the original,
        // record the change, otherwise, move on
        if (newData[key] !== val) {
          changed[key] = val;
        }

        return changed;
      }, {});

      // Add the new iteration of data to our existing record
      records[existingIndex][0] = newData;

      // Add the object of changes to the changes array stored alongside the record
      records[existingIndex][1].unshift(changed);
    }
  } else {
    // If there is no duplication, just push the data onto the array
    // with an empty changelog
    records.push([lead, []]);
  }
});

// Asynchronously write the deduplicated objects and the changelog to files
Promise.all([writeRecords(records), writeLog(records)]).then(results => {
  let hasErrors = false;

  // Check if any errors were returned
  results.forEach(result => {
    if (result !== true) {
      hasErrors = true;
    }
  });

  // Let the user know if the process errored out or not
  if (hasErrors) {
    console.log('There were errors (above) when attempting to write your files.');
  } else {
    console.log('Your data has been deduplicated!');
    console.log(`The deduplicated data was outputted to ${destinationPath}`);
    console.log(`The changelog for the objects was outputted to ${changelogPath}`);
  }
});

/**
 * Prints out the final (deduplicated) data objects to a file.
 * Promise resolves to `true` if successful, `Error` if unsuccessful.
 *
 * @async
 * @param {Array} records Array of data objects alongside their changelog objects
 * @returns {Promise<boolean|Error>}
 */
async function writeRecords(records) {
  // Strip out the array of changes so we are left with just the
  // final data objects
  const recordsWithoutChanges = records.map(record => record[0]);

  // Try writing to the file
  try {
    await writeFile(
      destinationPath,
      JSON.stringify(recordsWithoutChanges, null, 2),
    );

    return true;
  } catch (e) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      `Error writing deduplicated data to json file:\n${e}`,
    );

    process.exitCode = 1;
    return e;
  }
}

/**
 * Prints out a log of changes that the objects underwent.
 * Promise resolves to `true` if successful, `Error` if unsuccessful.
 *
 * @async
 * @param {Array} records Array of data objects alongside their changelog objects
 * @returns {Promise<boolean|Error>}
 */
async function writeLog(records) {
  // This will be the string that holds our log lines and gets printed to file
  let fullLog = '';

  // Loop over records and record their property changes
  records.forEach((record, index) => {
    const [data, changes] = record;

    // Loop over our recorded property changes and represent
    // the change with a `==>` indicator (fromValue ==> toValue)
    changes.forEach(change => {
      Object.entries(change).forEach(([changedProp, changedVal]) => {
        // Since the values we store are the "previous" values,
        // prepend them behind current values with a `==>`
        data[changedProp] = `${changedVal} ==> ${data[changedProp]}`;
      });
    });

    // To make it easier for the user to view/parse, let's align all
    // the properties and values. Need to find the longest property name.
    // To accomplish that: sort names by length and pick off first in array
    const longestPropLength = Object.getOwnPropertyNames(data).sort(
      (firstEl, secondEl) => {
        return secondEl.length > firstEl.length ? 1 : -1;
      },
    )[0].length;

    // Add a new line before we write our log for this object
    // (unless it's the first line in the string)
    if (!!index) fullLog += '\n';

    // Loop over the properties in our object (which now contains
    // the changelog for each property's value) and print
    // the property and value changelog on each line.
    // Each line is padded with spaces to make the properties and values align
    Object.entries(data).forEach(([key, val]) => {
      fullLog += `${key.padStart(longestPropLength)}: ${val}\n`;
    });
  });

  // Try writing to the file
  try {
    await writeFile(changelogPath, fullLog);

    return true;
  } catch (e) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      `Error writing changelog to file:\n${e}`,
    );

    process.exitCode = 1;
    return e;
  }
}
