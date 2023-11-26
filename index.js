require('dotenv').config()
const cliProgress = require('cli-progress');
const fs = require('fs')
const { v4: uuidv4 } = require('uuid');

let api = require('@actual-app/api');
let financier_data = require(process.env.FINANCIER_JSON);

let accounts
let payees
let categories
let category_groups
let budgets
let transactions
let server_payees
let flattened_transactions

// mapping from Financier account types to AB account types
let f2a_account_type_map = {
    'MORTGAGE': 'mortgage',
    'ASSET': 'other',
    'CREDIT': 'credit',
    'DEBIT': 'checking',
    'INVESTMENT': 'investment',
    'SAVINGS': 'savings',
    'CASH': 'other'
};

// keys in this object should be financier IDs, and their values
// should be the new IDs they get from actual when calling "createXXX()"
let f2a_id_mappings = {};

function get_id_by_financier_id(array, financier_id) {
    let match = array.filter((data) => data.financier_id == financier_id)
    if (match.length < 1) {
        console.error(`Did not find ${financier_id} in array`)
        return null
    }
    else {
        return match[0].id
    }
}

function write_json(json_data, filename) {
    const data = JSON.stringify(json_data)

    // write JSON string to a file
    try {
        fs.writeFileSync(filename, data)
        console.log('JSON data is saved.')
    } catch (err) {
        console.error(err)
    }
}

function read_json(filename) {
    try {
        let data = fs.readFileSync(filename)
    } catch (err) {
        console.error(err)
    }
}

function uuid_from_financier_id(financier_id) {
    let n = financier_id.lastIndexOf("_");
    uuid = financier_id.substring(n + 1);
    return uuid;
}

function set_transfer_payee(trans) {
    if ("transfer_id" in trans) {
        // find matching transaction for other side of transaction
        let matching_trans = flattened_transactions.filter((t) => t.id == trans.transfer_id)[0];
        
        // if matching_trans is a subtransaction, it will have an "_account" id
        // rather than "account"

        // get actual account ID for the account in the matching transaction
        // via its financier ID
        let new_account_id = f2a_id_mappings[
            "account" in matching_trans ? 
                matching_trans.account : 
                matching_trans._account
        ];

        // if we didn't find it, that's because matching_trans.account
        // has already been mapped from financier ID to actual ID, so just
        // use the ID as is (since it's already an actual)
        if (new_account_id == undefined) {
            new_account_id = matching_trans.account
        }
        // get the payee for this "transfer_acct"
        let transfer_payee = server_payees.filter((p) => p.transfer_acct == new_account_id)[0];
        
        // set the transaction's payee to the right ID
        trans.payee = transfer_payee.id;
    }

    return trans;

}


// financier             actual
// master category <-> category group
// category        <-> category
// account         <-> account

function map_accounts() {
    // massages financier export data to get a list of accounts to be uploaded to AB
    let account_data = financier_data.filter((data) => data._id.includes('_account_'));
    account_data = account_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    let AB_accounts = account_data.map((data) => {
        let ABAccount = {
            "id": uuid_from_financier_id(data['_id']),  // get UUID from financier id
            "name": data['name'],
            "type": f2a_account_type_map[data['type']],
            "closed": data['closed'],
            "offbudget": !data['onBudget'],
            "financier_id": data['_id'],
            "financier_note": data['note']
        }
        return ABAccount;
    })
    return AB_accounts;
};

function map_category_groups() {
    let cat_data = financier_data.filter((data) => data._id.includes('_master-category_'))
    cat_data = cat_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    let AB_category_groups = cat_data.map((data) => {
        return {
            "id": uuid_from_financier_id(data['_id']),  // get UUID from financier id
            "name": data['name'],
            "financier_id": data["_id"]
        };
    })
    return AB_category_groups;
}

function map_categories() {
    // AB categories require "name" and "group_id", but we 
    // won't have group IDs until after adding to the budget
    let cat_data = financier_data.filter((data) => data._id.includes('_category_') & !data._id.includes('_m_category_'))
    cat_data = cat_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    let AB_categories = cat_data.map((data) => {
        return {
            "id": uuid_from_financier_id(data['_id']),  // get UUID from financier id
            "name": data['name'],
            "group_id": data["masterCategory"]
        }
    })
    return AB_categories
}

function map_payees() {
    // AB payees require "name", but should also have "category", but we 
    // won't have category IDs until after adding to the budget with add_categories
    let payee_data = financier_data.filter((data) => data._id.includes('_payee_'))
    let AB_payees = payee_data.map((data) => {
        return {
            "id": uuid_from_financier_id(data['_id']),  // get UUID from financier id
            "name": data['name']
        }
    })
    return AB_payees
}

function map_single_transaction(transaction, type) {
    /* 
    `type` should be either "main" or "split"

    transaction comes in from financier with the following structure:
        {
            "account": id of account,
            "category": id of category or null,
            "checkNumber": null or int,
            "cleared": bool,
            "_id": financier id,
            "date": "YYYY-MM-DD",
            "flag": null or string,
            "memo": string,
            "payee": id of payee or null,
            "reconciled": bool,
            "splits": array,
            "transfer": id of other transaction (as UUID) or null,
            "value": int
        }

    if part of a split, will have the following:
        {
            "category": id of category or null,
            "id": UUID4 (not ours) that matches the "transfer" of another transaction,
            "payee": id of payee or null,
            "transfer": id of other transaction, if transfer,
            "value": int
        }

    output should be:
        {
            "id": UUID,
            "amount": int,
            "date": YYYY-MM-DD,
            "category": id or null, (optional)
            "account": id,
            "notes": string, (optional)
            "payee": id, (optional)
            "transfer_id": id (of the transaction on other side of the transfer, optional),
            "subtransactions": Transaction[] (optional)
        }
    */
    let financier_id;
    let res;
    if (type === "main" ){
        financier_id = uuid_from_financier_id(transaction["_id"])
    } else {
        // this is a split transaction
        financier_id = transaction["id"];
    }

    res = {
        "id": financier_id,
        "amount": transaction['value'],
        "date": transaction['date'],
        "notes": transaction["memo"],
        "cleared": transaction["cleared"],
        // "financier_account": transaction["account"],
        // "financier_category": transaction["category"],
        // "financier_id": financier_id,
        // "financier_payee": transaction["payee"],
        // "financier_transfer": transaction["transfer"]
    }

    // need to set account
    if (transaction["account"] != null) {
        res["account"] = transaction["account"];
    }
    // the parent of a split should not have a category
    if (!(transaction["category"] == "split" | transaction["category"] == null)) {
        res["category"] = transaction["category"];
    }
    // transfer:
    if (transaction["transfer"] != null) {
        res["transfer_id"] = transaction["transfer"];
    }
    // payee:
    if (transaction["payee"] != null) {
        res["payee"] = transaction["payee"]
    }
    // subtransactions:
    if ("splits" in transaction && transaction["splits"].length > 0) {
        res["subtransactions"] = transaction["splits"].map((trans) => {
            return map_single_transaction(trans, "split")
        })
    }

    return res
}

function map_transactions() {
    let trans_data = financier_data.filter((data) => data._id.includes('_transaction_'))
    let AB_transactions = trans_data.map((trans) => {return map_single_transaction(trans, "main")})

    // let transGroupedByAccount = AB_transactions.reduce(function (r, a) {
    //     r[a.financier_account] = r[a.financier_account] || [];
    //     r[a.financier_account].push(a);
    //     return r;
    // }, Object.create(null));
    return AB_transactions
}

async function add_accounts() {
    console.log("adding accounts to budget")
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(accounts.length, 0);
    for (account of accounts) {
        let id = await api.createAccount(account, 0);
        f2a_id_mappings[account.id] = id;
        account.id = id;
        bar.increment();
    }
    bar.stop();
    return accounts
}

async function add_category_groups() {
    console.log("adding category groups");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(category_groups.length, 0);
    for (cat_group of category_groups) {
        let id = await api.createCategoryGroup(cat_group);
        f2a_id_mappings[cat_group.id] = id;
        cat_group.id = id;
        bar.increment();
    }
    bar.stop();
    return category_groups;
}

async function add_categories() {
    console.log("adding categories");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(categories.length, 0);
    for (cat of categories.slice().reverse()) {
        cat.group_id = f2a_id_mappings[cat.group_id]
        let id = await api.createCategory(cat);
        f2a_id_mappings[cat.id] = id;
        cat.id = id;
        bar.increment();
    }
    bar.stop();
    categories = await api.getCategories();
    
    // explicitly add income category mapping from server since
    // it isn't included in the above loop
    f2a_id_mappings['income'] = categories.filter((data) => data.name == "Income")[0].id
    return categories;
}

async function add_payees() {
    console.log("adding payees");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(payees.length, 0);
    for (payee of payees) {
        let id = await api.createPayee(payee);
        f2a_id_mappings[payee.id] = id;
        payee.id = id;
        bar.increment();
    }
    bar.stop();
    return payees;
}

async function add_transactions() {
    console.log("adding transactions");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(transactions.length, 0);
    flattened_transactions = transactions.slice();
    for (trans of transactions) {
        // add account information to each subtransaction and push the subtransactions
        // into the flattened_transactions array so we can search across all
        // transactions including splits when looking for transfer matches
        if ("subtransactions" in trans) {
            trans.subtransactions.map((st) => {
                st._account = trans.account
            })
            flattened_transactions.push(...trans.subtransactions)
        }
    }

    for (trans of transactions) {
        // for each transaction, need to update payee, category, account
        // and splits with proper "actual ID" values rather than financier
        if ("account" in trans) {
            trans.account = f2a_id_mappings[trans.account];
        }
        if ("payee" in trans) {
            trans.payee = f2a_id_mappings[trans.payee];
        }
        if ("category" in trans) {
            trans.category = f2a_id_mappings[trans.category];
        }
        
        trans = set_transfer_payee(trans);

        if ("subtransactions" in trans) {
            // need to update category and payee for each sub transaction
            trans.subtransactions = trans.subtransactions.map((trans) => {
                if ("payee" in trans) {
                    trans.payee = f2a_id_mappings[trans.payee];
                }
                if ("category" in trans) {
                    trans.category = f2a_id_mappings[trans.category];
                }
                trans = set_transfer_payee(trans);
                return trans;
            })
        }
        await api.addTransactions(trans["account"], [trans]);
        bar.increment();
    }
    bar.stop();
    return transactions;

}

async function proc_budget_months() {
    function _extract_data(m_category) {
        // pulls out the month and financier category id from the "_id" value
        // of the financier data; returns month, financier category, and corresponding 
        // actual category
        let regexp = /b_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_m_category_([0-9]{4}-[0-9]{2})-[0-9]{2}_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;
        let month = m_category.match(regexp)[1];
        let category_uuid = m_category.match(regexp)[2];
        return [month, category_uuid, f2a_id_mappings[category_uuid]]
    }

    console.log("processing budget amounts");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

    // month categories have "_m_category_" in their _id parameter
    let month_categories = financier_data.filter((data) => data._id.includes('_m_category_'));
    bar.start(month_categories.length, 0);
    for (mc of month_categories) {
        // loop through, extract values, and make actual API calls to set budget values
        let month, financier_category, actual_category;
        [month, financier_category, actual_category] = _extract_data(mc._id);
        let value = mc.budget;
        let carryover = mc.overspending == true;

        // these two API methods set budget information
        // setBudgetAmount(month month, id categoryId, amount value) → Promise<null>
        // setBudgetCarryover(month month, id categoryId, bool flag) → Promise<null>
        await api.setBudgetAmount(month, actual_category, value);
        await api.setBudgetCarryover(month, actual_category, carryover);
        bar.increment();
    }
    bar.stop();
}

(async () => {
    await api.init({
        // Budget data will be cached locally here, in subdirectories for each file.
        dataDir: '.',
        // This is the URL of your running server
        serverURL: process.env.ACTUAL_URL,
        // This is the password you use to log into the server
        password: process.env.ACTUAL_PASSWORD,
    });

    // accounts
    accounts = map_accounts();

    // master categories (groups)
    category_groups = map_category_groups();

    // categories
    categories = map_categories();
    
    // payees
    payees = map_payees();

    // transactions
    // Nov 24, 2023: appears to be working with splits, transfers, and income
    transactions = map_transactions();
    
    // budgets (done in runImport function)

    // TODO:split income transactions not associating correctly

    // TODO:Monthly Interest not getting a category set

    let now = new Date()
    await api.runImport(`${now.toDateString().substring(4).replaceAll(' ', '')}.${now.toTimeString().substring(0,8).replaceAll(':', '')}`,
        async () => {
            accounts  = await add_accounts(); // also adds "id" parameter to accounts
            category_groups = await add_category_groups(); 
            categories = await add_categories();            
            payees = await add_payees();
            server_payees = await api.getPayees();
            transactions = await add_transactions();
            budgets = await proc_budget_months();
        }
    )

    await api.shutdown();
  })();
