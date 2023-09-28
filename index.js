require('dotenv').config()
const cliProgress = require('cli-progress');

let api = require('@actual-app/api');
let data = require(process.env.FINANCIER_JSON);

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



// financier             actual
// master category <-> category group
// category        <-> category
// account         <-> account

function map_accounts(financier_data) {
    // massages financier export data to get a list of accounts to be uploaded to AB
    let account_data = financier_data.filter((data) => data._id.includes('_account_'));
    account_data = account_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    let AB_accounts = account_data.map((data) => {
        let ABAccount = {
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

function map_category_groups(financier_data) {
    let cat_data = financier_data.filter((data) => data._id.includes('_master-category_'))
    cat_data = cat_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    let AB_category_groups = cat_data.map((data) => {
        return {
            "name": data['name'],
            "financier_id": data["_id"]
        };
    })
    return AB_category_groups;
}

function map_categories(financier_data) {
    // AB categories require "name" and "group_id", but we 
    // won't have group IDs until after adding to the budget
    let cat_data = financier_data.filter((data) => data._id.includes('_category_') & !data._id.includes('_m_category_'))
    cat_data = cat_data.sort((a1, a2) => (a1.sort > a2.sort) ? 1 : (a1.sort < a2.sort) ? -1 : 0)
    return cat_data
}

async function add_accounts(AB_accounts) {
    console.log("adding accounts to budget")
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(AB_accounts.length, 0);
    for (account of AB_accounts) {
        let id = await api.createAccount(account, 0);
        account.id = id;
        bar.increment();
    }
    bar.stop();
    return AB_accounts
}

async function add_category_groups(AB_category_groups) {
    console.log("adding category groups");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(AB_category_groups.length, 0);
    for (cat_group of AB_category_groups) {
        let id = await api.createCategoryGroup(cat_group);
        cat_group.id = id;
        bar.increment();
    }
    bar.stop();
    return AB_category_groups;
}

async function add_categories(cat_data, cat_group_data) {
    console.log("adding categories");
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(cat_data.length, 0);
    for (cat of cat_data) {
        let group_id = cat_group_data.filter((data) => data.financier_id.includes(cat['masterCategory']))[0]['id]']
        category_obj = {
            "name": cat['name'], 
            "group_id": cat_group_data.filter((data) => data.financier_id.includes(cat['masterCategory']))[0]['id']
        }
        let id = await api.createCategory(category_obj);
        cat.id = id;
        bar.increment();
    }
    bar.stop();
    return cat_data;
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
    let AB_accounts = map_accounts(data);

    // master categories (groups)
    let AB_category_groups = map_category_groups(data);

    // categories
    let cat_data = map_categories(data);
    
    // payees
    // transactions
    // budgets

    await api.runImport('new-budget', async () => {
        AB_accounts  = await add_accounts(AB_accounts); // also adds "id" parameter to accounts
        AB_category_groups = await add_category_groups(AB_category_groups);
        AB_categories = await add_categories(cat_data, AB_category_groups);
        console.log();
    })

    await api.shutdown();
  })();
