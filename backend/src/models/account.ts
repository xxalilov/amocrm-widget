import { DataTypes, Model, Optional, Sequelize } from "sequelize";
import { Account } from "../interfaces/account";

export type AccountCreationAttributes = Optional<Account, 'id' | 'expires_at'>;

export class AccountModel extends Model<Account, AccountCreationAttributes> implements Account {
    public id: string;
    public name: string;
    public subdomain: string;
    public access_token: string;
    public refresh_token: string;
    public expires_at: number;
}

export default function (sequelize: Sequelize): typeof AccountModel {
    AccountModel.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        subdomain: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        access_token: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        refresh_token: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        tableName: 'accounts',
        sequelize,
    })

    return AccountModel;
}