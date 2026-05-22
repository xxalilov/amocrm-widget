import { Sequelize } from "sequelize";
import dotenv from "dotenv";

import  AccountModel  from "../models/account";
import  ContactSettingsModel  from "../models/contact-settings";
import  LeadSettingsModel  from "../models/lead-settings";
import  MergeHistoryModel  from "../models/merge-history";

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
    try {
        await sequelize.sync({force: false});
        console.log('Database connected successfully');
    } catch (error) {
        console.log(error);
    }
}

const Account = AccountModel(sequelize);
const ContactSettings = ContactSettingsModel(sequelize);
const LeadSettings = LeadSettingsModel(sequelize);
const MergeHistory = MergeHistoryModel(sequelize);
Account.hasOne(ContactSettings, { foreignKey: 'account', as: 'contactSettingsData' });
Account.hasOne(LeadSettings, { foreignKey: 'account', as: 'leadSettingsData' });
Account.hasMany(MergeHistory, { foreignKey: 'account', as: 'mergeHistory' });
ContactSettings.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
LeadSettings.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
MergeHistory.belongsTo(Account, { foreignKey: 'account', as: 'accountData' });
export const models = {
    Account,
    ContactSettings,
    LeadSettings,
    MergeHistory,
}

export default DB;