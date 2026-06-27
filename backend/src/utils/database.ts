import { Sequelize } from "sequelize";
import dotenv from "dotenv";

import  AccountModel  from "../models/account";
import  ContactSettingsModel  from "../models/contact-settings";
import  LeadSettingsModel  from "../models/lead-settings";
import  CompanySettingsModel  from "../models/company-settings";
import  MergeHistoryModel  from "../models/merge-history";
import  ScanStatModel  from "../models/scan-stat";
import  AutoStateModel  from "../models/auto-state";

dotenv.config();


export const sequelize = new Sequelize(
    process.env.DB_NAME!,
    process.env.DB_USER!,
    process.env.DB_PASSWORD!,
    {
        host: process.env.DB_HOST,
        dialect: 'postgres',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
        logging: false,
        pool: {
            max: 20,
            min: 2,
            acquire: 30_000,
            idle: 10_000,
        },
    }
);

const DB = async function() {
    await sequelize.authenticate();
    await sequelize.sync({force: false});
    // sync({force:false}) creates missing tables but never adds columns to an
    // existing one. Ensure the widget_key column exists on older databases.
    await sequelize.query(
        'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS widget_key VARCHAR UNIQUE'
    ).catch((err) => console.warn('widget_key column check:', err.message));
    // "merged" tag after a real merge (added later — see contact/lead settings).
    // Columns are camelCase, so they must be quoted.
    for (const table of ['contact_settings', 'lead_settings']) {
        await sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "addMergedTag" BOOLEAN NOT NULL DEFAULT false`
        ).catch((err) => console.warn(`${table}.addMergedTag column check:`, err.message));
        await sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "mergedTag" VARCHAR NOT NULL DEFAULT 'merged'`
        ).catch((err) => console.warn(`${table}.mergedTag column check:`, err.message));
        // Background auto-merge (browser-driven): enable flag + interval in minutes.
        await sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "autoMerge" BOOLEAN NOT NULL DEFAULT false`
        ).catch((err) => console.warn(`${table}.autoMerge column check:`, err.message));
        await sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "autoInterval" INTEGER NOT NULL DEFAULT 5`
        ).catch((err) => console.warn(`${table}.autoInterval column check:`, err.message));
    }
    // Lead status (stage) filter — CSV of status ids, empty = all statuses.
    await sequelize.query(
        `ALTER TABLE lead_settings ADD COLUMN IF NOT EXISTS "checkStatuses" VARCHAR NOT NULL DEFAULT ''`
    ).catch((err) => console.warn('lead_settings.checkStatuses column check:', err.message));
    // Company duplicate handling shares the contact-style 'type' enum on the
    // stats/history/auto tables — extend those enums with 'company' on older DBs
    // (sync never alters an existing enum). ADD VALUE IF NOT EXISTS is idempotent.
    for (const enumType of ['enum_scan_stats_type', 'enum_merge_history_type', 'enum_auto_states_type']) {
        await sequelize.query(
            `ALTER TYPE "${enumType}" ADD VALUE IF NOT EXISTS 'company'`
        ).catch((err) => console.warn(`${enumType} add 'company':`, err.message));
    }
    console.log('Database connected successfully');
}

const Account = AccountModel(sequelize);
const ContactSettings = ContactSettingsModel(sequelize);
const LeadSettings = LeadSettingsModel(sequelize);
const CompanySettings = CompanySettingsModel(sequelize);
const MergeHistory = MergeHistoryModel(sequelize);
const ScanStat = ScanStatModel(sequelize);
const AutoState = AutoStateModel(sequelize);
Account.hasOne(ContactSettings, { foreignKey: 'account', as: 'contactSettingsData' });
Account.hasOne(LeadSettings, { foreignKey: 'account', as: 'leadSettingsData' });
Account.hasOne(CompanySettings, { foreignKey: 'account', as: 'companySettingsData' });
Account.hasMany(MergeHistory, { foreignKey: 'account', as: 'mergeHistory' });
Account.hasMany(ScanStat, { foreignKey: 'account', as: 'scanStats' });
Account.hasMany(AutoState, { foreignKey: 'account', as: 'autoStates' });
ContactSettings.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
LeadSettings.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
CompanySettings.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
MergeHistory.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
ScanStat.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
AutoState.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
export const models = {
    Account,
    ContactSettings,
    LeadSettings,
    CompanySettings,
    MergeHistory,
    ScanStat,
    AutoState,
}

export default DB;