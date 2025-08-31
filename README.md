# Financier importer for Actual Budget

### What does this tool do?

This is a tool written for self-use to help migrate from 
[Financier](https://financier.io/) to [Actual budget](https://actualbudget.org/). It's published here in case it helps others trying to migrate too.

It makes use of the Actual API and requires Node.js to be installed in order
to import.

### What does this tool import?

It imports pretty much everything from Financier other than notes and flags. One other limitation (detailed in the program's help output) relates to if you use the "Income for next month" feature in Financier (known as the ["month ahead" method](https://actualbudget.org/docs/getting-started/starting-clean/#the-month-ahead-method)). Essentially, the Actual Budget API has no way to indicate that money should be "held" from the month it was received until the next for budgeting purposes, so after the import, you will need to run through all the months in your budget and click the "To Budget" amount, then click "Hold for next month", then click "Next". This is a little tedious if you have many months, but it only has to be done once. I've also noticed the "carryover" of overspending doesn't always get matched up correctly, but again, this is just a one-time fix after import to manually switch any categories to rollover overspending (if that's how you did things in Financier).

As with anything you find on the internet, YMMV. Standard disclaimer applies that if this code blows up your computer (seems unlikely, but good to cover bases), I can't be held responsible.

### How do I run it?

In general, here are the steps to run the importer:

0. Make sure you have [Node](https://nodejs.org/en) and [yarn](https://yarnpkg.com/)/[npm](https://www.npmjs.com/) installed. I developed this using Node v18.18.0, but other versions might work. You'll also need an Actual Budget server to connect to and a password for that server.
1. "Backup" your budget from Financier in JSON format and save somewhere to disk. There is also a demo budget file included in this repo that you can test with first, if you'd like:

![](_static/backup_budget.png)

2. Clone this repo using git, (or download and extract the zip to a folder using Github):

```sh
$ git clone https://github.com/jat255/financier-to-actual.git
```

3. Navigate to the cloned directory and install the (few) dependencies using yarn or npm:

```sh
# run one of the following:
$ yarn install
$ npm install
```

4. Once installed, the tool can be run by invoking it using `node` (unix users can just execute `./financier-to-actual` directly). Use the `-h` option to print the help:

```sh
$ node financier-to-actual -h
```
```
Usage: financier-to-actual [options]

A tool to import a Financier budget to Actual Budget. 
    
    The options below must be provided on the command line, or passed through
    the environment using the environment variables specified. These can be 
    defined in a '.env' file that will be read at the time the command is run
    for convenience. If both environment variables and command line flags are set,
    the CLI flags will take precedence. (A '.env' file will override any existing
    environment variable definitions)
    
    Please note: there is currently no way via the Actual API to specify that income
    should be "held" for the next month, so if your Financier budget assigns income
    to the next month (like how YNAB recommended and described here:
    https://actualbudget.org/docs/getting-started/starting-clean/#the-month-ahead-method),
    then after the import you will need to manually hold the extra each month going
    back through the budget's history. If you don't do this, it will appear
    that each month has extra "To budget", so it won't match up exactly with
    what is shown in Financier. This is just a display issue and doesn't affect the
    actual budget amounts as far as I understand. Unfortunately, there's nothing that
    can be done about this on the import side because it is  a limitation
    based on how I understand the API to work at this point (see 
    https://github.com/actualbudget/actual/issues/1982)

Options:
  -V, --version          output the version number
  --url <url>            The URL for the actual server (e.g. "https://actual.myhost.com") (env: ACTUAL_URL)
  --password <password>  The password for the actual server (env: ACTUAL_PASSWORD)
  --json <path_to_json>  The path to the Financier JSON export (env: FINANCIER_JSON)
  -h, --help             display help for command
```

5. To run the import, basically just follow the instruction printed in the help output, but the gist is you need to provide the server url, the server password, and the JSON file you exported in step 1 as either command line arguments or via environment variables. The environment varibles will be read from a file named `.env` if it is prsent (see `.env.example` for an example of the format required). A couple examples:

```sh
# using command line arguments:
$ node ./financier-to-actual --url https://actual.budget.com --password "my_secret_password" --json "My budget export.json"
```

```sh
# using environment variables:
$ ACTUAL_URL="https://actual.budget.com" ACTUAL_PASSWORD="my_secret_password" FINANCIER_JSON="My budget export.json" node ./financier-to-actual
```

```sh
# if you're using a .env file, you can just call the import script with no arguments and it should work:
$ node ./financier-to-actual
```

6. You should now have a local copy of the budget in a subdirectory where you ran this script that can be safely deleted (since it was uploaded to the server also). Refresh the server in your browser to see the imported file. 

7. If you use the "income for next month" feature as described above, you will have to manually hold the leftover money each month in order to get the "To budget" amounts to line up with what was in Financier. These amounts may not match up perfectly if you ever mixed "income" with "income for next month" in Financier, but it's just a display issue; the budget amounts should all work out. Also, some categories do not get properly marked as "Rollover overspending" (not sure why), so you might have to do that manually to get things to line up.

### Can you show an example?

This is an example of what the tool looked like on my actual budget (no pun intended), which had 115 accounts (opened and closed), 94 categories, 2223 payees, 16,145 transactions, and 4061 "budget-month" values. It took about 12 minutes to import on my modestly powered machine:

```
$ node financier-to-actual --json My\ Finances\ \(Backup\ 3_3_24\ 10_12\ PM\).json

Using the following settings:
         ACTUAL_URL: https://actual.xxxxxxxxxx.com (source: environment)
    ACTUAL_PASSWORD: xxxxxxxxxxxxxxxxxxx (source: environment)
     FINANCIER_JSON: My Finances (Backup 3_3_24 10_12 PM).json (source: cli)

Initializing API client
Running actual import
Loading fresh spreadsheet
(Step 1/6) adding accounts to budget
 ████████████████████████████████████████ 100% | ETA: 0s | 115/115
(Step 2/6) adding category groups
 ████████████████████████████████████████ 100% | ETA: 0s | 13/13
(Step 3/6) adding categories
 ████████████████████████████████████████ 100% | ETA: 0s | 94/94
(Step 4/6) adding payees
 ████████████████████████████████████████ 100% | ETA: 0s | 2223/2223
(Step 5/6) adding transactions
 ████████████████████████████████████████ 100% | ETA: 0s | 16145/16145
(Step 6/6) processing budget amounts
 ████████████████████████████████████████ 100% | ETA: 0s | 4061/4061
Loading fresh spreadsheet
Syncing since 2024-03-04T05:19:57.820Z-0000-0000000000000000 0 (attempt: 0)
Got messages from server 0
```

### It didn't work... Help?

This tool is provided very much as-is, but if you have issues, make an issue on this repo and I can try to look into it as I'm able.

---

# Financier to Actual Budget Importer - Enhanced Version

This enhanced version of the Financier to Actual Budget importer includes support for three additional features:

1. **Month-Ahead Budgeting** - Automatically handles income designated for next month
2. **Flag Preservation** - Converts Financier flags to color names in transaction notes
3. **Carryover Categories** - Preserves overspending carryover settings

## New Features

### 1. Month-Ahead Budgeting

In Financier, income can be designated as either for the current month or the next month. This importer now:

- Tracks all transactions with the `incomeNextMonth` category
- After importing all data, automatically calls `holdBudgetForNextMonth` for each month
- Generates a detailed report showing which months had income held and whether each hold succeeded

**How it works:**
```
January income marked "for next month" → Held in January → Available in February
```

**Report Output:**
After import, you'll find a file named `month_ahead_report_YYYY-MM-DD.md` with details about:
- Which months had income held for the following month
- Success/failure status of each hold operation
- Instructions for manual adjustments if needed

### 2. Flag Preservation

Financier uses colored flags on transactions. These are now preserved by:

- Converting hex color codes to readable names
- Prepending the flag information to transaction notes
- Format: `[Color Flag] original note text`

**Flag Color Mappings:**
- 🔴 Red (`#ff0000`)
- 🔵 Blue (`#5276b8`) 
- 🟢 Green (`#76b852`)
- 🟡 Yellow (`#e5e500`)
- 🟠 Orange (`#faa710`)
- 🟣 Purple (`#b852a9`)

**Example:**
- Financier: Transaction with red flag and note "Important payment"
- Actual: Transaction with note "[Red Flag] Important payment"

### 3. Carryover Categories

Categories in Financier can be set to carry over overspending from month to month. This setting is preserved:

- Categories with `overspending: true` in Financier
- Will have carryover enabled in Actual Budget
- Ensures deficit tracking continues across months

## Usage

The basic usage remains the same:

```bash
node financier-to-actual --url https://actual.myserver.com --password mypassword --json "My Budget.json"
```

Or using environment variables in `.env`:
```
ACTUAL_URL=https://actual.myserver.com
ACTUAL_PASSWORD=mypassword
FINANCIER_JSON=My Budget.json
```

Then run:
```bash
node financier-to-actual
```

## Testing the New Features

### Test Individual Features

1. **Test flag conversion:**
   ```bash
   node test-new-features.js
   ```

2. **Test hold functionality:**
   ```bash
   node test-hold-functionality.js
   ```

### Understanding Hold Results

The `holdBudgetForNextMonth` function may return `false` or fail if:

1. **Insufficient income** - The month doesn't have enough unallocated income
2. **Already allocated** - The income has already been budgeted to categories
3. **Invalid month** - The month doesn't exist in the budget

The import report will show the status of each hold operation and provide guidance for manual adjustments.

## Limitations and Notes

### Month-Ahead Budgeting
- Actual Budget requires manual "hold" operations, unlike Financier's automatic handling
- If a hold fails, you'll need to manually adjust in the Actual Budget UI
- The hold amount must not exceed the available "To Budget" amount

### Carryover Behavior
- Actual's carryover may behave slightly differently than Financier's
- Review your categories after import to ensure carryover is working as expected
- Some manual adjustments may be needed for complex carryover scenarios

### Flag Colors
- Only the six standard Financier flag colors are supported
- Custom colors will be labeled as "Colored Flag"
- Flags are permanently added to the note text and cannot be removed via the UI

## Troubleshooting

### "Hold returned false"
This means there wasn't enough income available to hold. Check:
- Was the income transaction imported correctly?
- Is the income already allocated to categories?
- Try manually holding in the Actual Budget UI

### Missing flags
Ensure your Financier export includes the `flag` field in transactions. Flags should appear as hex color codes (e.g., `#ff0000`).

### Carryover not working
After import:
1. Navigate to the budget
2. Click on the category
3. Check "Rollover overspending" is enabled
4. Some categories may need manual adjustment

## Post-Import Checklist

1. ✓ Review `month_ahead_report_*.md` for hold results
2. ✓ Verify flags appear in transaction notes
3. ✓ Check categories have correct carryover settings
4. ✓ Manually adjust any failed holds
5. ✓ Verify budget balances match Financier

## Contributing

If you encounter issues or have suggestions for improvements, please open an issue on the repository.